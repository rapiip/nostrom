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
        // 200 is deliberate, not a default left untouched.
        //
        // Lowering it shrinks the bytecode and makes DEPLOY cheaper, but makes
        // `ping()` more expensive, and ping() is the one call that recurs for
        // the life of every vault. Measured: runs=1 saves ~45k gas once on the
        // factory deploy but adds ~166 gas to every heartbeat, so it turns into
        // a net loss after roughly 270 pings (about 11 days of hourly pings).
        // Optimising the one-time cost at the expense of the forever cost is a
        // false economy. Re-measure with `node scripts/tune-gas.js`.
        runs: Number(process.env.GAS_RUNS || 200),
      },
      // BOT Chain has Shanghai AND Cancun active on both networks: verified by
      // reading `withdrawalsRoot` and `blobGasUsed` from the latest block on
      // rpc.botchain.ai (677) and rpc.bohr.life (968). PUSH0 is therefore safe,
      // and targeting cancun instead of paris produces smaller bytecode:
      // ~59k gas cheaper to deploy the factory, ~27k cheaper for a standalone
      // vault, with no behavioural change.
      //
      // Set GAS_EVM=paris if you need portability to a chain still on pre-
      // Shanghai rules (that bytecode must not contain PUSH0).
      evmVersion: process.env.GAS_EVM || "cancun",
      // Every byte of deployed bytecode costs 200 gas. Solidity appends a CBOR
      // metadata trailer (an IPFS hash of the source) that the EVM never reads,
      // so dropping it saves ~18k gas on deploy with no behavioural change.
      //
      // Source verification still works: the explorer recompiles from source
      // and compares. It only forgoes a metadata-hash "full match". Set
      // GAS_METADATA=keep if your verifier requires that.
      ...(process.env.GAS_METADATA === "keep"
        ? {}
        : { metadata: { bytecodeHash: "none" } }),
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
