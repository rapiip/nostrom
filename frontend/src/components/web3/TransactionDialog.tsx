import { clsx } from "clsx";
import {
  ArrowSquareOut,
  CheckCircle,
  Prohibit,
  WarningCircle,
  WarningOctagon,
} from "@phosphor-icons/react";
import { explorerTxUrl } from "@/config/chains";
import { formatCount } from "@/lib/format";
import { Button, Spinner } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TxHashDisplay } from "@/components/ui/Address";
import type { TxState } from "@/hooks/useTransaction";

/**
 * Transaction progress dialog.
 *
 * The contract this component upholds: the success treatment appears ONLY in the
 * `success` phase, which useTransaction sets exclusively from a mined receipt
 * whose status is "success". A broadcast transaction with a known hash sits in
 * `pending` with an indeterminate bar and the explicit line "Waiting for a block".
 * A mined-but-reverted transaction gets the failure treatment, not the success
 * one, even though it has a hash and a block number.
 *
 * The dialog is non-dismissible while signing or pending, so a user cannot lose
 * track of an in-flight transaction by clicking outside.
 */

const STEPS = [
  { key: "signing", label: "Sign in wallet" },
  { key: "pending", label: "Waiting for a block" },
  { key: "success", label: "Confirmed" },
] as const;

function stepIndexFor(phase: TxState["phase"]): number {
  switch (phase) {
    case "signing":
      return 0;
    case "pending":
      return 1;
    case "success":
      return 2;
    case "reverted":
      return 1;
    default:
      return 0;
  }
}

