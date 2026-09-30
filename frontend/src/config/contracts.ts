import { isAddress, type Address } from "viem";
import type { SupportedChainId } from "./chains";

/**
 * Factory addresses, per chain.
 *
 * NOTHING IS HARDCODED HERE ON PURPOSE. At the time of writing the repository
 * has no `deployments/` directory (and `deployments/*.json` is gitignored), so
 * there is no deployed factory address to reuse. Supply one via env:
 *
 *   VITE_FACTORY_ADDRESS_968=0x...    # BOT Chain testnet
 *   VITE_FACTORY_ADDRESS_677=0x...    # BOT Chain mainnet
 *   VITE_FACTORY_ADDRESS_31337=0x...  # local hardhat node
 *
 * `scripts/deploy-factory.js` prints the address and writes it to
 * deployments/factory-<network>-<chainId>.json — copy it from there.
 *
 * When no address is configured for the connected chain the console degrades to
 * a clearly-labelled "factory not deployed" state instead of pretending.
 * Direct-address vault lookup still works, so a standalone `Nostrom.sol` vault
 * or a vault on a chain without a factory remains fully usable.
 */

const RAW: Record<number, string | undefined> = {
  968: import.meta.env.VITE_FACTORY_ADDRESS_968,
  677: import.meta.env.VITE_FACTORY_ADDRESS_677,
  31337: import.meta.env.VITE_FACTORY_ADDRESS_31337,
};

/** Configured factory for a chain, or null when unset/malformed. */
export function factoryAddress(chainId: number | undefined): Address | null {
  if (chainId === undefined) return null;
  const raw = RAW[chainId]?.trim();
  if (!raw || !isAddress(raw)) return null;
  return raw as Address;
}

export function hasFactory(chainId: number | undefined): boolean {
  return factoryAddress(chainId) !== null;
}

/* ===========================================================================
   Deployed Nostrom contract, per chain
   ---------------------------------------------------------------------------
   The canonical deployed contract on each chain, used for "View Contract"
   links that point straight at the source on the block explorer instead of the
   explorer homepage. Env-overridable so a fork or a redeploy can point the UI
   at a different address without a code change:

     VITE_CONTRACT_ADDRESS_677=0x...   # BOT Chain mainnet
     VITE_CONTRACT_ADDRESS_968=0x...   # BOT Chain testnet

   The mainnet address is the live deployment on BOT Chain Mainnet (chainId
   677). Anything malformed or unset falls back to null and the link degrades
   to the explorer homepage rather than a broken URL.
   =========================================================================== */

const DEPLOYED_RAW: Record<number, string | undefined> = {
  677: import.meta.env.VITE_CONTRACT_ADDRESS_677 || "0x86328F808d018cB8A58436eB8Dbc5437711041CC",
  968: import.meta.env.VITE_CONTRACT_ADDRESS_968,
};

/** Deployed contract for a chain, or null when unset/malformed. */
export function deployedContractAddress(chainId: number | undefined): Address | null {
  if (chainId === undefined) return null;
  const raw = DEPLOYED_RAW[chainId]?.trim();
  if (!raw || !isAddress(raw)) return null;
  return raw as Address;
}

/** Chains that currently have a factory configured. */
export function chainsWithFactory(ids: readonly SupportedChainId[]): SupportedChainId[] {
  return ids.filter((id) => hasFactory(id));
}

/* ===========================================================================
   Protocol constants
   ---------------------------------------------------------------------------
   Mirrored from the contracts so the UI can validate input before it costs the
   user gas. These are also read back on-chain (see useProtocolLimits) and the
   on-chain values always win — these are the optimistic defaults used for
   instant client-side validation.

   Source: contracts/NostromFactory.sol
     MIN_TIMEOUT_PERIOD = 30 seconds
     MAX_TIMEOUT_PERIOD = 365 days
     MAX_TRACKED_TOKENS = 20
     MAX_PAGE_LIMIT     = 500   (NostromFactory)
   =========================================================================== */

export const PROTOCOL = {
  MIN_TIMEOUT_SECONDS: 30n,
  MAX_TIMEOUT_SECONDS: 365n * 24n * 60n * 60n,
  MAX_TRACKED_TOKENS: 20,
  MAX_PAGE_LIMIT: 500n,

  /**
   * The heartbeat clients clamp the ping interval to timeoutPeriod / 3 so two
   * consecutive missed transactions are survivable. The UI surfaces the same
   * number when helping a user choose a timeout.
   * Source: agent/nostrom-heartbeat.js, agent/nostrom_heartbeat.py
   */
  RECOMMENDED_PING_DIVISOR: 3n,
} as const;

/** Preset timeouts offered in the create form. All within contract bounds. */
export const TIMEOUT_PRESETS = [
  { label: "1 hour", seconds: 3600n, note: "Aggressive. High-frequency agents." },
  { label: "6 hours", seconds: 21_600n, note: "Tight monitoring." },
  { label: "24 hours", seconds: 86_400n, note: "Recommended default." },
  { label: "3 days", seconds: 259_200n, note: "Tolerates a weekend outage." },
  { label: "7 days", seconds: 604_800n, note: "Long-horizon treasuries." },
  { label: "30 days", seconds: 2_592_000n, note: "Cold, infrequent agents." },
] as const;

/* ===========================================================================
   External resources
   =========================================================================== */

export const LINKS = {
  botchain: "https://botchain.ai",
  botchainDocs: "https://dev-docs.botchain.ai/docs/Developers/quick-guide/",
  testnetExplorer: "https://scan.bohr.life",
  mainnetExplorer: "https://scan.botchain.ai",
  /** Source: "Get Tokens" in the BOT Chain quick guide. */
  testnetFaucet: "https://faucet.botchain.ai/basic",
  /** Mainnet BOT is only available via the official DEX (same source). */
  mainnetDex: "https://dex.botchain.ai/#/swap",
} as const;

/**
 * Measured gas costs, used to turn a wallet balance into "how many actions can
 * this pay for". Source: README "Gas costs (measured)" / scripts/measure-gas.js.
 */
export const GAS = {
  PING: 37_600n,
  CREATE_VAULT: 343_000n,
  EXECUTE: 74_400n,
} as const;

/**
 * Agent gas runway, in heartbeats. Below WARN the agent wallet is flagged; at
 * zero-capable (cannot pay one ping) it is flagged as critical, because an
 * agent that cannot pay for ping() looks exactly like a dead agent and the
 * switch will fire on a healthy one.
 */
export const AGENT_GAS_RUNWAY = {
  WARN_PINGS: 50n,
} as const;
