import { clsx } from "clsx";
import { formatDuration, formatTimestamp } from "@/lib/format";
import { PHASE_META, type VaultView } from "@/lib/vaultState";

/**
 * The grace-period track: the protocol's central visual object.
 *
 * It answers the only question that matters about a vault: how much silence is
 * left before anyone can take the funds. A full track means the agent just
 * reported in; an empty one means the switch is live.
 *
 * Deliberately a depleting bar rather than a progress bar: progress fills toward
 * a goal, whereas this drains toward a failure. The tick marks give it the
 * character of a gauge rather than a loading indicator.
 */
export function GraceTrack({
  view,
  height = "md",
  showTicks = true,
  className,
}: {
  view: VaultView;
  height?: "sm" | "md" | "lg";
  showTicks?: boolean;
  className?: string;
}) {
  const meta = PHASE_META[view.phase];
  const pct = view.phase === "ALIVE" || view.phase === "EXPIRING" ? view.gracePct : 0;

  const heights = { sm: "h-1", md: "h-1.5", lg: "h-2" } as const;

  return (
    <div className={className}>
      <div
        className={clsx("relative w-full overflow-hidden rounded-full bg-ink-800", heights[height])}
        role="meter"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Grace period remaining: ${Math.round(pct)} percent. Status: ${meta.label}.`}
      >
        {/* Quartile ticks, so the bar reads as a measurement. */}
        {showTicks && (
          <div className="absolute inset-0 flex justify-between px-0" aria-hidden>
            {[25, 50, 75].map((t) => (
              <span
                key={t}
                className="absolute top-0 bottom-0 w-px bg-ink-950/70"
                style={{ left: `${t}%` }}
              />
            ))}
          </div>
        )}
        <div
          className={clsx(
            "relative h-full rounded-full transition-[width] duration-1000 ease-linear",
            meta.fill,
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * The countdown readout. Large tabular digits so the value is legible at a
 * glance and the width never jitters as digits roll over.
 */
export function GraceCountdown({
  view,
  size = "md",
  className,
}: {
  view: VaultView;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const meta = PHASE_META[view.phase];

  const sizes = {
    sm: "text-[15px]",
    md: "text-[22px]",
    lg: "text-[34px] sm:text-[44px]",
  } as const;

  const text = (() => {
    switch (view.phase) {
      case "TRIGGERED":
        return "Evacuated";
      case "EXECUTABLE":
        return "Lapsed";
      case "UNCONFIGURED":
        return "-";
      default:
        return formatDuration(view.liveSecondsRemaining);
    }
  })();

  const isCountdown = view.phase === "ALIVE" || view.phase === "EXPIRING";

  return (
    <span
      className={clsx(
        "tnum leading-none font-medium tracking-[-0.02em]",
        sizes[size],
        meta.tone,
        className,
      )}
      // Polite, not assertive: a per-second countdown announced assertively
      // would flood a screen reader. The phase change is what gets announced.
      aria-live="off"
      title={
        isCountdown
          ? `Switch becomes executable at ${formatTimestamp(view.deadline)}`
          : meta.description
      }
    >
      {text}
    </span>
  );
}

/**
 * Compact inline form for table rows: dot + countdown + track in one line.
 */
export function GraceInline({ view, className }: { view: VaultView; className?: string }) {
  return (
    <div className={clsx("flex items-center gap-3", className)}>
      <GraceCountdown view={view} size="sm" />
      <GraceTrack view={view} height="sm" showTicks={false} className="w-20 shrink-0" />
    </div>
  );
}
