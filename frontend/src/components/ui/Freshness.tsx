import { clsx } from "clsx";
import { ArrowClockwise } from "@phosphor-icons/react";
import { useClock } from "@/hooks/useClock";
import { formatDuration } from "@/lib/format";

/**
 * Data freshness + manual refresh, as one control.
 *
 * On a screen whose whole job is "how long until the funds can be taken", the
 * age of the reading matters as much as the reading. The countdowns interpolate
 * locally between polls, so they always LOOK live; this is what tells the user
 * whether the numbers behind them are 3 seconds old or 3 minutes old (a flaky
 * RPC, a laptop waking from sleep).
 *
 *   fresh   "Updated 4s ago"
 *   stale   past `staleAfter` seconds: amber, so a dead RPC is not mistaken
 *           for a quiet chain
 *   busy    icon spins while any background refetch is in flight
 *
 * The age text is aria-hidden and re-rendered every second, which would be a
 * torrent of announcements if it were live. Screen readers get the button's
 * label instead, which states the age at the moment they reach it.
 */
export function Freshness({
  updatedAt,
  isFetching,
  onRefresh,
  staleAfter = 60,
  label = "Refresh",
  className,
}: {
  /** Milliseconds since epoch. */
  updatedAt: number | undefined;
  isFetching: boolean;
  onRefresh: () => void;
  /** Seconds after which the reading is flagged as stale. */
  staleAfter?: number;
  label?: string;
  className?: string;
}) {
  const now = useClock();
  const ageSeconds = updatedAt ? Math.max(0, now - Math.floor(updatedAt / 1000)) : undefined;
  const stale = ageSeconds !== undefined && ageSeconds > staleAfter;

  const ageText =
    ageSeconds === undefined
      ? "Not loaded yet"
      : ageSeconds < 3
        ? "Updated just now"
        : `Updated ${formatDuration(ageSeconds, { short: true })} ago`;

  return (
    <div className={clsx("flex items-center gap-2", className)}>
      <span
        aria-hidden
        className={clsx(
          "tnum hidden text-[11px] sm:inline",
          stale ? "text-warn" : "text-text-faint",
        )}
        title={updatedAt ? new Date(updatedAt).toLocaleString() : undefined}
      >
        {ageText}
      </span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={isFetching}
        aria-label={`${label}. ${ageText}${stale ? ", may be out of date" : ""}.`}
        aria-busy={isFetching || undefined}
        className={clsx(
          "inline-flex min-h-[32px] items-center gap-1.5 rounded border px-2.5 text-[13px] transition-all duration-150",
          stale
            ? "border-warn-dim text-warn hover:bg-warn/10"
            : "border-transparent text-text-dim hover:bg-ink-850 hover:text-text",
          isFetching ? "cursor-progress" : "cursor-pointer active:scale-[0.985]",
        )}
      >
        <ArrowClockwise
          size={13}
          aria-hidden
          className={clsx(isFetching && "animate-spin motion-reduce:animate-none")}
        />
        {label}
      </button>
    </div>
  );
}
