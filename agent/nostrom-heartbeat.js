/**
 * Nostrom heartbeat client (Node.js / ethers v6).
 *
 * Drop-in liveness reporter for an autonomous agent running on BOT Chain.
 * Only depends on `ethers`, so it can be required straight from an agent
 * process without pulling in Hardhat.
 *
 * ── Embed in an agent ──────────────────────────────────────────────────────
 *   const { NostromHeartbeat } = require("./agent/nostrom-heartbeat");
 *
 *   const heartbeat = new NostromHeartbeat({
 *     rpcUrl:       process.env.BOTCHAIN_TESTNET_RPC,
 *     vaultAddress: process.env.NOSTROM_ADDRESS,
 *     privateKey:   process.env.AGENT_PRIVATE_KEY,
 *     intervalSeconds: 3600,
 *   });
 *
 *   await heartbeat.start();          // background loop, pings immediately
 *   // ... agent does its real work ...
 *   await heartbeat.stop();
 *
 * Health-gated variant: only report liveness if the agent is actually well,
 * which is what makes this a real dead-man's switch rather than a cron job:
 *
 *   const heartbeat = new NostromHeartbeat({
 *     ...config,
 *     healthCheck: async () => myAgent.isHealthy(),
 *   });
 *
 * ── Run standalone ─────────────────────────────────────────────────────────
 *   node agent/nostrom-heartbeat.js            # loop forever
 *   node agent/nostrom-heartbeat.js --once     # single ping, then exit
 *   node agent/nostrom-heartbeat.js --status   # read state, send nothing
 */

const { ethers } = require("ethers");

/** Minimal ABI: only what the agent needs. */
const NOSTROM_ABI = [
  "function ping() external",
  "function agentAddress() view returns (address)",
  "function timeoutPeriod() view returns (uint256)",
  "function lastPingTime() view returns (uint256)",
  "function isTriggered() view returns (bool)",
  "function pingCount() view returns (uint256)",
  "function timeUntilTrigger() view returns (uint256)",
  "function executionDeadline() view returns (uint256)",
  "function vaultBalance() view returns (uint256)",
  "event Heartbeat(address indexed agent, uint256 timestamp, uint256 pingCount, uint256 deadline)",
];

const DEFAULTS = {
  rpcUrl: "https://rpc.bohr.life", // BOT Chain testnet (chainId 968)
  intervalSeconds: 3600,
  maxRetries: 3,
  retryDelayMs: 5000,
  confirmations: 1,
  autoTuneInterval: true,
};

class NostromHeartbeat {
  /**
   * @param {object}   config
   * @param {string}   config.vaultAddress     Deployed Nostrom address.
   * @param {string}   config.privateKey       Agent key (must equal on-chain agentAddress).
   * @param {string}  [config.rpcUrl]          BOT Chain RPC endpoint.
   * @param {number}  [config.intervalSeconds] Ping cadence. Auto-capped to timeoutPeriod/3.
   * @param {number}  [config.maxRetries]      Attempts per ping before giving up this cycle.
   * @param {number}  [config.retryDelayMs]    Base backoff between retries.
   * @param {number}  [config.confirmations]   Confirmations to wait for.
   * @param {boolean} [config.autoTuneInterval] Clamp interval against the on-chain timeout.
   * @param {Function}[config.healthCheck]     async () => boolean. Falsy result skips the ping.
   * @param {Function}[config.onPing]          async (info) => void, after a successful ping.
   * @param {Function}[config.onError]         async (error) => void, on a failed cycle.
   * @param {Function}[config.logger]          (level, message) => void.
   */
  constructor(config = {}) {
    const merged = { ...DEFAULTS, ...config };

    if (!merged.vaultAddress || !ethers.isAddress(merged.vaultAddress)) {
      throw new Error("NostromHeartbeat: `vaultAddress` must be a valid address.");
    }
    if (!merged.privateKey) {
      throw new Error("NostromHeartbeat: `privateKey` is required (the agent's heartbeat key).");
    }

    this.config = merged;
    this.provider = new ethers.JsonRpcProvider(merged.rpcUrl);
    this.wallet = new ethers.Wallet(merged.privateKey, this.provider);
    this.vault = new ethers.Contract(merged.vaultAddress, NOSTROM_ABI, this.wallet);

    this.address = this.wallet.address;
    this.running = false;
    this.timer = null;
    this.stats = { pings: 0, failures: 0, lastPingAt: null, lastError: null };
  }

