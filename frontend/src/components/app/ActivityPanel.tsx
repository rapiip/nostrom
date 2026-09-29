import { clsx } from "clsx";
import { useMemo, useState } from "react";
import type { Address } from "viem";
import {
  ArrowLineDown,
  ArrowLineUp,
  ArrowsClockwise,
  Broadcast,
  Coins,
  Gear,
  Key,
  ListPlus,
  ListDashes,
  Pulse,
  ShieldCheck,
  ShieldWarning,
  UserSwitch,
  Wallet,
  type Icon,
} from "@phosphor-icons/react";
import { explorerTxUrl } from "@/config/chains";
import { describeTimeout, formatAmount, formatCount, formatRelative, formatTimestamp, truncateAddress } from "@/lib/format";
import { shortErrorText } from "@/lib/errors";
import { useClock } from "@/hooks/useClock";
import { useVaultActivity, type VaultEvent, type VaultEventName } from "@/hooks/useVaultActivity";
import { Button } from "@/components/ui/Button";
import { Freshness } from "@/components/ui/Freshness";
import { EmptyState, Notice, Panel, PanelHeader, Skeleton } from "@/components/ui/Panel";

/**
 * Vault activity: the on-chain audit trail.
 *
 * Answers the questions the live state cannot: when did the agent last miss a
 * beat, who withdrew what, when was the recovery address changed. Colour is
 * semantic as everywhere else — signal for liveness, warn for authority and
 * configuration changes, danger for funds leaving under the switch — so a
 * glance down the rail shows whether anything unusual happened.
 *
 * Heartbeats can be hidden. A healthy agent emits dozens a day, and without the
 * filter a single recovery-address change (the event an owner most needs to
 * notice) is buried under them.
 */

type Tone = "signal" | "warn" | "danger" | "neutral";

interface EventMeta {
  title: string;
  icon: Icon;
  tone: Tone;
}

const META: Record<VaultEventName, EventMeta> = {
  Heartbeat: { title: "Heartbeat", icon: Pulse, tone: "signal" },
  VaultFunded: { title: "Deposit", icon: ArrowLineDown, tone: "neutral" },
  OwnerWithdrawal: { title: "Owner withdrawal", icon: ArrowLineUp, tone: "warn" },
  TokenWithdrawal: { title: "Token withdrawal", icon: Coins, tone: "warn" },
  DeadManSwitchTriggered: { title: "Switch fired", icon: Broadcast, tone: "danger" },
  TokenRescued: { title: "Token rescued", icon: Coins, tone: "danger" },
  TokenRescueFailed: { title: "Token rescue skipped", icon: ShieldWarning, tone: "warn" },
  NativeSwept: { title: "Late BOT swept", icon: ArrowsClockwise, tone: "danger" },
  TimeoutPeriodUpdated: { title: "Timeout changed", icon: Gear, tone: "warn" },
  RecoveryAddressUpdated: { title: "Recovery address changed", icon: Wallet, tone: "warn" },
  AgentAddressUpdated: { title: "Agent key rotated", icon: Key, tone: "warn" },
  OwnershipTransferred: { title: "Ownership transferred", icon: UserSwitch, tone: "warn" },
  TrackedTokenAdded: { title: "Token added to watchlist", icon: ListPlus, tone: "neutral" },
  TrackedTokenRemoved: { title: "Token removed from watchlist", icon: ListDashes, tone: "neutral" },
  SwitchRearmed: { title: "Vault re-armed", icon: ShieldCheck, tone: "signal" },
  VaultInitialized: { title: "Vault created", icon: ShieldCheck, tone: "neutral" },
};

const TONE_CLASSES: Record<Tone, { dot: string; icon: string }> = {
  signal: { dot: "border-signal-dim bg-signal/[0.08]", icon: "text-signal" },
  warn: { dot: "border-warn-dim bg-warn/[0.08]", icon: "text-warn" },
  danger: { dot: "border-danger-dim bg-danger/[0.08]", icon: "text-danger" },
  neutral: { dot: "border-line-strong bg-ink-850", icon: "text-text-dim" },
};

type Filter = "all" | "important";

