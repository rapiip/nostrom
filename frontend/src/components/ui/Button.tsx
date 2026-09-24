import { clsx } from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * The single button primitive.
 *
 * Variants map to consequence, not to decoration:
 *   primary   the main action in its context
 *   secondary a real but non-primary action
 *   ghost     tertiary / navigational
 *   danger    irreversible or fund-moving (withdrawals, firing the switch)
 *
 * Press feedback never changes layout bounds — colour and border only — so
 * surrounding content cannot shift under the cursor.
 */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

/**
 * Variant styles, each with an EXPLICIT disabled treatment.
 *
 * A disabled control must stay readable. Fading a filled button's background
 * toward the page while keeping its dark label produces near-invisible text
 * (measured at 1.03:1 before this was fixed), so disabled filled buttons switch
 * to a muted surface with dimmed-but-legible text instead of going translucent.
 */
const VARIANTS: Record<Variant, string> = {
  primary: [
    "bg-signal text-ink-950 border-signal font-medium",
    "hover:bg-signal/90 active:bg-signal/80",
    "disabled:bg-ink-800 disabled:text-text-faint disabled:border-line-strong",
  ].join(" "),
  secondary: [
    "bg-ink-850 text-text border-line-strong",
    "hover:bg-ink-750 hover:border-text-faint active:bg-ink-800",
    "disabled:bg-ink-800 disabled:text-text-faint disabled:border-line",
  ].join(" "),
  ghost: [
    "bg-transparent text-text-dim border-transparent",
    "hover:text-text hover:bg-ink-850 active:bg-ink-800",
    "disabled:text-text-faint disabled:bg-transparent",
  ].join(" "),
  danger: [
    "bg-transparent text-danger border-danger-dim",
    "hover:bg-danger/10 hover:border-danger active:bg-danger/15",
    "disabled:text-text-faint disabled:border-line disabled:bg-transparent",
  ].join(" "),
};

const SIZES: Record<Size, string> = {
  // min-h keeps every control at or above a 44px touch target at md/lg, and
  // sm is only used inside already-padded rows where the row provides the target.
  sm: "text-[13px] px-2.5 py-1.5 gap-1.5 min-h-[32px]",
  md: "text-sm px-3.5 py-2.5 gap-2 min-h-[44px]",
  lg: "text-[15px] px-5 py-3 gap-2 min-h-[48px]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Decorative — callers must keep a visible text label or aria-label. */
  icon?: ReactNode;
  iconRight?: ReactNode;
  full?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  iconRight,
  full = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      {...rest}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={clsx(
        "inline-flex items-center justify-center rounded border",
        "transition-colors duration-150",
        // No blanket opacity: each variant defines a legible disabled surface.
        "disabled:cursor-not-allowed",
        !isDisabled && "cursor-pointer",
        VARIANTS[variant],
        SIZES[size],
        full && "w-full",
        className,
      )}
    >
      {loading ? <Spinner /> : icon}
      {children}
      {iconRight}
    </button>
  );
}

/** Inline spinner. Sized to the current font so it never shifts a button's box. */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={clsx("size-[1em] animate-spin", className)}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path
        d="M8 1.5A6.5 6.5 0 0 1 14.5 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Anchor styled as a button, for external links that leave the app. */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  full = false,
  className,
  children,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
  full?: boolean;
}) {
  return (
    <a
      {...rest}
      className={clsx(
        "inline-flex cursor-pointer items-center justify-center rounded border no-underline",
        "transition-colors duration-150",
        VARIANTS[variant],
        SIZES[size],
        full && "w-full",
        className,
      )}
    >
      {icon}
      {children}
      {iconRight}
    </a>
  );
}
