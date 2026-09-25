import { clsx } from "clsx";
import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { Warning } from "@phosphor-icons/react";
import type { FieldResult } from "@/lib/validation";

/**
 * Form field.
 *
 * Every input is labelled, and errors are wired to the control with
 * aria-describedby + aria-invalid so a screen reader announces the reason a
 * field was rejected rather than just that something is wrong. The error slot
 * reserves no fixed height, but it is rendered below all other content so
 * appearing does not push the input itself.
 */

export interface FieldProps {
  label: string;
  /** Persistent guidance, shown when there is no error. */
  hint?: ReactNode;
  result?: FieldResult;
  required?: boolean;
  /** Extra content on the label row, e.g. a "Use my address" shortcut. */
  aside?: ReactNode;
  children: (props: {
    id: string;
    "aria-invalid": boolean | undefined;
    "aria-describedby": string | undefined;
  }) => ReactNode;
  className?: string;
}

export function Field({
  label,
  hint,
  result,
  required,
  aside,
  children,
  className,
}: FieldProps) {
  const id = useId();
  const messageId = `${id}-message`;

  const hasError = result?.ok === false && Boolean(result.error);
  const hasWarning = !hasError && Boolean(result?.warning);
  const message = hasError ? result?.error : hasWarning ? result?.warning : undefined;

  return (
    <div className={clsx("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-medium text-text">
          {label}
          {required && (
            <>
              <span aria-hidden className="ml-1 text-danger">
                *
              </span>
              <span className="sr-only"> (required)</span>
            </>
          )}
        </label>
        {aside}
      </div>

      {children({
        id,
        "aria-invalid": hasError || undefined,
        "aria-describedby": message || hint ? messageId : undefined,
      })}

      <div id={messageId} className="text-[12px] leading-snug">
        {message ? (
          <p
            className={clsx(
              "flex items-start gap-1.5",
              hasError ? "text-danger" : "text-warn",
            )}
            role={hasError ? "alert" : undefined}
          >
            <Warning size={13} className="mt-px shrink-0" aria-hidden />
            <span>{message}</span>
          </p>
        ) : hint ? (
          <p className="text-text-faint">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}

/* ===========================================================================
   Controls
   =========================================================================== */

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Trailing adornment, e.g. a "BOT" unit or a MAX button. */
  suffix?: ReactNode;
  invalid?: boolean;
  mono?: boolean;
}

export function Input({ suffix, invalid, mono = false, className, ...rest }: InputProps) {
  return (
    <div
      className={clsx(
        "flex items-center gap-2 rounded border bg-ink-800 transition-all duration-150",
        "shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)]",
        "focus-within:border-signal focus-within:ring-1 focus-within:ring-signal/30",
        invalid
          ? "border-danger focus-within:border-danger focus-within:ring-danger/30"
          : "border-line-strong hover:border-text-faint",
        className,
      )}
    >
      <input
        {...rest}
        aria-invalid={invalid || undefined}
        className={clsx(
          "min-h-[44px] w-full min-w-0 bg-transparent px-3 py-2.5 text-[14px] text-text",
          "placeholder:text-text-faint focus:outline-none",
          // The focus ring lives on the wrapper via focus-within, so suppress
          // the inner one to avoid a double ring.
          "focus-visible:outline-none",
          mono && "tnum text-[13px]",
        )}
      />
      {suffix && <div className="flex shrink-0 items-center gap-1 pr-2">{suffix}</div>}
    </div>
  );
}

/** Unit label inside an input, e.g. "BOT". */
export function InputUnit({ children }: { children: ReactNode }) {
  return <span className="label pr-1">{children}</span>;
}

/**
 * Segmented choice, used for timeout presets. A real radiogroup rather than
 * styled buttons, so arrow-key navigation and selected state are announced.
 */
export function SegmentedGroup({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; note?: string }[];
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={clsx("grid grid-cols-2 gap-1.5 sm:grid-cols-3", className)}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            title={opt.note}
            className={clsx(
              "cursor-pointer rounded border px-3.5 py-2.5 text-left transition-all duration-150",
              selected
                ? "border-signal bg-signal/[0.08] text-text shadow-[inset_0_1px_0_rgba(125,211,160,0.2)]"
                : "border-line-strong bg-ink-800 text-text-dim hover:border-text-faint hover:text-text hover:bg-ink-750",
            )}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="block text-[13px] font-medium">{opt.label}</span>
              {selected && (
                <span
                  className="size-1.5 shrink-0 rounded-full bg-signal shadow-[0_0_6px_rgba(125,211,160,0.8)]"
                  aria-hidden
                />
              )}
            </div>
            {opt.note && (
              <span className="mt-0.5 block text-[11px] leading-snug text-text-faint">
                {opt.note}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Disclosure for advanced options that most users should leave alone. */
export function Disclosure({
  summary,
  children,
  className,
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={clsx("group rounded border border-line bg-ink-850", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-3 text-[13px] text-text-dim transition-colors duration-150 hover:text-text">
        <svg
          viewBox="0 0 12 12"
          className="size-3 shrink-0 transition-transform duration-200 group-open:rotate-90"
          aria-hidden
        >
          <path d="M4 2.5 8 6l-4 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        {summary}
      </summary>
      <div className="border-t border-line px-3.5 py-4">{children}</div>
    </details>
  );
}
