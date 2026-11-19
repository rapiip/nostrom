import { useMemo } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { useChainId, useConnection, useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { erc20Abi, nostromFactoryAbi, nostromVaultAbi } from "@/contracts/abis";
import { factoryAddress } from "@/config/contracts";
import { useClock } from "./useClock";
import { chunk, planRegistryScan, rolesFor, unionAddresses, type VaultRole } from "@/lib/discovery";
import {
  buildVaultView,
  decodeStatusTuple,
  deriveCapabilities,
  isEmptySnapshot,
  statusFromSnapshot,
  type VaultCapabilities,
  type VaultSnapshotStruct,
  type VaultView,
} from "@/lib/vaultState";

/* ===========================================================================
   Factory
   =========================================================================== */

/** Factory address for the active chain, plus whether one is configured at all. */
export function useFactory() {
  const chainId = useChainId();
  const address = factoryAddress(chainId);
  return { chainId, address, isConfigured: address !== null };
}

/**
 * Factory-level facts: the shared implementation, the registry size, and the
 * pagination cap. Batched into a single multicall-style read.
 */
export function useFactoryInfo() {
  const { address } = useFactory();

  const query = useReadContracts({
    contracts: address
      ? [
          { address, abi: nostromFactoryAbi, functionName: "implementation" },
          { address, abi: nostromFactoryAbi, functionName: "totalVaults" },
          { address, abi: nostromFactoryAbi, functionName: "MAX_PAGE_LIMIT" },
        ]
      : [],
    query: { enabled: Boolean(address), refetchInterval: 30_000 },
  });

  const [impl, total, maxPage] = query.data ?? [];

  return {
    implementation: impl?.status === "success" ? (impl.result as Address) : undefined,
    totalVaults: total?.status === "success" ? (total.result as bigint) : undefined,
    maxPageLimit: maxPage?.status === "success" ? (maxPage.result as bigint) : undefined,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    dataUpdatedAt: query.dataUpdatedAt,
    refetch: query.refetch,
  };
}

/**
 * Protocol limits, read from the chain rather than trusted from the bundle.
 * The constants in config/contracts.ts give instant validation; these are the
 * authority, and any disagreement means the frontend is stale.
 */
export function useProtocolLimits(vault: Address | undefined) {
  const query = useReadContracts({
    contracts: vault
      ? [
          { address: vault, abi: nostromVaultAbi, functionName: "MIN_TIMEOUT_PERIOD" },
          { address: vault, abi: nostromVaultAbi, functionName: "MAX_TIMEOUT_PERIOD" },
          { address: vault, abi: nostromVaultAbi, functionName: "MAX_TRACKED_TOKENS" },
        ]
      : [],
    query: { enabled: Boolean(vault), staleTime: Infinity },
  });

  const [min, max, tokens] = query.data ?? [];
  return {
    minTimeout: min?.status === "success" ? (min.result as bigint) : undefined,
    maxTimeout: max?.status === "success" ? (max.result as bigint) : undefined,
    maxTrackedTokens: tokens?.status === "success" ? (tokens.result as bigint) : undefined,
  };
}

/**
 * Is this address a genuine vault from the configured factory?
 *
 * The factory's own docs say a frontend should gate on this so users cannot be
 * tricked into interacting with a look-alike contract, so the vault console does
 * exactly that — and says plainly when it cannot verify (no factory configured).
 */
export function useIsRegisteredVault(vault: Address | undefined) {
  const { address } = useFactory();

  const query = useReadContract({
    address: address ?? undefined,
    abi: nostromFactoryAbi,
    functionName: "isVault",
    args: vault ? [vault] : undefined,
    query: { enabled: Boolean(address && vault), staleTime: 60_000 },
  });

  return {
    /** true = verified, false = not from this factory, undefined = unknown. */
    isRegistered: query.data as boolean | undefined,
    canVerify: Boolean(address),
    isLoading: query.isLoading,
  };
}

/** Creation metadata: who created the vault, when, and its registry index. */
export function useVaultRecord(vault: Address | undefined) {
  const { address } = useFactory();
  const { isRegistered } = useIsRegisteredVault(vault);

  const query = useReadContract({
    address: address ?? undefined,
    abi: nostromFactoryAbi,
    functionName: "getVaultRecord",
    args: vault ? [vault] : undefined,
    // getVaultRecord reverts with NotANostromVault for unknown addresses, so
    // only ask once membership is confirmed.
    query: { enabled: Boolean(address && vault && isRegistered), staleTime: Infinity },
  });

  const tuple = query.data as readonly [Address, bigint, bigint] | undefined;
  return {
    creator: tuple?.[0],
    createdAt: tuple?.[1],
    vaultIndex: tuple?.[2],
    isLoading: query.isLoading,
  };
}

/* ===========================================================================
   Vault lists
   =========================================================================== */

/**
 * Registry discovery bounds.
 *
 * `getVaults` returns bare addresses, so a page can use the factory's full
 * MAX_PAGE_LIMIT. `getVaultsSnapshot` calls `status()` on every vault inside
 * one eth_call, so it is chunked well below RPC gas caps (the keeper scan uses
 * the same reasoning for `getExecutableVaults`).
 */
export const DISCOVERY_PAGE_SIZE = 500n;
/** 4 × 500 = the first 2,000 registry entries are checked for roles. */
export const DISCOVERY_MAX_PAGES = 4;
export const SNAPSHOT_CHUNK = 200;

/** A vault plus the roles the connected account holds on it right now. */
export type RoledVaultView = VaultView & { roles: VaultRole[] };

const NO_ADDRESSES: readonly Address[] = [];

/**
 * Every vault the connected account has a stake in, with live state.
 *
 * `vaultsOf(account)` alone is not enough: it is indexed by who CALLED
 * createVault and never changes, so the agent key, the recovery wallet and a
 * new owner after `transferOwnership` would all see an empty list. So the
 * registry is also scanned, and each vault's CURRENT owner/agent/recovery is
 * matched against the account:
 *
 *   1. vaultsOf(account)              vaults this account created
 *   2. getVaults(offset, 500) × N     registry addresses (bounded, see above)
 *   3. getVaultsSnapshot(chunk) × M   live participants, matched by role
 *   4. getVaultsSnapshot(mine)        fast-polled state of the matched set
 *
 * Steps 2-3 refresh slowly (a role change is rare); step 4 keeps the 12-second
 * refresh the page promises. Matching on live state rather than on historical
 * events means a rotated-away agent key or a previous owner stops seeing the
 * vault, which is the correct answer. No indexer or database is involved.
 */
export function useMyVaults() {
  const { address: factory } = useFactory();
  const { address: account } = useConnection();
  const now = useClock();
  const info = useFactoryInfo();
  const active = Boolean(factory && account);

  /* 1. Created by this account. */
  const created = useReadContract({
    address: factory ?? undefined,
    abi: nostromFactoryAbi,
    functionName: "vaultsOf",
    args: account ? [account] : undefined,
    // A vault created in another tab should appear without a manual refresh.
    query: { enabled: active, refetchInterval: 30_000 },
  });
  const createdAddresses = (created.data as readonly Address[] | undefined) ?? NO_ADDRESSES;

  /* 2. Registry pages. */
  const plan = planRegistryScan(info.totalVaults, DISCOVERY_PAGE_SIZE, DISCOVERY_MAX_PAGES);
  const pages = useReadContracts({
    contracts:
      factory && active
        ? plan.offsets.map((offset) => ({
            address: factory,
            abi: nostromFactoryAbi,
            functionName: "getVaults" as const,
            args: [offset, DISCOVERY_PAGE_SIZE] as const,
          }))
        : [],
    query: { enabled: active && plan.offsets.length > 0, refetchInterval: 60_000, placeholderData: keepPreviousData },
  });

  const registry = useMemo(() => {
    const addresses: Address[] = [];
    let failed = 0;
    for (const page of pages.data ?? []) {
      if (page.status !== "success") {
        failed += 1;
        continue;
      }
      addresses.push(...(page.result as readonly Address[]));
    }
    return { addresses, failed };
  }, [pages.data]);

  /* 3. Live participants of every scanned vault. */
  const scanChunks = useMemo(() => chunk(registry.addresses, SNAPSHOT_CHUNK), [registry.addresses]);
  const scan = useReadContracts({
    contracts:
      factory && active
        ? scanChunks.map((batch) => ({
            address: factory,
            abi: nostromFactoryAbi,
            functionName: "getVaultsSnapshot" as const,
            args: [batch] as const,
          }))
        : [],
    query: { enabled: active && scanChunks.length > 0, refetchInterval: 60_000, placeholderData: keepPreviousData },
  });

  const matched = useMemo(() => {
    const addresses: Address[] = [];
    let failed = 0;
    for (const result of scan.data ?? []) {
      if (result.status !== "success") {
        failed += 1;
        continue;
      }
      for (const s of result.result as readonly VaultSnapshotStruct[]) {
        if (isEmptySnapshot(s)) continue;
        const roles = rolesFor(
          { owner: s.owner, agent: s.agentAddress, recovery: s.recoveryAddress },
          account,
          false,
        );
        if (roles.length > 0) addresses.push(s.vault);
      }
    }
    return { addresses, failed };
  }, [scan.data, account]);

  /* 4. Fast-polled state of everything this account has a stake in. */
  const mine = useMemo(
    () => unionAddresses(createdAddresses, matched.addresses),
    [createdAddresses, matched.addresses],
  );
  const mineChunks = useMemo(() => chunk(mine, SNAPSHOT_CHUNK), [mine]);
  const snapshots = useReadContracts({
    contracts:
      factory && active
        ? mineChunks.map((batch) => ({
            address: factory,
            abi: nostromFactoryAbi,
            functionName: "getVaultsSnapshot" as const,
            args: [batch] as const,
          }))
        : [],
    // The page copy promises a 12-second refresh; this is what keeps it true.
    // Kept across key changes: a newly matched vault changes the batch, and
    // without this the whole list would blank while the new batch loads.
    query: { enabled: active && mineChunks.length > 0, refetchInterval: 12_000, placeholderData: keepPreviousData },
  });

  const createdSet = useMemo(
    () => new Set(createdAddresses.map((a) => a.toLowerCase())),
    [createdAddresses],
  );

  const vaults = useMemo<RoledVaultView[]>(() => {
    const out: RoledVaultView[] = [];
    for (const result of snapshots.data ?? []) {
      if (result.status !== "success") continue;
      for (const s of result.result as readonly VaultSnapshotStruct[]) {
        if (isEmptySnapshot(s)) continue;
        const view = buildVaultView(s.vault, statusFromSnapshot(s), now);
        // Roles are re-derived from the FAST read, so a role lost since the
        // slow scan drops the vault instead of mislabelling it.
        const roles = rolesFor(view, account, createdSet.has(s.vault.toLowerCase()));
        if (roles.length > 0) out.push({ ...view, roles });
      }
    }
    return out;
  }, [snapshots.data, now, account, createdSet]);

  const snapshotFailed = (snapshots.data ?? []).some((r) => r.status !== "success");

  const refetch = () => {
    void created.refetch();
    void info.refetch();
    void pages.refetch();
    void scan.refetch();
    void snapshots.refetch();
  };

  const discovering =
    info.isLoading ||
    (plan.offsets.length > 0 && pages.isLoading) ||
    (scanChunks.length > 0 && scan.isLoading);

  // Created vaults render as soon as they are read; vaults found by role join
  // when the registry scan lands. So "loading" means "nothing to show yet".
  const isLoading =
    vaults.length === 0 &&
    (created.isLoading || discovering || (mine.length > 0 && snapshots.isLoading));

  return {
    vaults,
    isLoading,
    /** The registry scan for owner/agent/recovery roles is still running. */
    isDiscovering: discovering,
    // Only the account's own index and the final state read are fatal. A
    // failed discovery page degrades to "created vaults only", said plainly.
    isError:
      created.isError ||
      (mine.length > 0 && vaults.length === 0 && (snapshots.isError || snapshotFailed)),
    error:
      created.error ??
      snapshots.error ??
      (snapshots.data ?? []).find((r) => r.status === "failure")?.error,
    isEmpty: !isLoading && !discovering && mine.length === 0,
    isFetching: created.isFetching || pages.isFetching || scan.isFetching || snapshots.isFetching,
    /** Milliseconds; the older of the reads that feed the list. */
    updatedAt: oldestUpdate(created.dataUpdatedAt, mine.length > 0 ? snapshots.dataUpdatedAt : undefined),
    discovery: {
      totalVaults: info.totalVaults,
      scanned: BigInt(registry.addresses.length),
      /** The registry is larger than one refresh examines for roles. */
      truncated: plan.truncated,
      /** Registry reads that failed this round; will be retried. */
      failed: registry.failed + matched.failed + (info.isError ? 1 : 0),
    },
    refetch,
  };
}

/** Oldest non-zero timestamp, i.e. how stale the combined view can be. */
function oldestUpdate(...values: (number | undefined)[]): number | undefined {
  const set = values.filter((v): v is number => typeof v === "number" && v > 0);
  return set.length > 0 ? Math.min(...set) : undefined;
}

/**
 * Page size for the keeper scan. `getExecutableVaults` calls `isExecutable()`
 * on every vault in the page inside one eth_call, so the page is kept well
 * under MAX_PAGE_LIMIT (500) to stay clear of RPC gas caps on eth_call.
 */
export const KEEPER_PAGE_SIZE = 250n;
/** Upper bound on pages per scan: 10 × 250 = 2,500 vaults per refresh. */
export const KEEPER_MAX_PAGES = 10;

/**
 * Vaults whose switch can be fired right now — the keeper's primary query.
 * `getExecutableVaults` runs the scan on-chain inside a try/catch per vault, so
 * one pathological vault cannot break the page.
 *
 * The registry is scanned in full, page by page, sized from `totalVaults`. A
 * single fixed-size call would silently ignore every vault past the first page
 * and report "every agent is alive" while vaults further down the registry sat
 * executable — the one wrong answer a keeper screen must never give.
 */
export function useExecutableVaults() {
  const { address: factory } = useFactory();
  const now = useClock();
  const info = useFactoryInfo();

  const total = info.totalVaults;
  const pagesNeeded = total === undefined ? 0 : Number((total + KEEPER_PAGE_SIZE - 1n) / KEEPER_PAGE_SIZE);
  const pageCount = Math.min(pagesNeeded, KEEPER_MAX_PAGES);

  const scan = useReadContracts({
    contracts:
      factory && pageCount > 0
        ? Array.from({ length: pageCount }, (_, i) => ({
            address: factory,
            abi: nostromFactoryAbi,
            functionName: "getExecutableVaults" as const,
            args: [BigInt(i) * KEEPER_PAGE_SIZE, KEEPER_PAGE_SIZE] as const,
          }))
        : [],
    query: { enabled: Boolean(factory) && pageCount > 0, refetchInterval: 15_000 },
  });

  const { addresses, scanned, failedPages } = useMemo(() => {
    const found: Address[] = [];
    let count = 0n;
    let failed = 0;
    for (const page of scan.data ?? []) {
      if (page.status !== "success") {
        failed += 1;
        continue;
      }
      const [hits, n] = page.result as readonly [readonly Address[], bigint];
      found.push(...hits);
      count += n;
    }
    return { addresses: found, scanned: scan.data ? count : undefined, failedPages: failed };
  }, [scan.data]);

  const snapshots = useReadContract({
    address: factory ?? undefined,
    abi: nostromFactoryAbi,
    functionName: "getVaultsSnapshot",
    args: [addresses],
    query: { enabled: Boolean(factory) && addresses.length > 0, refetchInterval: 15_000 },
  });

  const vaults = useMemo<VaultView[]>(() => {
    const raw = snapshots.data as readonly VaultSnapshotStruct[] | undefined;
    if (!raw) return [];
    return raw
      .filter((s) => !isEmptySnapshot(s))
      .map((s) => buildVaultView(s.vault, statusFromSnapshot(s), now))
      // Largest rescue first: that is where a keeper's gas does the most good.
      .sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0));
  }, [snapshots.data, now]);

  const isEmptyRegistry = total === 0n;

  return {
    vaults,
    scanned: isEmptyRegistry ? 0n : scanned,
    totalVaults: total,
    /** True when the registry is larger than one refresh will scan. */
    isTruncated: pagesNeeded > KEEPER_MAX_PAGES,
    failedPages,
    isLoading: info.isLoading || (pageCount > 0 && scan.isLoading),
    isError: info.isError || scan.isError,
    error: info.error ?? scan.error,
    isFetching: scan.isFetching || snapshots.isFetching,
    updatedAt: scan.dataUpdatedAt || info.dataUpdatedAt || undefined,
    refetch: () => {
      void info.refetch();
      void scan.refetch();
      void snapshots.refetch();
    },
  };
}

