/**
 * Read-only Nostrom vault inspector.
 *
 *   npx hardhat run scripts/status.js --network botchainTestnet
 *
 * Requires NOSTROM_ADDRESS in .env.
 */

const hre = require("hardhat");
require("dotenv").config();

const { ethers } = hre;

function formatDuration(seconds) {
  const s = Number(seconds);
  if (s <= 0) return "0s";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (sec || !parts.length) parts.push(`${sec}s`);
  return parts.join(" ");
}

async function main() {
  const address = process.env.NOSTROM_ADDRESS;
  if (!address || !ethers.isAddress(address)) {
    throw new Error("Set NOSTROM_ADDRESS in .env to a valid vault address.");
  }

  const network = await ethers.provider.getNetwork();
  const nostrom = await ethers.getContractAt("Nostrom", address);
  const s = await nostrom.status();
  const tokens = await nostrom.trackedTokens();

  console.log("\n=== Nostrom vault status ===");
  console.log(`Vault           : ${address}`);
  console.log(`Chain ID        : ${network.chainId}`);
  console.log("");
  console.log(`Owner           : ${s.vaultOwner}`);
  console.log(`Agent           : ${s.agent}`);
  console.log(`Recovery        : ${s.recovery}`);
  console.log("");
  console.log(`Balance         : ${ethers.formatEther(s.balance)} BOT`);
  console.log(`Timeout period  : ${s.timeout} s (${formatDuration(s.timeout)})`);
  console.log(`Total pings     : ${s.totalPings}`);
  console.log(`Last ping       : ${new Date(Number(s.lastPing) * 1000).toISOString()}`);
  console.log(`Trigger deadline: ${new Date(Number(s.deadline) * 1000).toISOString()}`);
  console.log("");

  if (s.triggered) {
    console.log("STATE           : TRIGGERED: funds were evacuated to the recovery address.");
  } else if (s.executable) {
    console.log("STATE           : EXPIRED: anyone can call executeDeadManSwitch() right now.");
  } else {
    console.log(`STATE           : HEALTHY: ${formatDuration(s.secondsRemaining)} of grace left.`);
  }

  if (tokens.length > 0) {
    console.log(`\nTracked ERC-20s (${tokens.length}):`);
    for (const token of tokens) {
      console.log(`  - ${token}`);
    }
  } else {
    console.log("\nTracked ERC-20s : none (native BOT is always rescued)");
  }
  console.log("");
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
