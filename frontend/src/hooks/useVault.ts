import { useMemo } from "react";
import { useChainId, useConnection, useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { erc20Abi, nostromFactoryAbi, nostromVaultAbi } from "@/contracts/abis";
import { factoryAddress } from "@/config/contracts";
import { useClock } from "./useClock";
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
    query: { enabled: Boolean(address) },
  });

  const [impl, total, maxPage] = query.data ?? [];

  return {
    implementation: impl?.status === "success" ? (impl.result as Address) : undefined,
    totalVaults: total?.status === "success" ? (total.result as bigint) : undefined,
    maxPageLimit: maxPage?.status === "success" ? (maxPage.result as bigint) : undefined,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
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
 * Every vault the connected account created, with live state.
 *
 * Two RPC calls total regardless of vault count: `vaultsOf` for the addresses,
 * then `getVaultsSnapshot` for all of their state in one batch. Looping
 * `status()` per vault would be N calls.
 *
 * Note the registry semantics: `vaultsOf` is indexed by who CALLED createVault,
 * and that link never changes. It is not "current owner" — ownership can be
 * transferred. Consumers are expected to compare snapshot.owner when that
 * distinction matters.
 */
export function useMyVaults() {
  const { address: factory } = useFactory();
  const { address: account } = useConnection();
  const now = useClock();

  const list = useReadContract({
    address: factory ?? undefined,
    abi: nostromFactoryAbi,
    functionName: "vaultsOf",
    args: account ? [account] : undefined,
    query: { enabled: Boolean(factory && account) },
  });

  const addresses = (list.data as readonly Address[] | undefined) ?? [];

  const snapshots = useReadContract({
    address: factory ?? undefined,
    abi: nostromFactoryAbi,
    functionName: "getVaultsSnapshot",
    args: [addresses],
    query: { enabled: Boolean(factory) && addresses.length > 0 },
  });

  const vaults = useMemo<VaultView[]>(() => {
    const raw = snapshots.data as readonly VaultSnapshotStruct[] | undefined;
    if (!raw) return [];
    return raw
      .filter((s) => !isEmptySnapshot(s))
      .map((s) => buildVaultView(s.vault, statusFromSnapshot(s), now));
  }, [snapshots.data, now]);

  const refetch = () => {
    void list.refetch();
    void snapshots.refetch();
  };

  return {
    vaults,
    addresses,
    isLoading: list.isLoading || (addresses.length > 0 && snapshots.isLoading),
    isError: list.isError || snapshots.isError,
    error: list.error ?? snapshots.error,
    isEmpty: !list.isLoading && addresses.length === 0,
    refetch,
  };
}

/**
 * Vaults whose switch can be fired right now — the keeper's primary query.
 * `getExecutableVaults` runs the scan on-chain inside a try/catch per vault, so
 * one pathological vault cannot break the page.
 */
export function useExecutableVaults(limit = 100n) {
  const { address: factory } = useFactory();
  const now = useClock();

  const scan = useReadContract({
    address: factory ?? undefined,
    abi: nostromFactoryAbi,
    functionName: "getExecutableVaults",
    args: [0n, limit],
    query: { enabled: Boolean(factory), refetchInterval: 15_000 },
  });

  const tuple = scan.data as readonly [readonly Address[], bigint] | undefined;
  const addresses = tuple?.[0] ?? [];
  const scanned = tuple?.[1];

  const snapshots = useReadContract({
    address: factory ?? undefined,
    abi: nostromFactoryAbi,
    functionName: "getVaultsSnapshot",
    args: [addresses],
    query: { enabled: Boolean(factory) && addresses.length > 0 },
  });

  const vaults = useMemo<VaultView[]>(() => {
    const raw = snapshots.data as readonly VaultSnapshotStruct[] | undefined;
    if (!raw) return [];
    return raw
      .filter((s) => !isEmptySnapshot(s))
      .map((s) => buildVaultView(s.vault, statusFromSnapshot(s), now));
  }, [snapshots.data, now]);

  return {
    vaults,
    scanned,
    isLoading: scan.isLoading,
    isError: scan.isError,
    error: scan.error,
    refetch: () => {
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