  log(level, message) {
    if (this.config.logger) {
      this.config.logger(level, message);
      return;
    }
    const line = `[nostrom][${new Date().toISOString()}] ${message}`;
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }

  /** Read vault state without sending a transaction. */
  async getStatus() {
    const [timeoutPeriod, lastPingTime, isTriggered, pingCount, secondsRemaining, deadline, balance] =
      await Promise.all([
        this.vault.timeoutPeriod(),
        this.vault.lastPingTime(),
        this.vault.isTriggered(),
        this.vault.pingCount(),
        this.vault.timeUntilTrigger(),
        this.vault.executionDeadline(),
        this.vault.vaultBalance(),
      ]);

    return {
      timeoutPeriod: Number(timeoutPeriod),
      lastPingTime: Number(lastPingTime),
      isTriggered,
      pingCount: Number(pingCount),
      secondsRemaining: Number(secondsRemaining),
      deadline: Number(deadline),
      balance,
      balanceFormatted: `${ethers.formatEther(balance)} BOT`,
      healthy: !isTriggered && Number(secondsRemaining) > 0,
    };
  }

  /**
   * Verify this key is actually the registered agent and the vault is live.
   * Call once at startup: a silent key mismatch means every ping reverts and
   * the switch fires on a perfectly healthy agent.
   */
  async preflight() {
    const network = await this.provider.getNetwork();
    const onChainAgent = await this.vault.agentAddress();

    if (onChainAgent.toLowerCase() !== this.address.toLowerCase()) {
      throw new Error(
        `Key mismatch: vault expects agent ${onChainAgent} but this key is ${this.address}. ` +
          "Every ping would revert."
      );
    }

    const status = await this.getStatus();
    if (status.isTriggered) {
      throw new Error("Vault already triggered: the switch has fired and pings are frozen.");
    }

    const gasBalance = await this.provider.getBalance(this.address);
    if (gasBalance === 0n) {
      throw new Error(
        `Agent ${this.address} holds 0 BOT and cannot pay gas for heartbeats. Fund it.`
      );
    }

    // Auto-tune: ping ~3x per timeout window so two missed txs are survivable.
    if (this.config.autoTuneInterval) {
      const safeInterval = Math.max(10, Math.floor(status.timeoutPeriod / 3));
      if (this.config.intervalSeconds > safeInterval) {
        this.log(
          "warn",
          `Interval ${this.config.intervalSeconds}s is too close to the ${status.timeoutPeriod}s timeout. ` +
            `Reducing to ${safeInterval}s.`
        );
        this.config.intervalSeconds = safeInterval;
      }
    }

    this.log(
      "info",
      `Preflight OK. chainId=${network.chainId} agent=${this.address} ` +
        `timeout=${status.timeoutPeriod}s interval=${this.config.intervalSeconds}s ` +
        `gas=${ethers.formatEther(gasBalance)} BOT vault=${status.balanceFormatted}`
    );

    return status;
  }

