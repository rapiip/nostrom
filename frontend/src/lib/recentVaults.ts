import { useSyncExternalStore } from "react";
import { getAddress, isAddress, type Address } from "viem";

/**
 * Recently opened vaults, per chain, in localStorage.
 *
 * Vault addresses are 42 opaque characters. Anyone watching a vault they did
 * not create (a keeper, a counterparty, the owner of a standalone deployment
 * the registry does not index) otherwise has to paste the address every visit.
 *
 * Only public data is stored: chain id, address, and when it was last opened.
 * Nothing about the connected wallet. Storage failures (private mode, quota,
 * disabled storage) degrade to an empty list, never to an error.
 */

const KEY = "nostrom:recent-vaults:v1";
const MAX = 8;

export interface RecentVault {
  chainId: number;
  address: Address;
  /** Milliseconds since epoch. */
  openedAt: number;
}

const listeners = new Set<() => void>();
let cache: { raw: string | null; value: RecentVault[] } = { raw: null, value: [] };

function read(): RecentVault[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return cache.value;
  }
  // useSyncExternalStore requires a referentially stable snapshot between
  // changes, so parse only when the stored string actually changed.
  if (raw === cache.raw) return cache.value;
  let value: RecentVault[] = [];
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      value = parsed
        .filter(
          (v): v is RecentVault =>
            typeof v === "object" &&
            v !== null &&
            typeof (v as RecentVault).chainId === "number" &&
            typeof (v as RecentVault).address === "string" &&
            isAddress((v as RecentVault).address) &&
            typeof (v as RecentVault).openedAt === "number",
        )
        .map((v) => ({ ...v, address: getAddress(v.address) }));
    }
  } catch {
    value = [];
  }
  cache = { raw, value };
  return value;
}

function write(list: RecentVault[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable; the feature simply does not persist.
  }
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  // Keep other tabs in sync.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) fn();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

const EMPTY: RecentVault[] = [];

export function useRecentVaults(chainId: number | undefined): RecentVault[] {
  const all = useSyncExternalStore(subscribe, read, () => EMPTY);
  return chainId === undefined ? EMPTY : all.filter((v) => v.chainId === chainId);
}

export function rememberVault(chainId: number, address: Address) {
  const now = Date.now();
  const rest = read().filter(
    (v) => !(v.chainId === chainId && v.address.toLowerCase() === address.toLowerCase()),
  );
  write([{ chainId, address: getAddress(address), openedAt: now }, ...rest].slice(0, MAX * 3));
}

export function forgetVault(chainId: number, address: Address) {
  write(
    read().filter(
      (v) => !(v.chainId === chainId && v.address.toLowerCase() === address.toLowerCase()),
    ),
  );
}

export const RECENT_VAULTS_MAX = MAX;
