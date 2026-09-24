/**
 * Seeds a local Hardhat node with a vault in every protocol state, so each
 * frontend branch can be exercised against real chain data rather than fixtures.
 *
 *   npx hardhat node                                                   # terminal 1
 *   npx hardhat run scripts/deploy-factory.js --network localhost       # terminal 2
 *   npx hardhat run frontend/scripts/seed-local.cjs --network localhost
 *
 * Creates: ALIVE (freshly pinged, with a tracked ERC-20), EXPIRING (<20% grace),
 * EXECUTABLE (past deadline), TRIGGERED (switch already fired), EMPTY (unfunded).
 *
 * Addresses are deterministic from a fresh node, so the flow harness can rely on
 * them. Override the factory with SEED_FACTORY if yours differs.
 */
const hre = require("hardhat");
const { ethers } = hre;

const FACTORY = process.env.SEED_FACTORY || "0x5FbDB2315678afecb367f032d93F642f64180aa3";

async function main() {
  const [owner, agent, recovery] = await ethers.getSigners();
  const factory = await ethers.getContractAt("NostromFactory", FACTORY);

  const mk = async (label, timeout, deposit) => {
    const tx = await factory.createVaultAndFund(agent.address, recovery.address, timeout, {
      value: ethers.parseEther(deposit),
    });
    const receipt = await tx.wait();
    const ev = receipt.logs
      .map((l) => {
        try {
          return factory.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((e) => e && e.name === "VaultCreated");
    const addr = ev.args.vault;
    console.log(`${label.padEnd(12)} ${addr}  timeout=${timeout}s  ${deposit} BOT`);
    return await ethers.getContractAt("NostromVault", addr);
  };

  console.log("\nSeeding vaults from", owner.address);
  console.log("agent   ", agent.address);
  console.log("recovery", recovery.address, "\n");

  // ALIVE: long timeout, freshly pinged.
  const alive = await mk("ALIVE", 86400, "12.5");
  await (await alive.connect(agent).ping()).wait();

  // EXPIRING: 300s timeout, then advance 260s so <20% grace remains.
  const expiring = await mk("EXPIRING", 300, "3.25");

  // EXECUTABLE: 60s timeout, will be past deadline after time travel.
  const executable = await mk("EXECUTABLE", 60, "7.0");

  // TRIGGERED: fire the switch.
  const triggered = await mk("TRIGGERED", 30, "1.5");

  // EMPTY: armed but unfunded.
  await mk("EMPTY", 86400, "0");

  // Tracked ERC-20 on the alive vault, to exercise the watchlist.
  const Token = await ethers.getContractFactory("MockERC20");
  const token = await Token.deploy("Test USD", "TUSD");
  await token.waitForDeployment();
  await (await token.mint(await alive.getAddress(), ethers.parseEther("2500"))).wait();
  await (await alive.addTrackedToken(await token.getAddress())).wait();
  console.log("token       ", await token.getAddress(), "(TUSD, tracked on ALIVE vault)");

  // Advance time so EXPIRING is nearly out and EXECUTABLE/TRIGGERED are lapsed.
  await ethers.provider.send("evm_increaseTime", [260]);
  await ethers.provider.send("evm_mine", []);

  await (await triggered.connect(owner).executeDeadManSwitch()).wait();
  console.log("\nTRIGGERED vault fired.");

  const s = await executable.status();
  console.log("EXECUTABLE isExecutable:", s.executable);
  const e = await expiring.status();
  console.log("EXPIRING grace remaining:", e.secondsRemaining.toString(), "s of 300");

  console.log("\ntotalVaults:", (await factory.totalVaults()).toString());
  console.log("executable now:", (await factory.getExecutableVaults(0, 100))[0]);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
