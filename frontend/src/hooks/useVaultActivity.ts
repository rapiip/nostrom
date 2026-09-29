import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { usePublicClient } from "wagmi";
import type { Abi, Address, Hash, Log } from "viem";
import { nostromVaultAbi } from "@/contracts/abis";

/**
 * On-chain activity for one vault, newest first.
 *
 * Read straight from event logs: the vault emits an event for every state
 * change (heartbeat, funding, withdrawal, reconfiguration, trigger), so the log
 * IS the audit trail and no indexer is needed.
 *
 * History is paged backwards in fixed block windows rather than asked for in
 * one `fromBlock: 0` query. Public RPCs cap log ranges and response sizes, and
 * a busy vault (a 1-hour timeout pings ~24 times a day) accumulates thousands
 * of Heartbeat logs. The first window loads with the page; older windows load
 * on request, and a new vault stops as soon as it reaches its creation block.
 */

/** BOT Chain testnet produces ~1.3 blocks/s, so this is roughly 1.7 days. */
export const ACTIVITY_WINDOW_BLOCKS = 200_000n;

/** Cap on per-page block lookups for events without their own timestamp. */
const MAX_BLOCK_LOOKUPS = 40;

/** Every event the vault ABI declares, keyed by name. */
export type VaultEventName =
  | "Heartbeat"
  | "VaultFunded"
  | "OwnerWithdrawal"
  | "TokenWithdrawal"
  | "DeadManSwitchTriggered"
  | "TokenRescued"
  | "TokenRescueFailed"
  | "NativeSwept"
  | "TimeoutPeriodUpdated"
  | "RecoveryAddressUpdated"
  | "AgentAddressUpdated"
  | "OwnershipTransferred"
  | "TrackedTokenAdded"
  | "TrackedTokenRemoved"
  | "SwitchRearmed"
  | "VaultInitialized";

export interface VaultEvent {
  /** Stable key: tx hash + log index. */
  id: string;
  name: VaultEventName;
  args: Record<string, unknown>;
  blockNumber: bigint;
  transactionHash: Hash;
  logIndex: number;
  /** Unix seconds, when the RPC returns it with the log (not guaranteed). */
  timestamp: bigint | undefined;
}

interface ActivityPage {
  events: VaultEvent[];
  fromBlock: bigint;
  toBlock: bigint;
  /** True once this page reached block 0 or the vault's own creation. */
  reachedStart: boolean;
}

const VAULT_EVENTS = (nostromVaultAbi as Abi).filter(
  (item): item is Extract<Abi[number], { type: "event" }> => item.type === "event",
);

type DecodedLog = Log<bigint, number, false> & {
  eventName?: string;
  args?: Record<string, unknown>;
  blockTimestamp?: bigint | string;
};

export function useVaultActivity(vault: Address | undefined) {
  const client = usePublicClient();

  const query = useInfiniteQuery({
    queryKey: ["vault-activity", client?.chain.id, vault],
    enabled: Boolean(client && vault),
    initialPageParam: undefined as bigint | undefined,
    // New events arrive at the head, so only the newest window needs polling.
    refetchInterval: 30_000,
    staleTime: 15_000,
    queryFn: async ({ pageParam }): Promise<ActivityPage> => {
      if (!client || !vault) throw new Error("No client");

      const toBlock = pageParam ?? (await client.getBlockNumber());
      const fromBlock = toBlock > ACTIVITY_WINDOW_BLOCKS ? toBlock - ACTIVITY_WINDOW_BLOCKS + 1n : 0n;

      const logs = (await client.getLogs({
        address: vault,
        events: VAULT_EVENTS,
        fromBlock,
        toBlock,
        strict: false,
      })) as DecodedLog[];

      const decoded: VaultEvent[] = logs
        .filter((l) => l.eventName && l.transactionHash && l.blockNumber !== null)
        .map((l) => {
          const args = l.args ?? {};
          // Several events carry their own timestamp argument (Heartbeat,
          // DeadManSwitchTriggered, SwitchRearmed, AgentAddressUpdated...).
          const own = args.timestamp ?? args.lastPingTime;
          return {
            id: `${l.transactionHash}-${l.logIndex}`,
            name: l.eventName as VaultEventName,
            args,
            blockNumber: l.blockNumber as bigint,
            transactionHash: l.transactionHash as Hash,
            logIndex: l.logIndex ?? 0,
            timestamp:
              l.blockTimestamp !== undefined && l.blockTimestamp !== null
                ? BigInt(l.blockTimestamp)
                : typeof own === "bigint"
                  ? own
                  : undefined,
          };
        });

      // BOT Chain's RPC does not attach blockTimestamp to logs, so resolve the
      // rest from their blocks. Deduplicated and capped: events in the same
      // transaction share a block, and a page with hundreds of untimed events
      // should not become hundreds of requests (viem batches these into one
      // JSON-RPC batch when the transport allows it).
      const missing = [...new Set(decoded.filter((e) => e.timestamp === undefined).map((e) => e.blockNumber))];
      const toResolve = missing.slice(0, MAX_BLOCK_LOOKUPS);
      const resolved = new Map<bigint, bigint>();
      await Promise.all(
        toResolve.map(async (n) => {
          try {
            const block = await client.getBlock({ blockNumber: n });
            resolved.set(n, block.timestamp);
          } catch {
            // A missing timestamp degrades to "block N"; it is not worth failing the page.
          }
        }),
      );

      const events = decoded
        .map((e) => (e.timestamp === undefined && resolved.has(e.blockNumber) ? { ...e, timestamp: resolved.get(e.blockNumber) } : e))
        .reverse();

      const reachedCreation = events.some((e) => e.name === "VaultInitialized");
      return { events, fromBlock, toBlock, reachedStart: fromBlock === 0n || reachedCreation };
    },
    getNextPageParam: (last) => (last.reachedStart ? undefined : last.fromBlock - 1n),
  });

  const pages = query.data?.pages;

  const events = useMemo(() => (pages ?? []).flatMap((p) => p.events), [pages]);

  const oldestBlock = pages && pages.length > 0 ? pages[pages.length - 1]!.fromBlock : undefined;
  const reachedStart = Boolean(pages?.[pages.length - 1]?.reachedStart);

  return {
    events,
    oldestBlock,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isFetching: query.isFetching,
    isFetchingOlder: query.isFetchingNextPage,
    hasOlder: Boolean(query.hasNextPage) && !reachedStart,
    loadOlder: () => void query.fetchNextPage(),
    refetch: () => void query.refetch(),
    updatedAt: query.dataUpdatedAt || undefined,
  };
}
