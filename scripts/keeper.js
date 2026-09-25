/**
 * Nostrom keeper / watchtower.
 *
 * Polls a vault and calls the permissionless executeDeadManSwitch() as soon as
 * the agent's heartbeat has lapsed. Anyone can run this — that is the whole
 * point of permissionless execution: recovery does not depend on the owner
 * being online.
 *
 *   node scripts/keeper.js
 *   node scripts/keeper.js --once          # single check, no loop
 *   node scripts/keeper.js --dry-run       # report only, never send a tx
 *
 * Env: NOSTROM_ADDRESS, BOTCHAIN_TESTNET_RPC (or --rpc), PRIVATE_KEY (keeper gas payer)
 */

const { ethers } = require("ethers");
require("dotenv").config();

const NOSTROM_ABI = [
  "function executeDeadManSwitch() external",
  "function isExecutable() view returns (bool)",
  "function isTriggered() view returns (bool)",
  "function timeUntilTrigger() view returns (uint256)",
  "function recoveryAddress() view returns (address)",
  "function vaultBalance() view returns (uint256)",
  "event DeadManSwitchTriggered(address indexed recoveryAddress, uint256 amountRescued, uint256 timestamp)",
];

const args = process.argv.slice(2);
const ONCE = args.includes("--once");
const DRY_RUN = args.includes("--dry-run");
const rpcFlagIndex = args.indexOf("--rpc");

const RPC_URL =
  (rpcFlagIndex !== -1 ? args[rpcFlagIndex + 1] : null) ||
  process.env.BOTCHAIN_TESTNET_RPC ||
  "https://rpc.bohr.life";

const VAULT = process.env.NOSTROM_ADDRESS;
const POLL_SECONDS = Number(process.env.KEEPER_POLL_SECONDS || 30);

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

async function checkOnce(vault, signer) {
  const triggered = await vault.isTriggered();
  if (triggered) {
    log("Vault already triggered. Nothing to do.");
    return "done";
  }

  const executable = await vault.isExecutable();
  if (!executable) {
    const remaining = await vault.timeUntilTrigger();
    log(`Agent alive. ${remaining}s of grace remaining.`);
    return "waiting";
  }

  const balance = await vault.vaultBalance();
  const recovery = await vault.recoveryAddress();
  log(`HEARTBEAT LAPSED. ${ethers.formatEther(balance)} BOT would go to ${recovery}.`);

  if (DRY_RUN || !signer) {
    log(DRY_RUN ? "Dry run — not sending." : "No PRIVATE_KEY configured — cannot send.");
    return "waiting";
  }

  log("Calling executeDeadManSwitch()...");
  const tx = await vault.executeDeadManSwitch();
  log(`Tx sent: ${tx.hash}`);
  const receipt = await tx.wait();
  log(`Confirmed in block ${receipt.blockNumber}. Treasury evacuated.`);
  return "done";
}

async function main() {
  if (!VAULT || !ethers.isAddress(VAULT)) {
    throw new Error("Set NOSTROM_ADDRESS in .env to a valid vault address.");
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const network = await provider.getNetwork();

  let signer = null;
  if (process.env.PRIVATE_KEY && !DRY_RUN) {
    signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  }

  const vault = new ethers.Contract(VAULT, NOSTROM_ABI, signer ?? provider);

  log(`Keeper watching ${VAULT} on chainId ${network.chainId}`);
  if (signer) log(`Keeper account: ${signer.address}`);
  if (DRY_RUN) log("Mode: DRY RUN");

  if (ONCE) {
    await checkOnce(vault, signer);
    return;
  }

  for (;;) {
    try {
      const result = await checkOnce(vault, signer);
      if (result === "done") return;
    } catch (error) {
      log(`Check failed: ${error.shortMessage ?? error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_SECONDS * 1000));
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
