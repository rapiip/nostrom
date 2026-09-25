/**
 * Gas tuning harness.
 *
 * Deploy cost is dominated by bytecode size (200 gas per byte) plus execution of
 * the constructor. Runtime cost is dominated by how aggressively the optimizer
 * inlined hot paths. Those two pull in OPPOSITE directions, so the only honest
 * way to pick settings is to measure both for each candidate.
 *
 * Run:  node scripts/tune-gas.js
 */
const { execSync } = require("node:child_process");

const CANDIDATES = [
  { runs: 1, evm: "paris" },
  { runs: 10, evm: "paris" },
  { runs: 50, evm: "paris" },
  { runs: 200, evm: "paris" }, // current
  { runs: 1000, evm: "paris" },
  { runs: 200, evm: "cancun" },
  { runs: 1, evm: "cancun" },
];

const PROBE = `
const hre = require("hardhat");
(async () => {
  const [d] = await hre.ethers.getSigners();

  const F = await hre.ethers.getContractFactory("NostromFactory");
  const f = await F.deploy();
  await f.waitForDeployment();
  const factoryGas = (await hre.ethers.provider.getTransactionReceipt(
    f.deploymentTransaction().hash)).gasUsed;

  const agent = hre.ethers.Wallet.createRandom().address;
  const rec = hre.ethers.Wallet.createRandom().address;
  const createGas = (await (await f.createVault(agent, rec, 86400)).wait()).gasUsed;

  const vaultAddr = (await f.getVaultsOf(d.address, 0, 1))[0];
  const vault = await hre.ethers.getContractAt("NostromVault", vaultAddr);

  // ping() must be sent by the agent key, so impersonate it.
  await hre.network.provider.send("hardhat_setBalance",
    [agent, "0x56BC75E2D63100000"]);
  await hre.network.provider.send("hardhat_impersonateAccount", [agent]);
  const agentSigner = await hre.ethers.getSigner(agent);
  const pingGas = (await (await vault.connect(agentSigner).ping()).wait()).gasUsed;

  const S = await hre.ethers.getContractFactory("Nostrom");
  const s = await S.deploy(agent, rec, 86400);
  await s.waitForDeployment();
  const soloGas = (await hre.ethers.provider.getTransactionReceipt(
    s.deploymentTransaction().hash)).gasUsed;

  const size = (await hre.artifacts.readArtifact("NostromFactory"))
    .deployedBytecode.length / 2 - 1;

  console.log("RESULT:" + JSON.stringify({
    factory: Number(factoryGas), create: Number(createGas),
    ping: Number(pingGas), solo: Number(soloGas), size,
  }));
})().catch((e) => { console.error(e.message); process.exit(1); });
`;

require("node:fs").writeFileSync("gas-probe.cjs", PROBE);

const rows = [];
for (const c of CANDIDATES) {
  process.stdout.write(`measuring runs=${String(c.runs).padEnd(4)} evm=${c.evm.padEnd(7)} ... `);
  try {
    execSync("npx hardhat compile --force", {
      env: { ...process.env, GAS_RUNS: String(c.runs), GAS_EVM: c.evm },
      stdio: "pipe",
    });
    const out = execSync("npx hardhat run gas-probe.cjs", {
      env: { ...process.env, GAS_RUNS: String(c.runs), GAS_EVM: c.evm },
      encoding: "utf8",
      stdio: "pipe",
    });
    const line = out.split("\n").find((l) => l.startsWith("RESULT:"));
    if (!line) throw new Error("no result");
    rows.push({ ...c, ...JSON.parse(line.slice(7)) });
    console.log("ok");
  } catch (e) {
    console.log("FAILED: " + String(e.message).split("\n")[0].slice(0, 60));
    rows.push({ ...c, failed: true });
  }
}

require("node:fs").unlinkSync("gas-probe.cjs");

const base = rows.find((r) => r.runs === 200 && r.evm === "paris" && !r.failed);

console.log("\n" + "=".repeat(86));
console.log(
  "runs".padEnd(6) + "evm".padEnd(8) + "factory".padStart(10) +
  "createVault".padStart(13) + "ping".padStart(8) +
  "standalone".padStart(12) + "codesize".padStart(10) + "  vs base",
);
console.log("=".repeat(86));
for (const r of rows) {
  if (r.failed) {
    console.log(String(r.runs).padEnd(6) + r.evm.padEnd(8) + "  UNSUPPORTED ON THIS EVM");
    continue;
  }
  const delta = base ? (((r.factory - base.factory) / base.factory) * 100).toFixed(1) : "-";
  const mark = r.runs === 200 && r.evm === "paris" ? "  <- current" : "";
  console.log(
    String(r.runs).padEnd(6) + r.evm.padEnd(8) +
    String(r.factory).padStart(10) + String(r.create).padStart(13) +
    String(r.ping).padStart(8) + String(r.solo).padStart(12) +
    String(r.size).padStart(10) +
    (delta === "-" ? "" : `  ${delta > 0 ? "+" : ""}${delta}%`) + mark,
  );
}
console.log("=".repeat(86));
