import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import type { Abi, Address, Hash } from "viem";
import { decodeTxError, type DecodedTxError } from "@/lib/errors";

/**
 * One transaction, one honest state machine.
 *
 *   idle      nothing started
 *   checking  simulating against current chain state, before the wallet opens
 *   signing   request sent to the wallet, waiting for the user
 *   pending   broadcast; hash known; waiting for a block
 *   success   RECEIPT RECEIVED AND receipt.status === "success"
 *   reverted  mined but the EVM reverted it
 *   error     never made it on-chain (declined, gas, network, or caught by
 *             the simulation)
 *
 * The distinction that matters: `success` requires a mined receipt whose status
 * is "success". Having a transaction hash means a node accepted the transaction,
 * not that it worked — and a mined transaction can still have reverted. Both are
 * surfaced separately so the UI can never congratulate the user on a transaction
 * that failed.
 *
 * `checking` exists because the UI's capability checks are only as fresh as the
 * last poll. Between render and click an agent can ping, another keeper can
 * fire the switch first, or an owner can withdraw. Simulating immediately
 * before signing turns those races into a decoded explanation instead of a
 * wallet prompt for a transaction that is certain to revert.
 *
 * `phase` is DERIVED from the receipt query rather than stored. Storing it would
 * mean mirroring query state into component state and keeping the two in sync,
 * which is exactly the class of bug that produces a "Confirmed" screen for a
 * reverted transaction. The only thing held in state is the user's intent and the
 * hash, both of which the query cannot know.
 */

export type TxPhase = "idle" | "checking" | "signing" | "pending" | "success" | "reverted" | "error";

export interface TxRequest {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
  /** Shown in the transaction dialog while the tx is in flight. */
  label: string;
  /** Shown once the receipt confirms success. */
  successMessage?: string;
}

export interface TxState {
  phase: TxPhase;
  hash: Hash | undefined;
  label: string | undefined;
  successMessage: string | undefined;
  error: DecodedTxError | undefined;
  blockNumber: bigint | undefined;
  gasUsed: bigint | undefined;
  /** True from the pre-sign check until the receipt resolves. */
  isBusy: boolean;
  isSettled: boolean;
  /** The failure was caught by simulation: the wallet was never asked. */
  failedBeforeSigning: boolean;
}

export interface UseTransactionResult extends TxState {
  send: (request: TxRequest) => void;
  reset: () => void;
}

const REQUIRED_CONFIRMATIONS = 1;

/** What the user asked for. Everything else is derived from the chain. */
type Submission =
  | { status: "idle" }
  | { status: "checking"; label: string; successMessage?: string }
  | { status: "signing"; label: string; successMessage?: string }
  | { status: "submitted"; label: string; successMessage?: string; hash: Hash }
  | { status: "failed"; label: string; error: DecodedTxError; beforeSigning: boolean };

const REVERTED_ERROR: DecodedTxError = {
  kind: "revert",
  title: "Transaction reverted on-chain",
  detail:
    "The transaction was included in a block but the contract rejected it. Gas was consumed; no state changed.",
};

