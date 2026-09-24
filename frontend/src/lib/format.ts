import { formatUnits } from "viem";

/* ===========================================================================
   Durations
   =========================================================================== */

/**
 * Compact duration, e.g. "2d 04h 13m". Used for countdowns, so it must never
 * change width unpredictably — hence zero-padded components after the first.
 */
export function formatDuration(totalSeconds: bigint | number, opts?: { short?: boolean }): string {
  let s = typeof totalSeconds === "bigint" ? Number(totalSeconds) : totalSeconds;
  if (!Number.isFinite(s) || s <= 0) return "0s";
  s = Math.floor(s);

  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  const pad = (n: number) => String(n).padStart(2, "0");

  if (d > 0) return opts?.short ? `${d}d ${pad(h)}h` : `${d}d ${pad(h)}h ${pad(m)}m`;
  if (h > 0) return `${h}h ${pad(m)}m ${pad(sec)}s`;
  if (m > 0) return `${m}m ${pad(sec)}s`;
  return `${sec}s`;
}

/** Human phrase for a configured timeout, e.g. "24 hours". */
export function describeTimeout(seconds: bigint): string {
  const s = Number(seconds);
  if (s % 86_400 === 0 && s >= 86_400) {
    const d = s / 86_400;
    return d === 1 ? "1 day" : `${d} days`;
  }
  if (s % 3600 === 0 && s >= 3600) {
    const h = s / 3600;
    return h === 1 ? "1 hour" : `${h} hours`;
  }
  if (s % 60 === 0 && s >= 60) {
    const m = s / 60;
    return m === 1 ? "1 minute" : `${m} minutes`;
  }
  return `${s} seconds`;
}

/** Absolute timestamp for the user's locale. Unix seconds in. */
export function formatTimestamp(unixSeconds: bigint | number): string {
  const ms = Number(unixSeconds) * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** ISO-8601, for the title attribute alongside a relative time. */
export function formatIso(unixSeconds: bigint | number): string {
  const ms = Number(unixSeconds) * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return new Date(ms).toISOString();
}

/** "3m ago" / "in 2h 14m" relative to now. */
export function formatRelative(unixSeconds: bigint | number, nowSeconds: number): string {
  const target = Number(unixSeconds);
  if (!Number.isFinite(target) || target <= 0) return "—";
  const delta = target - nowSeconds;
  if (Math.abs(delta) < 2) return "just now";
  return delta < 0
    ? `${formatDuration(-delta, { short: true })} ago`
    : `in ${formatDuration(delta, { short: true })}`;
}

/* ===========================================================================
   Addresses
   =========================================================================== */

/** 0x1234…cdef */
export function truncateAddress(address: string | undefined, chars = 4): string {
  if (!address) return "—";
  if (address.length <= chars * 2 + 4) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

/** 0xabc…123 for tx hashes — slightly longer head, hashes are less familiar. */
export function truncateHash(hash: string | undefined): string {
  if (!hash) return "—";
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

export function sameAddress(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

/* ===========================================================================
   Amounts
   ---------------------------------------------------------------------------
   Native BOT has 18 decimals. Full precision is always available in a title
   attribute; the display form is trimmed so a table of balances stays scannable.
   =========================================================================== */

export function formatAmount(
  wei: bigint | undefined,
  opts?: { decimals?: number; maxFractionDigits?: number },
): string {
  if (wei === undefined) return "—";
  const decimals = opts?.decimals ?? 18;
  const maxFraction = opts?.maxFractionDigits ?? 4;

  const exact = formatUnits(wei, decimals);
  const [whole = "0", fraction = ""] = exact.split(".");

  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (!fraction) return groupedWhole;

  const trimmed = fraction.slice(0, maxFraction).replace(/0+$/, "");
  if (!trimmed) {
    // Non-zero but rounds to nothing at this precision — say so rather than lie.
    return wei > 0n ? `<0.${"0".repeat(maxFraction - 1)}1` : groupedWhole;
  }
  return `${groupedWhole}.${trimmed}`;
}

/** Full-precision string for title attributes and copy actions. */
export function formatAmountExact(wei: bigint | undefined, decimals = 18): string {
  if (wei === undefined) return "—";
  return formatUnits(wei, decimals);
}

/* ===========================================================================
   Misc
   =========================================================================== */

export function formatCount(n: bigint | number | undefined): string {
  if (n === undefined) return "—";
  return Number(n).toLocaleString();
}

/** Percentage of the grace window still remaining, clamped to 0..100. */
export function gracePercent(secondsRemaining: bigint, timeoutPeriod: bigint): number {
  if (timeoutPeriod <= 0n) return 0;
  const pct = (Number(secondsRemaining) / Number(timeoutPeriod)) * 100;
  return Math.max(0, Math.min(100, pct));
}