export function TransactionDialog({
  tx,
  chainId,
  onClose,
  /** Extra content shown after a confirmed transaction, e.g. a link to the new vault. */
  successSlot,
}: {
  tx: TxState & { reset: () => void };
  chainId: number | undefined;
  onClose?: () => void;
  successSlot?: React.ReactNode;
}) {
  const open = tx.phase !== "idle";
  const dismissible = !tx.isBusy;

  const close = () => {
    if (!dismissible) return;
    tx.reset();
    onClose?.();
  };

  const isFailure = tx.phase === "error" || tx.phase === "reverted";
  const isRejected = tx.error?.kind === "rejected";

  const title = (() => {
    switch (tx.phase) {
      case "signing":
        return "Confirm in your wallet";
      case "pending":
        return "Transaction submitted";
      case "success":
        return "Transaction confirmed";
      case "reverted":
        return "Transaction reverted";
      case "error":
        return isRejected ? "Signature declined" : "Transaction failed";
      default:
        return "Transaction";
    }
  })();

  return (
    <Dialog
      open={open}
      onClose={close}
      dismissible={dismissible}
      title={title}
      description={tx.label}
      size="md"
      footer={
        <>
          {tx.isBusy ? (
            <p className="mr-auto self-center text-[12px] text-text-faint">
              Keep this tab open until the transaction settles.
            </p>
          ) : null}
          <Button variant={tx.phase === "success" ? "primary" : "secondary"} onClick={close} disabled={!dismissible}>
            {tx.phase === "success" ? "Done" : "Close"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {/* --- Step trail ------------------------------------------------- */}
        {!isFailure || tx.phase === "reverted" ? (
          <ol className="flex flex-col gap-0" aria-label="Transaction progress">
            {STEPS.map((step, i) => {
              const current = stepIndexFor(tx.phase);
              const isDone = i < current || tx.phase === "success";
              const isActive = i === current && tx.phase !== "success";
              const isFailedHere = tx.phase === "reverted" && i === 1;

              return (
                <li key={step.key} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={clsx(
                        "flex size-5 shrink-0 items-center justify-center rounded-full border",
                        isFailedHere
                          ? "border-danger text-danger"
                          : isDone
                            ? "border-signal bg-signal text-ink-950"
                            : isActive
                              ? "border-signal text-signal"
                              : "border-line-strong text-text-faint",
                      )}
                    >
                      {isFailedHere ? (
                        <WarningOctagon size={12} weight="bold" aria-hidden />
                      ) : isDone ? (
                        <CheckSmall />
                      ) : isActive ? (
                        <Spinner className="size-3" />
                      ) : (
                        <span className="tnum text-[10px]">{i + 1}</span>
                      )}
                    </span>
                    {i < STEPS.length - 1 && (
                      <span
                        className={clsx(
                          "my-1 w-px flex-1 self-center",
                          isDone ? "bg-signal/40" : "bg-line-strong",
                        )}
                        style={{ minHeight: 14 }}
                        aria-hidden
                      />
                    )}
                  </div>

                  <div className="pb-3">
                    <p
                      className={clsx(
                        "text-[13px]",
                        isFailedHere
                          ? "text-danger"
                          : isDone || isActive
                            ? "text-text"
                            : "text-text-faint",
                      )}
                    >
                      {isFailedHere ? "Reverted in block" : step.label}
                    </p>
                    {isActive && step.key === "signing" && (
                      <p className="mt-0.5 text-[12px] text-text-faint">
                        Nothing has been sent to the chain yet.
                      </p>
                    )}
                    {isActive && step.key === "pending" && (
                      <p className="mt-0.5 text-[12px] text-text-faint">
                        Submitted to the network. Confirmation time depends on block production —
                        this is not a guarantee of success.
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : null}

        {/* --- Indeterminate bar while in the mempool --------------------- */}
        {tx.phase === "pending" && (
          <div
            className="indeterminate h-0.5 w-full overflow-hidden rounded-full bg-ink-800 text-signal"
            role="progressbar"
            aria-label="Waiting for confirmation"
          />
        )}

        {/* --- Outcome --------------------------------------------------- */}
        {tx.phase === "success" && (
          <div className="flex items-start gap-2.5 rounded border border-signal-dim bg-signal/[0.06] px-3.5 py-3">
            <CheckCircle size={16} className="mt-px shrink-0 text-signal" aria-hidden />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-signal">
                {tx.successMessage ?? "Confirmed on-chain."}
              </p>
              <p className="mt-1 text-[12px] text-text-dim">
                Included in block {formatCount(tx.blockNumber)}
                {tx.gasUsed !== undefined && ` · ${formatCount(tx.gasUsed)} gas used`}.
              </p>
            </div>
          </div>
        )}

        {isFailure && tx.error && (
          <div
            role="alert"
            className={clsx(
              "flex items-start gap-2.5 rounded border px-3.5 py-3",
              isRejected
                ? "border-line-strong bg-ink-850"
                : "border-danger-dim bg-danger/[0.06]",
            )}
          >
            {isRejected ? (
              <Prohibit size={16} className="mt-px shrink-0 text-text-dim" aria-hidden />
            ) : (
              <WarningCircle size={16} className="mt-px shrink-0 text-danger" aria-hidden />
            )}
            <div className="min-w-0">
              <p
                className={clsx(
                  "text-[13px] font-medium",
                  isRejected ? "text-text" : "text-danger",
                )}
              >
                {tx.error.title}
              </p>
              {tx.error.detail && (
                <p className="mt-1 text-[12px] leading-relaxed text-text-dim">{tx.error.detail}</p>
              )}
              {tx.error.errorName && (
                <p className="tnum mt-2 text-[11px] text-text-faint">
                  Contract error: {tx.error.errorName}
                </p>
              )}
              {tx.phase === "reverted" && (
                <p className="mt-2 text-[12px] text-text-dim">
                  No state changed. Gas was consumed because the transaction was mined before it
                  reverted.
                </p>
              )}
            </div>
          </div>
        )}

        {/* --- Receipt details ------------------------------------------- */}
        {tx.hash && (
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="label">Transaction hash</span>
              <TxHashDisplay hash={tx.hash} chainId={chainId} />
            </div>
            {!explorerTxUrl(chainId, tx.hash) && (
              <p className="text-[12px] text-text-faint">
                No block explorer is configured for this network.
              </p>
            )}
          </div>
        )}

        {tx.phase === "success" && successSlot}
      </div>
    </Dialog>
  );
}

function CheckSmall() {
  return (
    <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
      <path
        d="M2.5 6.2 4.8 8.5 9.5 3.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Compact inline transaction status, for places where a modal would be too
 * heavy (e.g. a keeper table where several executions can run in sequence).
 */
export function TxInlineStatus({
  tx,
  chainId,
  className,
}: {
  tx: TxState;
  chainId: number | undefined;
  className?: string;
}) {
  if (tx.phase === "idle") return null;

  const tone =
    tx.phase === "success"
      ? "text-signal"
      : tx.phase === "error" || tx.phase === "reverted"
        ? "text-danger"
        : "text-text-dim";

  const text = (() => {
    switch (tx.phase) {
      case "signing":
        return "Awaiting signature…";
      case "pending":
        return "Waiting for a block…";
      case "success":
        return tx.successMessage ?? "Confirmed";
      case "reverted":
        return "Reverted on-chain";
      case "error":
        return tx.error?.title ?? "Failed";
      default:
        return "";
    }
  })();

  const href = tx.hash ? explorerTxUrl(chainId, tx.hash) : null;

  return (
    <span
      className={clsx("inline-flex items-center gap-2 text-[12px]", tone, className)}
      aria-live="polite"
    >
      {tx.isBusy && <Spinner className="size-3" />}
      <span>{text}</span>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex cursor-pointer items-center gap-1 underline decoration-current/30 underline-offset-2 hover:decoration-current"
        >
          Explorer
          <ArrowSquareOut size={10} aria-hidden />
        </a>
      )}
    </span>
  );
}