export function useTransaction(options?: {
  /** Called only after a receipt with status "success". */
  onConfirmed?: (hash: Hash) => void;
}): UseTransactionResult {
  const writeContract = useWriteContract();
  const publicClient = usePublicClient();
  const { address: account } = useConnection();
  const [submission, setSubmission] = useState<Submission>({ status: "idle" });
  /** Bumped by every send/reset, so a late simulation result cannot resurrect a cancelled request. */
  const runId = useRef(0);

  const hash = submission.status === "submitted" ? submission.hash : undefined;

  const receipt = useWaitForTransactionReceipt({
    hash,
    confirmations: REQUIRED_CONFIRMATIONS,
    query: { enabled: Boolean(hash) },
  });

  /* --- Derived phase ---------------------------------------------------- */
  const { phase, error } = useMemo<{ phase: TxPhase; error: DecodedTxError | undefined }>(() => {
    switch (submission.status) {
      case "idle":
        return { phase: "idle", error: undefined };
      case "checking":
        return { phase: "checking", error: undefined };
      case "signing":
        return { phase: "signing", error: undefined };
      case "failed":
        return { phase: "error", error: submission.error };
      case "submitted": {
        if (receipt.isError) return { phase: "error", error: decodeTxError(receipt.error) };
        if (!receipt.data) return { phase: "pending", error: undefined };
        return receipt.data.status === "success"
          ? { phase: "success", error: undefined }
          : { phase: "reverted", error: REVERTED_ERROR };
      }
      default:
        return { phase: "idle", error: undefined };
    }
  }, [submission, receipt.isError, receipt.error, receipt.data]);

  /* --- Confirmation callback ------------------------------------------- */
  // An effect is the right place for this: it notifies an external consumer of a
  // state transition, and it sets no state of its own. The ref guard makes it
  // fire exactly once per hash even if the effect re-runs.
  const onConfirmedRef = useRef(options?.onConfirmed);
  useEffect(() => {
    onConfirmedRef.current = options?.onConfirmed;
  }, [options?.onConfirmed]);

  const notifiedFor = useRef<Hash | undefined>(undefined);
  useEffect(() => {
    if (phase !== "success" || !hash) return;
    if (notifiedFor.current === hash) return;
    notifiedFor.current = hash;
    onConfirmedRef.current?.(hash);
  }, [phase, hash]);

  /* --- Commands -------------------------------------------------------- */
  const send = useCallback(
    (request: TxRequest) => {
      notifiedFor.current = undefined;
      const id = ++runId.current;
      const meta = {
        label: request.label,
        ...(request.successMessage !== undefined
          ? { successMessage: request.successMessage }
          : {}),
      };
      const call = {
        address: request.address,
        abi: request.abi,
        functionName: request.functionName,
        args: request.args as never,
        ...(request.value !== undefined ? { value: request.value } : {}),
      };

      const sign = () => {
        setSubmission({ status: "signing", ...meta });
        writeContract.mutate(call as never, {
          onSuccess: (txHash) => {
            if (runId.current !== id) return;
            // A hash only means "a node accepted it". Move to submitted, and let
            // the receipt decide whether that becomes success or reverted.
            setSubmission({ status: "submitted", ...meta, hash: txHash });
          },
          onError: (err) => {
            if (runId.current !== id) return;
            setSubmission({
              status: "failed",
              label: request.label,
              error: decodeTxError(err),
              beforeSigning: false,
            });
          },
        });
      };

      if (!publicClient || !account) {
        sign();
        return;
      }

      setSubmission({ status: "checking", ...meta });
      void (async () => {
        try {
          await publicClient.simulateContract({ ...call, account } as never);
        } catch (err) {
          if (runId.current !== id) return;
          const decoded = decodeTxError(err);
          // Only a contract revert is a verdict on the transaction. An RPC
          // hiccup or a node that cannot simulate says nothing about it, so
          // the wallet gets to run its own estimate instead of being skipped.
          if (decoded.kind === "revert") {
            setSubmission({ status: "failed", label: request.label, error: decoded, beforeSigning: true });
            return;
          }
        }
        if (runId.current !== id) return;
        sign();
      })();
    },
    [writeContract, publicClient, account],
  );

  const reset = useCallback(() => {
    runId.current += 1;
    notifiedFor.current = undefined;
    setSubmission({ status: "idle" });
    writeContract.reset();
  }, [writeContract]);

  const label = submission.status === "idle" ? undefined : submission.label;
  const successMessage =
    submission.status === "checking" || submission.status === "signing" || submission.status === "submitted"
      ? submission.successMessage
      : undefined;

  return {
    phase,
    hash,
    label,
    successMessage,
    error,
    blockNumber: receipt.data?.blockNumber,
    gasUsed: receipt.data?.gasUsed,
    isBusy: phase === "checking" || phase === "signing" || phase === "pending",
    isSettled: phase === "success" || phase === "reverted" || phase === "error",
    failedBeforeSigning: submission.status === "failed" && submission.beforeSigning,
    send,
    reset,
  };
}
