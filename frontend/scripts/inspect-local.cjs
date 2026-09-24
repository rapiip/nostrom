/**
 * Dumps live state of every registered vault, plus the node's pending mempool.
 * Diagnostic aid when a flow in verify-flows.cjs behaves unexpectedly.
 *
 *   npx hardhat run frontend/scripts/inspect-local.cjs --network localhost
 */
const hre = require("hardhat");
const { ethers } = hre;

const FACTORY = process.env.SEED_FACTORY || "0x5FbDB2315678afecb367f032d93F642f64180aa3";

async function main() {
  const factory = await ethers.getContractAt("NostromFactory", FACTORY);
  const total = await factory.totalVaults();
  const all = await factory.getVaults(0, 100);

  const block = await ethers.provider.getBlock("latest");
  console.log(`\nblock #${block.number}  timestamp ${block.timestamp}  (${new Date(block.timestamp * 1000).toISOString()})`);
  console.log(`totalVaults: ${total}\n`);

  for (const addr of all) {
    const v = await ethers.getContractAt("NostromVault", addr);
    const s = await v.status();
    const state = s.triggered ? "TRIGGERED" : s.executable ? "EXECUTABLE" : "ALIVE";
    console.log(
      `${addr}  ${state.padEnd(11)} timeout=${s.timeout}s  remaining=${s.secondsRemaining}s  ` +
        `bal=${ethers.formatEther(s.balance)}  pings=${s.totalPings}`,
    );
  }

  const [execList] = await factory.getExecutableVaults(0, 100);
  console.log(`\nexecutable now (${execList.length}):`);
  for (const a of execList) console.log(`  ${a}`);

  const pending = await ethers.provider.send("eth_getBlockByNumber", ["pending", false]);
  console.log(`\npending block txs: ${pending?.transactions?.length ?? "n/a"}`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exitCode = 1;
});