export function ActivityPanel({
  vault,
  chainId,
  /** Owner/agent/recovery as currently configured, to label addresses in events. */
  roles,
}: {
  vault: Address;
  chainId: number | undefined;
  roles: { owner: Address; agent: Address; recovery: Address };
}) {
  const activity = useVaultActivity(vault);
  const [filter, setFilter] = useState<Filter>("important");
  const now = useClock();

  const heartbeatCount = useMemo(
    () => activity.events.filter((e) => e.name === "Heartbeat").length,
    [activity.events],
  );

  const visible = useMemo(
    () => (filter === "all" ? activity.events : activity.events.filter((e) => e.name !== "Heartbeat")),
    [activity.events, filter],
  );

  const label = (a: unknown) => describeAddress(a, roles);

  return (
    <Panel>
      <PanelHeader
        title="Activity"
        description="Every state change this vault has emitted, read directly from its event logs."
        actions={
          <Freshness
            updatedAt={activity.updatedAt}
            isFetching={activity.isFetching && !activity.isFetchingOlder}
            onRefresh={activity.refetch}
            staleAfter={90}
          />
        }
      />

      {/* Filter: a real radiogroup so the selection is announced. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5 sm:px-5">
        <div role="radiogroup" aria-label="Show events" className="inline-flex rounded border border-line-strong bg-ink-800 p-0.5">
          {(
            [
              { value: "important", label: "Changes" },
              { value: "all", label: "All events" },
            ] as const
          ).map((opt) => {
            const selected = filter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setFilter(opt.value)}
                className={clsx(
                  "min-h-[32px] cursor-pointer rounded-sm px-3 text-[12px] transition-colors duration-150",
                  selected ? "bg-ink-750 text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" : "text-text-dim hover:text-text",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {filter === "important" && heartbeatCount > 0 && (
          <p className="text-[12px] text-text-faint">
            <span className="tnum">{formatCount(heartbeatCount)}</span> heartbeat
            {heartbeatCount === 1 ? "" : "s"} hidden
          </p>
        )}
      </div>

      {activity.isLoading ? (
        <div className="flex flex-col gap-4 px-4 py-5 sm:px-5" aria-busy="true">
          <span className="sr-only">Loading activity…</span>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="size-7 rounded-full" />
              <div className="flex flex-1 flex-col gap-2 pt-1">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-64 max-w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : activity.isError ? (
        <div className="px-4 py-4 sm:px-5">
          <Notice tone="danger" title="Could not read the event log">
            {shortErrorText(activity.error)}
            <div className="mt-3">
              <Button variant="secondary" size="sm" onClick={activity.refetch}>
                Retry
              </Button>
            </div>
          </Notice>
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          className="py-10"
          icon={<ListDashes size={24} aria-hidden />}
          title={
            activity.events.length > 0
              ? "No configuration or funding changes"
              : "No activity in the loaded range"
          }
          description={
            activity.events.length > 0
              ? "Only heartbeats were recorded in this range. Switch to All events to see them."
              : activity.hasOlder
                ? `Nothing was emitted since block ${formatCount(activity.oldestBlock)}. Load older blocks to go further back.`
                : "This vault has not emitted any events yet."
          }
        />
      ) : (
        <ol className="flex flex-col px-4 py-3 sm:px-5" aria-label="Vault events, newest first">
          {visible.map((event, i) => (
            <EventRow
              key={event.id}
              event={event}
              chainId={chainId}
              now={now}
              isLast={i === visible.length - 1}
              label={label}
            />
          ))}
        </ol>
      )}

      {!activity.isLoading && !activity.isError && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
          <p className="text-[12px] text-text-faint">
            {activity.hasOlder
              ? `Showing events since block ${formatCount(activity.oldestBlock)}.`
              : "Showing the complete history."}
          </p>
          {activity.hasOlder && (
            <Button
              variant="secondary"
              size="sm"
              loading={activity.isFetchingOlder}
              onClick={activity.loadOlder}
            >
              Load older
            </Button>
          )}
        </div>
      )}
    </Panel>
  );
}

/* ===========================================================================
   One row
   =========================================================================== */

function EventRow({
  event,
  chainId,
  now,
  isLast,
  label,
}: {
  event: VaultEvent;
  chainId: number | undefined;
  now: number;
  isLast: boolean;
  label: (a: unknown) => string;
}) {
  const base = META[event.name] ?? { title: event.name, icon: ListDashes, tone: "neutral" as Tone };
  // initialize() emits OwnershipTransferred from the zero address. That is the
  // owner being set at creation, not a handover, and must not read as an
  // amber authority change.
  const meta = isInitialOwnership(event)
    ? { ...base, title: "Owner set", tone: "neutral" as Tone }
    : base;
  const tone = TONE_CLASSES[meta.tone];
  const Glyph = meta.icon;
  const href = explorerTxUrl(chainId, event.transactionHash);

  return (
    <li className="flex gap-3">
      {/* Rail */}
      <div className="flex flex-col items-center">
        <span className={clsx("flex size-7 shrink-0 items-center justify-center rounded-full border", tone.dot)}>
          <Glyph size={13} className={tone.icon} aria-hidden />
        </span>
        {!isLast && <span className="my-1 w-px flex-1 bg-line-strong" aria-hidden />}
      </div>

      {/* Content */}
      <div className={clsx("min-w-0 flex-1", isLast ? "pb-1" : "pb-4")}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 pt-1">
          <p className="text-[13px] font-medium text-text">{meta.title}</p>
          <p className="tnum text-[11px] text-text-faint">
            {event.timestamp !== undefined ? (
              <time dateTime={new Date(Number(event.timestamp) * 1000).toISOString()} title={formatTimestamp(event.timestamp)}>
                {formatRelative(event.timestamp, now)}
              </time>
            ) : (
              <>block {formatCount(event.blockNumber)}</>
            )}
          </p>
        </div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-text-dim">{describeEvent(event, label)}</p>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="tnum mt-1 inline-flex min-h-[24px] cursor-pointer items-center text-[11px] text-text-faint underline decoration-line-strong underline-offset-2 transition-colors duration-150 hover:text-text-dim hover:decoration-text-faint"
          >
            tx {event.transactionHash.slice(0, 10)}…
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
      </div>
    </li>
  );
}

/* ===========================================================================
   Copy
   =========================================================================== */

function asBig(v: unknown): bigint | undefined {
  return typeof v === "bigint" ? v : undefined;
}

const ZERO = "0x0000000000000000000000000000000000000000";

function isInitialOwnership(event: VaultEvent): boolean {
  return (
    event.name === "OwnershipTransferred" &&
    typeof event.args.previousOwner === "string" &&
    event.args.previousOwner.toLowerCase() === ZERO
  );
}

/** Name an address by its current role in this vault, else truncate it. */
function describeAddress(a: unknown, roles: { owner: Address; agent: Address; recovery: Address }): string {
  if (typeof a !== "string") return "an unknown address";
  const lower = a.toLowerCase();
  const short = truncateAddress(a, 4);
  if (lower === roles.recovery.toLowerCase()) return `the recovery address (${short})`;
  if (lower === roles.owner.toLowerCase()) return `the owner (${short})`;
  if (lower === roles.agent.toLowerCase()) return `the agent (${short})`;
  return short;
}

function describeEvent(event: VaultEvent, label: (a: unknown) => string): string {
  const a = event.args;
  switch (event.name) {
    case "Heartbeat":
      return asBig(a.pingCount) !== undefined
        ? `Ping #${formatCount(asBig(a.pingCount))} from ${label(a.agent)}. Countdown reset.`
        : `Proof of life from ${label(a.agent)}. Countdown reset.`;
    case "VaultFunded":
      return `${formatAmount(asBig(a.amount))} BOT from ${label(a.from)}. Balance now ${formatAmount(asBig(a.newBalance))} BOT.`;
    case "OwnerWithdrawal":
      return `${formatAmount(asBig(a.amount))} BOT sent to ${label(a.to)}.`;
    case "TokenWithdrawal":
      return `${formatAmount(asBig(a.amount))} (raw units) of ${truncateAddress(String(a.token))} sent to ${label(a.to)}.`;
    case "DeadManSwitchTriggered":
      return `${formatAmount(asBig(a.amountRescued))} BOT evacuated to ${label(a.recoveryAddress)}. Owner controls frozen.`;
    case "TokenRescued":
      return `${formatAmount(asBig(a.amount))} (raw units) of ${truncateAddress(String(a.token))} moved to ${label(a.recoveryAddress)}.`;
    case "TokenRescueFailed":
      return `${truncateAddress(String(a.token))} could not be swept and was skipped; the native rescue still went through.`;
    case "NativeSwept":
      return `${formatAmount(asBig(a.amount))} BOT that arrived after the trigger moved to ${label(a.recoveryAddress)}.`;
    case "TimeoutPeriodUpdated": {
      const prev = asBig(a.previousTimeout);
      const next = asBig(a.newTimeout);
      return prev !== undefined && next !== undefined
        ? `From ${describeTimeout(prev)} to ${describeTimeout(next)}.`
        : "Timeout period reconfigured.";
    }
    case "RecoveryAddressUpdated":
      return `From ${truncateAddress(String(a.previousRecovery))} to ${label(a.newRecovery)}. This is where funds go if the switch fires.`;
    case "AgentAddressUpdated":
      return `From ${truncateAddress(String(a.previousAgent))} to ${label(a.newAgent)}. The countdown was reset.`;
    case "OwnershipTransferred":
      return isInitialOwnership(event)
        ? `${truncateAddress(String(a.newOwner))} was set as owner when the vault was created.`
        : `From ${truncateAddress(String(a.previousOwner))} to ${label(a.newOwner)}.`;
    case "TrackedTokenAdded":
      return `${truncateAddress(String(a.token))} will be swept to recovery if the switch fires.`;
    case "TrackedTokenRemoved":
      return `${truncateAddress(String(a.token))} is no longer swept on trigger.`;
    case "SwitchRearmed":
      return `Returned to service by ${label(a.owner)}. The clock restarted.`;
    case "VaultInitialized": {
      const t = asBig(a.timeoutPeriod);
      return `Configured with a ${t !== undefined ? describeTimeout(t) : "set"} timeout, agent ${truncateAddress(String(a.agentAddress))}, recovery ${truncateAddress(String(a.recoveryAddress))}.`;
    }
    default:
      return "Contract event.";
  }
}