/* ===========================================================================
   Single vault
   =========================================================================== */

export interface UseVaultResult {
  view: VaultView | undefined;
  capabilities: VaultCapabilities | undefined;
  trackedTokens: readonly Address[];
  isInitialized: boolean | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  /** The address is not a contract, or not a Nostrom vault at all. */
  isNotAVault: boolean;
  isFetching: boolean;
  /** Milliseconds since epoch of the last successful read, if any. */
  updatedAt: number | undefined;
  refetch: () => void;
}

/**
 * Full live state for one vault, by address.
 *
 * Works for a factory clone and for a standalone Nostrom.sol deployment alike —
 * `status()`, `ping()` and the rest have identical signatures in both, which is
 * why one ABI covers both cases.
 *
 * `isInitialized` is only present on the clone implementation, so a failure to
 * read it is treated as "not applicable" (a standalone vault is configured by
 * its constructor and is always initialised) rather than as an error.
 */
export function useVault(vault: Address | undefined): UseVaultResult {
  const { address: account } = useConnection();
  const now = useClock();

  const query = useReadContracts({
    contracts: vault
      ? [
          { address: vault, abi: nostromVaultAbi, functionName: "status" },
          { address: vault, abi: nostromVaultAbi, functionName: "trackedTokens" },
          { address: vault, abi: nostromVaultAbi, functionName: "isInitialized" },
        ]
      : [],
    query: { enabled: Boolean(vault), refetchInterval: 12_000 },
  });

  const [statusResult, tokensResult, initResult] = query.data ?? [];

  const statusOk = statusResult?.status === "success";

  const isInitialized =
    initResult?.status === "success"
      ? (initResult.result as boolean)
      : statusOk
        ? true // standalone vault: no isInitialized(), configured by constructor
        : undefined;

  const view = useMemo<VaultView | undefined>(() => {
    if (!vault || !statusOk) return undefined;
    const status = decodeStatusTuple(
      statusResult.result as Parameters<typeof decodeStatusTuple>[0],
    );
    return buildVaultView(vault, status, now, { initialized: isInitialized });
  }, [vault, statusOk, statusResult, now, isInitialized]);

  const capabilities = useMemo(
    () => (view ? deriveCapabilities(view, account) : undefined),
    [view, account],
  );

  const trackedTokens =
    tokensResult?.status === "success" ? (tokensResult.result as readonly Address[]) : [];

  // A wrong address is the single most likely user error here, so distinguish
  // "this is not a vault" from "the RPC is unhappy".
  const isNotAVault = Boolean(vault) && !query.isLoading && statusResult?.status === "failure";

  return {
    view,
    capabilities,
    trackedTokens,
    isInitialized,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? (statusResult?.status === "failure" ? statusResult.error : undefined),
    isNotAVault,
    isFetching: query.isFetching,
    updatedAt: query.dataUpdatedAt || undefined,
    refetch: () => void query.refetch(),
  };
}

