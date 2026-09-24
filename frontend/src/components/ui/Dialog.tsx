import { clsx } from "clsx";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";

/**
 * Modal dialog.
 *
 * Uses the native <dialog> element so focus trapping, the top layer and Escape
 * handling come from the platform rather than from hand-rolled key listeners.
 * Behaviour added on top:
 *   - Escape is intercepted when `dismissible` is false, so a transaction that
 *     is mid-flight cannot be dismissed by accident.
 *   - Focus returns to the trigger on close (native behaviour, preserved by not
 *     unmounting the trigger).
 *   - Clicking the backdrop closes only when dismissible.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissible = true,
  size = "md",
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** False while a transaction is in flight. */
  dismissible?: boolean;
  size?: "sm" | "md" | "lg";
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const handleCancel = useCallback(
    (event: React.SyntheticEvent<HTMLDialogElement>) => {
      // Fires on Escape. Block it outright while non-dismissible.
      event.preventDefault();
      if (dismissible) onClose();
    },
    [dismissible, onClose],
  );

  const handleBackdrop = useCallback(
    (event: React.MouseEvent<HTMLDialogElement>) => {
      if (!dismissible) return;
      // The dialog element itself is the backdrop; the inner div is the panel.
      if (event.target === ref.current) onClose();
    },
    [dismissible, onClose],
  );

  const sizes = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" } as const;

  return (
    <dialog
      ref={ref}
      onCancel={handleCancel}
      onClick={handleBackdrop}
      aria-labelledby={labelledBy}
      className={clsx(
        "m-auto w-[calc(100vw-2rem)] bg-transparent p-0 text-text backdrop:bg-ink-950/80",
        // Backdrop blur is used once, here, where it genuinely isolates the
        // foreground rather than as a decorative glass effect.
        "backdrop:backdrop-blur-[2px]",
        sizes[size],
      )}
    >
      {open && (
        <div className="max-h-[calc(100dvh-4rem)] overflow-y-auto rounded-lg border border-line-strong bg-ink-900 shadow-2xl shadow-ink-950">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 id={labelledBy} className="text-[15px] font-medium text-text">
                {title}
              </h2>
              {description && (
                <p className="mt-1 text-[13px] leading-relaxed text-text-dim">{description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={!dismissible}
              aria-label="Close dialog"
              className={clsx(
                "-mr-1.5 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded",
                "text-text-faint transition-colors duration-150",
                dismissible
                  ? "cursor-pointer hover:bg-ink-800 hover:text-text"
                  : "cursor-not-allowed opacity-40",
              )}
            >
              <X size={15} aria-hidden />
            </button>
          </div>

          {children && <div className="px-5 py-4">{children}</div>}

          {footer && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}

/**
 * Confirmation step for irreversible actions.
 *
 * Shown before anything is sent to the wallet, and it states the consequence in
 * plain language. Used for withdrawals, ownership transfer, and firing the
 * switch — actions that move funds or hand over control.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  consequence,
  confirmLabel,
  tone = "danger",
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  consequence: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  children?: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] cursor-pointer items-center rounded border border-line-strong bg-ink-850 px-3.5 text-sm text-text transition-colors duration-150 hover:bg-ink-750"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={clsx(
              "inline-flex min-h-[44px] cursor-pointer items-center rounded border px-3.5 text-sm font-medium transition-colors duration-150",
              tone === "danger"
                ? "border-danger bg-danger/10 text-danger hover:bg-danger/20"
                : "border-signal bg-signal text-ink-950 hover:bg-signal/90",
            )}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-[13px] leading-relaxed text-text-dim">{consequence}</div>
      {children && <div className="mt-4">{children}</div>}
    </Dialog>
  );
}

/** Renders into document.body, for overlays that must escape their container. */
export function Portal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
