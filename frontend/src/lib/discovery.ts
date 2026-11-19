import type { Address } from "viem";
import { sameAddress } from "./format";

/**
 * Vault discovery by role.
 *
 * `vaultsOf(account)` is indexed by who CALLED createVault, and that link never
 * changes. So an agent key, a recovery wallet, or the new owner after
 * `transferOwnership` never sees the vault in "Your vaults" from the registry
 * index alone.
 *
 * The factory already exposes everything needed to fix that without an indexer:
 * `getVaults(offset, limit)` pages the registry and `getVaultsSnapshot` returns
 * each vault's CURRENT owner, agent and recovery address. Matching against the
 * live snapshot (rather than historical events) means a rotated-away agent key
 * or a previous owner correctly stops seeing the vault.
 */

export type VaultRole = "owner" | "agent" | "recovery" | "creator";

export const ROLE_LABEL: Record<VaultRole, string> = {
  owner: "Owner",
  agent: "Agent",
  recovery: "Recovery",
  creator: "Creator",
};

/** Roles `account` holds on a vault right now, in display order. */
export function rolesFor(
  participants: { owner: Address; agent: Address; recovery: Address },
  account: Address | undefined,
  created: boolean,
): VaultRole[] {
  if (!account) return [];
  const roles: VaultRole[] = [];
  if (sameAddress(participants.owner, account)) roles.push("owner");
  if (sameAddress(participants.agent, account)) roles.push("agent");
  if (sameAddress(participants.recovery, account)) roles.push("recovery");
  if (created) roles.push("creator");
  return roles;
}

export interface RegistryScanPlan {
  /** Offsets to request, one call each. */
  offsets: bigint[];
  /** True when the registry is larger than one refresh will scan. */
  truncated: boolean;
}

/**
 * Page offsets for a bounded scan of the registry.
 *
 * Bounded on purpose: every page is an eth_call, and a scan that grows without
 * limit with the registry would eventually hammer a public RPC on every
 * refresh. Callers must surface `truncated`, because "no vault found" only
 * means "none exists" if the whole registry was examined.
 */
export function planRegistryScan(
  total: bigint | undefined,
  pageSize: bigint,
  maxPages: number,
): RegistryScanPlan {
  if (total === undefined || total <= 0n || pageSize <= 0n || maxPages <= 0) {
    return { offsets: [], truncated: false };
  }
  const needed = (total + pageSize - 1n) / pageSize;
  const count = needed > BigInt(maxPages) ? maxPages : Number(needed);
  return {
    offsets: Array.from({ length: count }, (_, i) => BigInt(i) * pageSize),
    truncated: needed > BigInt(maxPages),
  };
}

/** Case-insensitive union that keeps the first spelling and first-seen order. */
export function unionAddresses(...lists: readonly (readonly Address[])[]): Address[] {
  const seen = new Set<string>();
  const out: Address[] = [];
  for (const list of lists) {
    for (const address of list) {
      const key = address.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(address);
    }
  }
  return out;
}

/** Split into consecutive slices of at most `size` items. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be positive");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