/** Symbol/decimals/balance for each tracked ERC-20, in one batch. */
export function useTrackedTokenDetails(vault: Address | undefined, tokens: readonly Address[]) {
  const query = useReadContracts({
    contracts: tokens.flatMap((token) => [
      { address: token, abi: erc20Abi, functionName: "symbol" } as const,
      { address: token, abi: erc20Abi, functionName: "decimals" } as const,
      { address: token, abi: erc20Abi, functionName: "balanceOf", args: [vault] } as const,
    ]),
    query: { enabled: Boolean(vault) && tokens.length > 0 },
  });

  return useMemo(() => {
    return tokens.map((token, i) => {
      const symbol = query.data?.[i * 3];
      const decimals = query.data?.[i * 3 + 1];
      const balance = query.data?.[i * 3 + 2];
      return {
        address: token,
        // A non-standard or non-ERC20 address is exactly the kind of thing the
        // sweep is hardened against, so display it plainly instead of hiding it.
        symbol: symbol?.status === "success" ? (symbol.result as string) : "UNKNOWN",
        decimals: decimals?.status === "success" ? Number(decimals.result) : 18,
        balance: balance?.status === "success" ? (balance.result as bigint) : undefined,
        readable: balance?.status === "success",
      };
    });
  }, [tokens, query.data]);
}
