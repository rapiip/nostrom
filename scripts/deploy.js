/**
 * Nostrom deployment script for BOT Chain.
 *
 *   npx hardhat run scripts/deploy.js --network botchainTestnet   # chainId 968
 *   npx hardhat run scripts/deploy.js --network botchainMainnet   # chainId 677
 *
 * Reads AGENT_ADDRESS, RECOVERY_ADDRESS and TIMEOUT_PERIOD from .env.
 * BOT Chain is EVM-compatible, so this is plain Hardhat + ethers v6.
 */

const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
require("dotenv").config();

const { ethers } = hre;

// Network metadata from https://dev-docs.botchain.ai/docs/Developers/quick-guide/
const BOTCHAIN = {
  968: { name: "BOT Chain Testnet", explorer: "https://scan.bohr.life", symbol: "BOT" },
  677: { name: "BOT Chain Mainnet", explorer: "https://scan.botchain.ai", symbol: "BOT" },
};

function requireAddress(label, value) {
  if (!value) {
    throw new Error(`Missing ${label}. Set it in your .env file (see .env.example).`);
  }
  if (!ethers.isAddress(value)) {
    throw new Error(`${label} is not a valid address: ${value}`);
  }
  return ethers.getAddress(value);
}

function formatDuration(seconds) {
  const s = Number(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!parts.length) parts.push(`${s}s`);
  return parts.join(" ");
}

async function main() {
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const chain = BOTCHAIN[chainId];

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No signer available. Set PRIVATE_KEY in .env.");
  }

  // ---- Constructor arguments -------------------------------------------------
  const agentAddress = requireAddress("AGENT_ADDRESS", process.env.AGENT_ADDRESS);
  const recoveryAddress = requireAddress("RECOVERY_ADDRESS", process.env.RECOVERY_ADDRESS);
  const timeoutPeriod = BigInt(process.env.TIMEOUT_PERIOD || "86400");

  if (timeoutPeriod < 30n) throw new Error("TIMEOUT_PERIOD must be at least 30 seconds.");
  if (timeoutPeriod > 31536000n) throw new Error("TIMEOUT_PERIOD must be at most 365 days.");

  // Mirror the constructor's safety checks so we fail before spending gas.
  if (recoveryAddress === agentAddress) {
    throw new Error("RECOVERY_ADDRESS must differ from AGENT_ADDRESS (the agent key is the hot key).");
  }
  if (agentAddress === deployer.address) {
    console.warn(
      "WARNING: AGENT_ADDRESS equals the deployer/owner address. " +
        "Losing that one key means losing both the agent and the owner role."
    );
  }

  const balance = await ethers.provider.getBalance(deployer.address);
  const symbol = chain?.symbol ?? "ETH";

  console.log("\n=== Nostrom deployment ===");
  console.log(`Network         : ${chain?.name ?? hre.network.name} (chainId ${chainId})`);
  console.log(`Deployer/Owner  : ${deployer.address}`);
  console.log(`Balance         : ${ethers.formatEther(balance)} ${symbol}`);
  console.log(`Agent address   : ${agentAddress}`);
  console.log(`Recovery address: ${recoveryAddress}`);
  console.log(`Timeout period  : ${timeoutPeriod} s (${formatDuration(timeoutPeriod)})`);

  if (balance === 0n) {
    throw new Error(
      chainId === 968
        ? "Deployer has 0 BOT. Fund it from the BOT Chain testnet faucet first."
        : "Deployer has 0 BOT. Fund the account before deploying."
    );
  }

  // ---- Deploy ---------------------------------------------------------------
  console.log("\nDeploying Nostrom...");
  const Nostrom = await ethers.getContractFactory("Nostrom");
  const nostrom = await Nostrom.deploy(agentAddress, recoveryAddress, timeoutPeriod);

  const deployTx = nostrom.deploymentTransaction();
  console.log(`Tx hash         : ${deployTx.hash}`);

  await nostrom.waitForDeployment();
  const address = await nostrom.getAddress();
  const receipt = await ethers.provider.getTransactionReceipt(deployTx.hash);

  console.log(`\nNostrom deployed: ${address}`);
  console.log(`Block           : ${receipt.blockNumber}`);
  console.log(`Gas used        : ${receipt.gasUsed.toString()}`);
  if (chain) {
    console.log(`Explorer        : ${chain.explorer}/address/${address}`);
  }

  // ---- Post-deploy sanity check --------------------------------------------
  const s = await nostrom.status();
  console.log("\n--- On-chain state ---");
  console.log(`owner           : ${s.vaultOwner}`);
  console.log(`agentAddress    : ${s.agent}`);
  console.log(`recoveryAddress : ${s.recovery}`);
  console.log(`timeoutPeriod   : ${s.timeout} s`);
  console.log(`lastPingTime    : ${s.lastPing}`);
  console.log(`deadline        : ${s.deadline} (in ${formatDuration(s.secondsRemaining)})`);
  console.log(`isTriggered     : ${s.triggered}`);

  if (s.vaultOwner !== deployer.address) {
    throw new Error("Post-deploy check failed: owner is not the deployer.");
  }
  if (s.agent !== agentAddress || s.recovery !== recoveryAddress) {
    throw new Error("Post-deploy check failed: constructor arguments did not persist.");
  }
  if (s.timeout !== timeoutPeriod) {
    throw new Error("Post-deploy check failed: timeoutPeriod mismatch.");
  }

  // ---- Persist deployment record ------------------------------------------
  const record = {
    contract: "Nostrom",
    address,
    network: chain?.name ?? hre.network.name,
    chainId,
    owner: deployer.address,
    agentAddress,
    recoveryAddress,
    timeoutPeriod: timeoutPeriod.toString(),
    deploymentBlock: receipt.blockNumber,
    transactionHash: deployTx.hash,
    explorer: chain ? `${chain.explorer}/address/${address}` : null,
    deployedAt: new Date().toISOString(),
    constructorArgs: [agentAddress, recoveryAddress, timeoutPeriod.toString()],
  };

  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${hre.network.name}-${chainId}.json`);
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`\nDeployment record: ${path.relative(process.cwd(), file)}`);

  console.log("\n--- Next steps ---");
  console.log(`1. Add to .env:  NOSTROM_ADDRESS=${address}`);
  console.log(`2. Fund the vault:  send BOT to ${address}`);
  console.log(`3. Start the agent heartbeat:  node agent/nostrom-heartbeat.js`);
  console.log(
    `4. Verify (optional):  npx hardhat verify --network ${hre.network.name} ${address} ${agentAddress} ${recoveryAddress} ${timeoutPeriod}`
  );
  console.log("");
}

main().catch((error) => {
  console.error("\nDeployment failed:");
  console.error(error.message ?? error);
  process.exitCode = 1;
});
