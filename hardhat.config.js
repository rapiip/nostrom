require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

/**
 * BOT Chain network configuration.
 * Source: https://dev-docs.botchain.ai/docs/Developers/quick-guide/
 *
 *   Testnet -> Chain ID 968, RPC https://rpc.bohr.life,     explorer https://scan.bohr.life
 *   Mainnet -> Chain ID 677, RPC https://rpc.botchain.ai,   explorer https://scan.botchain.ai
 *
 * BOT Chain is EVM-compatible with a Geth-compatible JSON-RPC surface, so the
 * standard Hardhat + ethers.js toolchain works without any chain-specific SDK.
 *
 * @type {import('hardhat/config').HardhatUserConfig}
 */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      // "paris" avoids emitting the PUSH0 opcode (introduced in Shanghai).
      // This keeps the bytecode portable across EVM chains that have not yet
      // activated Shanghai. If BOT Chain confirms Shanghai/Cancun support you
      // can switch this to "shanghai" or "cancun" for slightly cheaper gas.
      evmVersion: "paris",
    },
  },

  networks: {
    hardhat: {
      chainId: 31337,
    },

    botchainTestnet: {
      url: process.env.BOTCHAIN_TESTNET_RPC || "https://rpc.bohr.life",
      chainId: 968,
      accounts,
    },

    botchainMainnet: {
      url: process.env.BOTCHAIN_MAINNET_RPC || "https://rpc.botchain.ai",
      chainId: 677,
      accounts,
    },
  },

  // BOT Chain explorers are Blockscout-style. Verification endpoints are not
  // documented in the quick guide, so these are best-effort defaults. If
  // `hardhat verify` fails, verify manually through the explorer UI using the
  // flattened source (`npx hardhat flatten contracts/Nostrom.sol`).
  etherscan: {
    apiKey: {
      botchainTestnet: process.env.BOTSCAN_API_KEY || "no-api-key-needed",
      botchainMainnet: process.env.BOTSCAN_API_KEY || "no-api-key-needed",
    },
    customChains: [
      {
        network: "botchainTestnet",
        chainId: 968,
        urls: {
          apiURL: "https://scan.bohr.life/api",
          browserURL: "https://scan.bohr.life",
        },
      },
      {
        network: "botchainMainnet",
        chainId: 677,
        urls: {
          apiURL: "https://scan.botchain.ai/api",
          browserURL: "https://scan.botchain.ai",
        },
      },
    ],
  },

  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },

  mocha: {
    timeout: 120000,
  },
};
