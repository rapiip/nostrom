import { clsx } from "clsx";
import { PHASE_META, type VaultPhase } from "@/lib/vaultState";

/**
 * Vault phase indicator.
 *
 * Colour is never the only channel: every badge carries its text label, and the
 * ALIVE state additionally animates its dot. A colour-blind user reads "Alive",
 * "Expiring", "Executable" or "Triggered" directly.
 */
export function StatusBadge({
  phase,
  size = "md",
  className,
}: {
  phase: VaultPhase;
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = PHASE_META[phase];
  const isLive = phase === "ALIVE";

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 rounded border",
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-[12px]",
        meta.border,
        meta.tone,
        "bg-current/[0.07]",
        className,
      )}
      title={meta.description}
    >
      <span className={clsx(isLive ? "pulse-dot" : "size-1.5 shrink-0 rounded-full bg-current")} />
      <span className="font-medium tracking-[0.02em]">{meta.label}</span>
    </span>
  );
}

/**
 * Bare status dot, for dense table rows where the label lives in an adjacent
 * column. Carries an accessible name so it is not a silent colour swatch.
 */
export function StatusDot({ phase, className }: { phase: VaultPhase; className?: string }) {
  const meta = PHASE_META[phase];
  return (
    <span
      className={clsx(
        meta.tone,
        phase === "ALIVE" ? "pulse-dot" : "inline-block size-1.5 rounded-full bg-current",
        className,
      )}
      role="img"
      aria-label={`Status: ${meta.label}`}
      title={meta.description}
    />
  );
}
