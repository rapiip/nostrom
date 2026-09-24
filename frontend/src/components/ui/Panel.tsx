import { clsx } from "clsx";
import type { ReactNode } from "react";

/**
 * Layout and data-display primitives.
 *
 * Deliberately few. The rule followed throughout: a Panel exists to GROUP
 * related facts, not to decorate a single one. Individual readings are laid out
 * as label/value rows inside a panel, never as one card each — hierarchy comes
 * from type weight and space, not from nested borders.
 */

/* ===========================================================================
   Panel
   =========================================================================== */

export function Panel({
  children,
  className,
  inset = false,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  /** Darker recessed surface, for a panel inside a panel. */
  inset?: boolean;
  as?: "section" | "div" | "article" | "aside";
}) {
  return (
    <Tag
      className={clsx(
        "rounded-md border",
        inset ? "border-line bg-ink-800" : "border-line bg-ink-900",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function PanelHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-line px-4 py-3.5 sm:px-5",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[15px] font-medium tracking-[-0.01em] text-text">{title}</h2>
        {description && (
          <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-text-dim">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PanelBody({
  children,
  className,
  flush = false,
}: {
  children: ReactNode;
  className?: string;
  /** No padding — for tables and full-bleed rows. */
  flush?: boolean;
}) {
  return <div className={clsx(!flush && "px-4 py-4 sm:px-5", className)}>{children}</div>;
}

/* ===========================================================================
   Labels
   =========================================================================== */

/** Small mono uppercase label. The workhorse of the data-dense sections. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx("label", className)}>{children}</span>;
}

/** Section eyebrow with a leading rule, used on the landing page. */
export function Eyebrow({
  children,
  className,
  index,
}: {
  children: ReactNode;
  className?: string;
  /** Section number, e.g. "02". Reinforces the technical, documented feel. */
  index?: string;
}) {
  return (
    <div className={clsx("flex items-center gap-3", className)}>
      {index && <span className="tnum text-[11px] font-medium text-signal">{index}</span>}
      <span className="h-px w-8 bg-line-strong" aria-hidden />
      <Label>{children}</Label>
    </div>
  );
}

/* ===========================================================================
   Key/value rows
   =========================================================================== */

/**
 * One labelled reading. Stacks on narrow screens, aligns into two columns from
 * `sm` up so a column of values reads as a table without needing table markup.
 */
export function DataRow({
  label,
  children,
  hint,
  className,
  align = "right",
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
  align?: "right" | "left";
}) {
  return (
    <div
      className={clsx(
        "flex flex-col gap-1 border-b border-line py-2.5 last:border-b-0",
        "sm:flex-row sm:items-baseline sm:justify-between sm:gap-6",
        className,
      )}
    >
      <dt className="label pt-0.5 sm:pt-0">{label}</dt>
      <dd
        className={clsx(
          "min-w-0 text-[13px] text-text",
          align === "right" ? "sm:text-right" : "sm:text-left",
        )}
      >
        {children}
        {hint && <div className="mt-0.5 text-[12px] text-text-faint">{hint}</div>}
      </dd>
    </div>
  );
}

export function DataList({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={clsx("flex flex-col", className)}>{children}</dl>;
}

/**
 * A headline figure. Used sparingly — at most a handful per screen, or they
 * stop being headlines.
 */
export function Stat({
  label,
  value,
  unit,
  hint,
  tone = "default",
  className,
  title,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "signal" | "warn" | "danger" | "dim";
  className?: string;
  title?: string;
}) {
  const tones = {
    default: "text-text",
    signal: "text-signal",
    warn: "text-warn",
    danger: "text-danger",
    dim: "text-text-dim",
  } as const;

  return (
    <div className={clsx("min-w-0", className)}>
      <Label>{label}</Label>
      <div className="mt-2 flex items-baseline gap-1.5" title={title}>
        <span
          className={clsx(
            "tnum truncate text-[22px] leading-none font-medium tracking-[-0.02em]",
            tones[tone],
          )}
        >
          {value}
        </span>
        {unit && <span className="text-[12px] text-text-faint">{unit}</span>}
      </div>
      {hint && <div className="mt-1.5 text-[12px] leading-snug text-text-faint">{hint}</div>}
    </div>
  );
}

/* ===========================================================================
   Loading and empty states
   =========================================================================== */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={clsx("animate-pulse rounded bg-ink-800", className)}
      aria-hidden="true"
    />
  );
}

/** Skeleton shaped like the vault rows it replaces, to avoid a layout jump. */
export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading vaults…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-line px-4 py-4 sm:px-5">
          <Skeleton className="size-2 rounded-full" />
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="ml-auto h-3.5 w-20" />
          <Skeleton className="hidden h-3.5 w-24 sm:block" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-col items-center px-6 py-14 text-center", className)}>
      {icon && <div className="mb-4 text-text-faint">{icon}</div>}
      <p className="text-[15px] font-medium text-text">{title}</p>
      {description && (
        <p className="mt-2 max-w-md text-[13px] leading-relaxed text-text-dim">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/* ===========================================================================
   Inline notices
   =========================================================================== */

export function Notice({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: "info" | "warn" | "danger" | "signal";
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-line-strong bg-ink-850 text-text-dim",
    signal: "border-signal-dim bg-signal/[0.06] text-text-dim",
    warn: "border-warn-dim bg-warn/[0.06] text-text-dim",
    danger: "border-danger-dim bg-danger/[0.06] text-text-dim",
  } as const;

  const titleTones = {
    info: "text-text",
    signal: "text-signal",
    warn: "text-warn",
    danger: "text-danger",
  } as const;

  return (
    <div
      className={clsx("rounded border px-3.5 py-3", tones[tone], className)}
      // Danger notices report a state the user must act on, so announce them.
      role={tone === "danger" ? "alert" : undefined}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          {title && (
            <p className={clsx("text-[13px] font-medium", titleTones[tone])}>{title}</p>
          )}
          {children && (
            <div className={clsx("text-[13px] leading-relaxed", title && "mt-1")}>{children}</div>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
