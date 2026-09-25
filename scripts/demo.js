/**
 * Nostrom end-to-end lifecycle demo.
 *
 * Walks the full story in one command: fund -> healthy heartbeat -> agent dies
 * -> permissionless rescue. Designed for a hackathon demo and as a smoke test
 * of the whole system.
 *
 *   npx hardhat run scripts/demo.js                      # in-process network
 *   npx hardhat run scripts/demo.js --network localhost   # against a local node
 *
 * Uses a 60-second timeout and fast-forwards the chain clock, so the whole
 * demo runs in seconds. On a real BOT Chain deployment you cannot skip time;
 * use a short TIMEOUT_PERIOD there instead.
 */

const hre = require("hardhat");
const { ethers, network } = hre;

const TIMEOUT = 60n;
const FUNDING = ethers.parseEther("5");

const line = (char = "─") => console.log(char.repeat(66));
const step = (n, title) => {
  console.log("");
  line();
  console.log(`  STEP ${n}: ${title}`);
  line();
};

/** Advance the chain clock. Only possible on a dev network. */
async function fastForward(seconds) {
  await network.provider.send("evm_increaseTime", [Number(seconds)]);
  await network.provider.send("evm_mine", []);
}

async function main() {
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);

  if (chainId === 968 || chainId === 677) {
    throw new Error(
      "This demo fast-forwards the chain clock and cannot run against real BOT Chain. " +
        "Use the hardhat or localhost network."
    );
  }

  const [owner, agent, recovery, keeper] = await ethers.getSigners();

  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║  NOSTROM: Dead-Man's Switch demo for AI agent treasuries        ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  console.log(`\nNetwork  : ${network.name} (chainId ${chainId})`);
  console.log(`Owner    : ${owner.address}`);
  console.log(`Agent    : ${agent.address}`);
  console.log(`Recovery : ${recovery.address}`);
  console.log(`Keeper   : ${keeper.address}  (an unrelated third party)`);

  // ---------------------------------------------------------------------
  step(1, "Deploy the vault with a 60-second heartbeat timeout");

  const Nostrom = await ethers.getContractFactory("Nostrom");
  const nostrom = await Nostrom.deploy(agent.address, recovery.address, TIMEOUT);
  await nostrom.waitForDeployment();
  const vault = await nostrom.getAddress();

  console.log(`Vault deployed at ${vault}`);
  console.log(`Timeout period   : ${await nostrom.timeoutPeriod()}s`);

  // ---------------------------------------------------------------------
  step(2, "Fund the treasury");

  await (await owner.sendTransaction({ to: vault, value: FUNDING })).wait();
  console.log(`Vault balance    : ${ethers.formatEther(await nostrom.vaultBalance())} BOT`);

  // ---------------------------------------------------------------------
  step(3, "Agent is healthy: heartbeats keep the switch disarmed");

  for (let i = 1; i <= 3; i += 1) {
    await fastForward(20n);
    await (await nostrom.connect(agent).ping()).wait();
    console.log(
      `  ping #${i} ok  ->  ${await nostrom.timeUntilTrigger()}s of grace remaining, ` +
        `executable=${await nostrom.isExecutable()}`
    );
  }

  console.log("\nA keeper trying to fire the switch right now is rejected:");
  try {
    await nostrom.connect(keeper).executeDeadManSwitch.staticCall();
    console.log("  UNEXPECTED: the call succeeded.");
  } catch (error) {
    console.log(`  reverted as expected -> ${error.shortMessage ?? error.message}`);
  }

  // ---------------------------------------------------------------------
  step(4, "The agent goes dark (process crash, lost key, compromise)");

  console.log("No more pings. Fast-forwarding past the timeout...");
  await fastForward(TIMEOUT + 5n);

  console.log(`  timeUntilTrigger : ${await nostrom.timeUntilTrigger()}s`);
  console.log(`  isExecutable     : ${await nostrom.isExecutable()}`);

  // ---------------------------------------------------------------------
  step(5, "Anyone can now rescue the treasury");

  const recoveryBefore = await ethers.provider.getBalance(recovery.address);
  const rescuable = await nostrom.vaultBalance();

  console.log(`Keeper ${keeper.address}`);
  console.log("calls executeDeadManSwitch(): it is not the owner and not the agent.\n");

  const tx = await nostrom.connect(keeper).executeDeadManSwitch();
  const receipt = await tx.wait();

  const recoveryAfter = await ethers.provider.getBalance(recovery.address);
  const moved = recoveryAfter - recoveryBefore;

  console.log(`  tx               : ${tx.hash}`);
  console.log(`  gas used         : ${receipt.gasUsed}`);
  console.log(`  rescued          : ${ethers.formatEther(moved)} BOT`);
  console.log(`  vault balance    : ${ethers.formatEther(await nostrom.vaultBalance())} BOT`);
  console.log(`  isTriggered      : ${await nostrom.isTriggered()}`);

  // ---------------------------------------------------------------------
  step(6, "Post-trigger the vault is frozen for everyone");

  for (const [label, call] of [
    ["owner withdrawal", () => nostrom.connect(owner).withdrawByOwner(1n)],
    ["agent heartbeat", () => nostrom.connect(agent).ping()],
    ["second execution", () => nostrom.connect(keeper).executeDeadManSwitch()],
  ]) {
    try {
      await call();
      console.log(`  ${label.padEnd(18)}-> UNEXPECTEDLY ALLOWED`);
    } catch (error) {
      const reason = (error.shortMessage ?? error.message).replace(/^.*reverted with /, "");
      console.log(`  ${label.padEnd(18)}-> blocked (${reason})`);
    }
  }

  // ---------------------------------------------------------------------
  line("═");
  if (moved !== rescuable || !(await nostrom.isTriggered())) {
    throw new Error("Demo assertion failed: funds did not reach the recovery address.");
  }
  console.log(`  RESULT: ${ethers.formatEther(rescuable)} BOT reached the cold wallet`);
  console.log("          without the owner ever coming online.");
  line("═");
  console.log("");
}

main().catch((error) => {
  console.error(`\nDemo failed: ${error.message ?? error}`);
  process.exitCode = 1;
});
