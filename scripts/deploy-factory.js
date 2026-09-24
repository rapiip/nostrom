/**
 * Deploy NostromFactory to BOT Chain.
 *
 *   npx hardhat run scripts/deploy-factory.js --network botchainTestnet   # chainId 968
 *   npx hardhat run scripts/deploy-factory.js --network botchainMainnet   # chainId 677
 *
 * The factory takes no constructor arguments. It deploys the shared vault
 * implementation itself, and has no owner or admin functions afterwards.
 *
 * Deploy this ONCE per network. Users then create their own vaults by calling
 * `createVault(agent, recovery, timeout)` — you do not deploy anything per user.
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

async function main() {
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const chain = BOTCHAIN[chainId];
  const symbol = chain?.symbol ?? "ETH";

  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No signer available. Set PRIVATE_KEY in .env.");

  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("\n=== NostromFactory deployment ===");
  console.log(`Network  : ${chain?.name ?? hre.network.name} (chainId ${chainId})`);
  console.log(`Deployer : ${deployer.address}`);
  console.log(`Balance  : ${ethers.formatEther(balance)} ${symbol}`);

  if (balance === 0n) {
    throw new Error(
      chainId === 968
        ? "Deployer has 0 BOT. Fund it from the BOT Chain testnet faucet first."
        : "Deployer has 0 BOT. Fund the account before deploying."
    );
  }

  console.log("\nDeploying...");
  const Factory = await ethers.getContractFactory("NostromFactory");
  const factory = await Factory.deploy();

  const deployTx = factory.deploymentTransaction();
  console.log(`Tx hash  : ${deployTx.hash}`);

  await factory.waitForDeployment();
  const address = await factory.getAddress();
  const receipt = await ethers.provider.getTransactionReceipt(deployTx.hash);

  const implementation = await factory.implementation();

  console.log(`\nNostromFactory : ${address}`);
  console.log(`Implementation : ${implementation}`);
  console.log(`Block          : ${receipt.blockNumber}`);
  console.log(`Gas used       : ${receipt.gasUsed}`);
  if (chain) {
    console.log(`Explorer       : ${chain.explorer}/address/${address}`);
  }

  // --- Post-deploy sanity checks -------------------------------------------
  if (implementation === ethers.ZeroAddress) {
    throw new Error("Post-deploy check failed: implementation was not deployed.");
  }
  if ((await factory.totalVaults()) !== 0n) {
    throw new Error("Post-deploy check failed: registry should start empty.");
  }

  // The implementation must be permanently locked so it can never hold funds.
  const impl = await ethers.getContractAt("NostromVault", implementation);
  if (await impl.isInitialized()) {
    throw new Error("Post-deploy check failed: implementation is initialised.");
  }
  console.log("\nChecks         : implementation locked, registry empty — OK");

  // --- Persist record ------------------------------------------------------
  const record = {
    contract: "NostromFactory",
    address,
    implementation,
    network: chain?.name ?? hre.network.name,
    chainId,
    deployer: deployer.address,
    deploymentBlock: receipt.blockNumber,
    transactionHash: deployTx.hash,
    explorer: chain ? `${chain.explorer}/address/${address}` : null,
    deployedAt: new Date().toISOString(),
    constructorArgs: [],
  };

  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `factory-${hre.network.name}-${chainId}.json`);
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`Record         : ${path.relative(process.cwd(), file)}`);

  console.log("\n--- Next steps ---");
  console.log(`1. Point your frontend at the factory: ${address}`);
  console.log(`2. Users create vaults with: createVault(agentAddress, recoveryAddress, timeoutPeriod)`);
  console.log(`3. Gate the UI on isVault(address) so users cannot be phished by look-alikes.`);
  console.log(
    `4. Verify (optional): npx hardhat verify --network ${hre.network.name} ${address}`
  );
  console.log("");
}

main().catch((error) => {
  console.error("\nDeployment failed:");
  console.error(error.message ?? error);
  process.exitCode = 1;
});
