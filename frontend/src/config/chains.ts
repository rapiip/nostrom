import { defineChain } from "viem";

/**
 * BOT Chain network definitions.
 *
 * Values mirror `hardhat.config.js` in the repository root, which in turn cites
 * https://dev-docs.botchain.ai/docs/Developers/quick-guide/; that file is the
 * source of truth. If a chain ID or RPC changes there, change it here too.
 *
 *   Testnet -> chainId 968, rpc.bohr.life,     scan.bohr.life
 *   Mainnet -> chainId 677, rpc.botchain.ai,   scan.botchain.ai
 *
 * BOT Chain is EVM-compatible with a Geth-compatible JSON-RPC surface, so a
 * plain viem chain definition is sufficient; no chain-specific SDK is needed.
 */

const env = import.meta.env;

export const botchainTestnet = defineChain({
  id: 968,
  name: "BOT Chain Testnet",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: {
    default: {
      http: [env.VITE_RPC_968 || "https://rpc.bohr.life"],
    },
  },
  blockExplorers: {
    default: { name: "BOT Scan", url: "https://scan.bohr.life" },
  },
  testnet: true,
});

export const botchainMainnet = defineChain({
  id: 677,
  name: "BOT Chain",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: {
    default: {
      http: [env.VITE_RPC_677 || "https://rpc.botchain.ai"],
    },
  },
  blockExplorers: {
    default: { name: "BOT Scan", url: "https://scan.botchain.ai" },
  },
  testnet: false,
});

/**
 * Local Hardhat node, for `npx hardhat node` + `scripts/demo.js`. Only exposed
 * when VITE_ENABLE_LOCALHOST=true so a production build never offers it.
 */
export const hardhatLocal = defineChain({
  id: 31337,
  name: "Hardhat",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  testnet: true,
});

const includeLocalhost = env.VITE_ENABLE_LOCALHOST === "true";

/**
 * Chain the app treats as its default. This is the chain an UNCONNECTED visitor
 * reads from, so it must also be first in `supportedChains`; wagmi initialises
 * its current chain to `chains[0]`, and if the two disagreed, a visitor with no
 * wallet would silently read a different network than the app claims to default
 * to.
 */
export const defaultChain = (() => {
  switch (env.VITE_DEFAULT_CHAIN_ID) {
    case "677":
      return botchainMainnet;
    case "31337":
      return includeLocalhost ? hardhatLocal : botchainTestnet;
    default:
      return botchainTestnet;
  }
})();

/** Chains the app supports, default first. */
export const supportedChains = [
  defaultChain,
  ...[botchainMainnet, botchainTestnet, ...(includeLocalhost ? [hardhatLocal] : [])].filter(
    (c) => c.id !== defaultChain.id,
  ),
] as [typeof botchainTestnet, ...(typeof botchainTestnet)[]];

export type SupportedChainId = (typeof supportedChains)[number]["id"];

export function isSupportedChainId(id: number | undefined): id is SupportedChainId {
  return id !== undefined && supportedChains.some((c) => c.id === id);
}

export function getChain(id: number | undefined) {
  return supportedChains.find((c) => c.id === id);
}

export function explorerUrl(chainId: number | undefined): string | null {
  return getChain(chainId)?.blockExplorers?.default.url ?? null;
}

export function explorerTxUrl(chainId: number | undefined, hash: string): string | null {
  const base = explorerUrl(chainId);
  return base ? `${base}/tx/${hash}` : null;
}

export function explorerAddressUrl(chainId: number | undefined, address: string): string | null {
  const base = explorerUrl(chainId);
  return base ? `${base}/address/${address}` : null;
}
