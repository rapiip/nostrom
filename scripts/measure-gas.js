/**
 * Measures the gas costs that matter for planning a Nostrom deployment.
 *
 *   npx hardhat run scripts/measure-gas.js
 */

const { ethers } = require("hardhat");

async function main() {
  const [deployer, user] = await ethers.getSigners();
  const agent = ethers.Wallet.createRandom().address;
  const recovery = ethers.Wallet.createRandom().address;

  const rows = [];

  // --- Factory deployment (you pay this once) -------------------------------
  const Factory = await ethers.getContractFactory("NostromFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  const factoryReceipt = await ethers.provider.getTransactionReceipt(
    factory.deploymentTransaction().hash
  );
  rows.push(["NostromFactory deploy (once, includes implementation)", factoryReceipt.gasUsed]);

  // --- Per-user vault creation ---------------------------------------------
  const createTx = await factory.connect(user).createVault(agent, recovery, 86400);
  const createReceipt = await createTx.wait();
  rows.push(["createVault (per user)", createReceipt.gasUsed]);

  const fundTx = await factory
    .connect(user)
    .createVaultAndFund(ethers.Wallet.createRandom().address, recovery, 86400, {
      value: ethers.parseEther("1"),
    });
  rows.push(["createVaultAndFund (per user)", (await fundTx.wait()).gasUsed]);

  const detTx = await factory
    .connect(user)
    .createVaultDeterministic(ethers.Wallet.createRandom().address, recovery, 86400, ethers.id("s1"));
  rows.push(["createVaultDeterministic (per user)", (await detTx.wait()).gasUsed]);

  // --- Runtime operations --------------------------------------------------
  const vaultAddress = (await factory.vaultsOf(user.address))[0];
  const vault = await ethers.getContractAt("NostromVault", vaultAddress);

  const agentSigner = ethers.Wallet.createRandom().connect(ethers.provider);
  await deployer.sendTransaction({ to: agentSigner.address, value: ethers.parseEther("1") });
  await vault.connect(user).updateAgentAddress(agentSigner.address);

  const ping1 = await (await vault.connect(agentSigner).ping()).wait();
  rows.push(["ping() first call", ping1.gasUsed]);

  const ping2 = await (await vault.connect(agentSigner).ping()).wait();
  rows.push(["ping() steady state (the recurring cost)", ping2.gasUsed]);

  await deployer.sendTransaction({ to: vaultAddress, value: ethers.parseEther("5") });
  rows.push(["fund vault via plain transfer", 0n]); // measured below

  const depositReceipt = await (await vault.connect(user).deposit({ value: ethers.parseEther("1") })).wait();
  rows[rows.length - 1] = ["deposit()", depositReceipt.gasUsed];

  // --- Rescue --------------------------------------------------------------
  await ethers.provider.send("evm_increaseTime", [86401]);
  await ethers.provider.send("evm_mine", []);
  const execReceipt = await (await vault.connect(deployer).executeDeadManSwitch()).wait();
  rows.push(["executeDeadManSwitch() native only", execReceipt.gasUsed]);

  // --- Standalone comparison ----------------------------------------------
  const Standalone = await ethers.getContractFactory("Nostrom");
  const standalone = await Standalone.deploy(agent, recovery, 86400);
  await standalone.waitForDeployment();
  const standaloneReceipt = await ethers.provider.getTransactionReceipt(
    standalone.deploymentTransaction().hash
  );
  rows.push(["(comparison) standalone Nostrom.sol deploy", standaloneReceipt.gasUsed]);

  // --- Report --------------------------------------------------------------
  const width = Math.max(...rows.map(([label]) => label.length));
  console.log("\nGas costs\n" + "=".repeat(width + 14));
  for (const [label, gas] of rows) {
    console.log(`${label.padEnd(width)}  ${gas.toString().padStart(10)}`);
  }
  console.log("=".repeat(width + 14));

  const create = rows.find((r) => r[0] === "createVault (per user)")[1];
  const savings = ((standaloneReceipt.gasUsed - create) * 100n) / standaloneReceipt.gasUsed;
  console.log(
    `\nCreating a vault via the factory costs ${savings}% less gas than deploying a vault outright.\n`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