  /**
   * Send exactly one heartbeat, with retries.
   * @returns {Promise<{skipped?: boolean, txHash?: string, blockNumber?: number, pingCount?: number, deadline?: number}>}
   */
  async pingOnce() {
    if (this.config.healthCheck) {
      let healthy = false;
      try {
        healthy = await this.config.healthCheck();
      } catch (error) {
        this.log("error", `healthCheck threw: ${error.message}. Treating agent as unhealthy.`);
      }
      if (!healthy) {
        // Deliberately do NOT ping. An unhealthy agent should let the switch arm.
        this.log("warn", "healthCheck failed: withholding heartbeat so the fail-safe can arm.");
        return { skipped: true, reason: "unhealthy" };
      }
    }

    const { maxRetries, retryDelayMs, confirmations } = this.config;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        // Simulate first: catches "triggered" / wrong-key without burning gas.
        await this.vault.ping.staticCall();

        const tx = await this.vault.ping();
        this.log("info", `ping() sent: ${tx.hash} (attempt ${attempt}/${maxRetries})`);

        const receipt = await tx.wait(confirmations);
        const [pingCount, deadline] = await Promise.all([
          this.vault.pingCount(),
          this.vault.executionDeadline(),
        ]);

        this.stats.pings += 1;
        this.stats.lastPingAt = new Date().toISOString();
        this.stats.lastError = null;

        const info = {
          txHash: tx.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
          pingCount: Number(pingCount),
          deadline: Number(deadline),
        };

        this.log(
          "info",
          `Heartbeat #${info.pingCount} confirmed in block ${info.blockNumber}. ` +
            `Next deadline: ${new Date(info.deadline * 1000).toISOString()}`
        );

        if (this.config.onPing) await this.config.onPing(info);
        return info;
      } catch (error) {
        lastError = error;
        const reason = error.shortMessage ?? error.message;

        // Unrecoverable conditions: stop retrying immediately.
        if (/SwitchAlreadyTriggered/.test(reason)) {
          this.log("error", "Vault is triggered. Heartbeats are permanently frozen.");
          this.running = false;
          throw error;
        }
        if (/NotAgent/.test(reason)) {
          this.log("error", `This key (${this.address}) is not the registered agent.`);
          this.running = false;
          throw error;
        }

        this.log("warn", `ping() attempt ${attempt}/${maxRetries} failed: ${reason}`);
        if (attempt < maxRetries) {
          await sleep(retryDelayMs * attempt); // linear backoff
        }
      }
    }

    this.stats.failures += 1;
    this.stats.lastError = lastError?.shortMessage ?? lastError?.message ?? "unknown";
    if (this.config.onError) await this.config.onError(lastError);
    throw lastError;
  }

  /** Start the background heartbeat loop. Pings once immediately. */
  async start() {
    if (this.running) {
      this.log("warn", "Heartbeat already running.");
      return;
    }

    await this.preflight();
    this.running = true;

    const cycle = async () => {
      if (!this.running) return;

      try {
        await this.pingOnce();
      } catch (error) {
        // Already logged. Keep looping unless pingOnce cleared `running`.
        if (!this.running) return;
      }

      if (this.running) {
        this.timer = setTimeout(cycle, this.config.intervalSeconds * 1000);
        if (this.timer.unref) this.timer.unref();
      }
    };

    await cycle();
    this.log("info", `Heartbeat loop started (every ${this.config.intervalSeconds}s).`);
  }

  /** Stop the loop. Existing in-flight transactions are not cancelled. */
  async stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.log("info", `Heartbeat stopped. pings=${this.stats.pings} failures=${this.stats.failures}`);
  }

  getStats() {
    return { ...this.stats, running: this.running, agent: this.address };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { NostromHeartbeat, NOSTROM_ABI };

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
if (require.main === module) {
  require("dotenv").config();

  const args = process.argv.slice(2);

  const heartbeat = new NostromHeartbeat({
    rpcUrl: process.env.BOTCHAIN_TESTNET_RPC || DEFAULTS.rpcUrl,
    vaultAddress: process.env.NOSTROM_ADDRESS,
    privateKey: process.env.AGENT_PRIVATE_KEY,
    intervalSeconds: Number(process.env.PING_INTERVAL_SECONDS || DEFAULTS.intervalSeconds),
  });

  (async () => {
    if (args.includes("--status")) {
      const status = await heartbeat.getStatus();
      console.log(JSON.stringify(status, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
      return;
    }

    if (args.includes("--once")) {
      await heartbeat.preflight();
      await heartbeat.pingOnce();
      return;
    }

    await heartbeat.start();

    const shutdown = async (signal) => {
      console.log(`\nReceived ${signal}, shutting down heartbeat.`);
      await heartbeat.stop();
      process.exit(0);
    };
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    // Keep the process alive for the interval timers.
    setInterval(() => {}, 1 << 30);
  })().catch((error) => {
    console.error(`\nHeartbeat error: ${error.shortMessage ?? error.message}`);
    process.exitCode = 1;
  });
}
