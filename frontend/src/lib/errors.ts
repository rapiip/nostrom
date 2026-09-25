import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  type Address,
} from "viem";
import { formatAmount, formatDuration, truncateAddress } from "./format";

/**
 * Turns a viem/wagmi error into something a user can act on.
 *
 * Every custom error in contracts/NostromFactory.sol is mapped by name, with its
 * arguments interpolated. A raw `execution reverted (unknown custom error)` is
 * useless to a vault owner; "You are not the owner of this vault" is not.
 *
 * `kind` drives presentation:
 *   rejected:  user declined in the wallet. Not a failure; show quietly.
 *   revert:    the contract refused. Explain why; the tx cost nothing.
 *   wallet:    funds/gas/network problem before the chain saw anything.
 *   unknown:   fall back to the raw short message.
 */

export type TxErrorKind = "rejected" | "revert" | "wallet" | "unknown";

export interface DecodedTxError {
  kind: TxErrorKind;
  title: string;
  detail?: string;
  /** Name of the decoded custom error, when there was one. */
  errorName?: string;
}

function addr(value: unknown): string {
  return typeof value === "string" ? truncateAddress(value as Address, 6) : "-";
}

function num(value: unknown): bigint {
  return typeof value === "bigint" ? value : 0n;
}

/** Custom error name -> human explanation. */
function explainCustomError(name: string, args: readonly unknown[]): DecodedTxError {
  switch (name) {
    /* --- Access control --------------------------------------------------- */
    case "NotOwner":
      return {
        kind: "revert",
        errorName: name,
        title: "Not the vault owner",
        detail: `This action is restricted to the vault owner. The connected account (${addr(args[0])}) is not it.`,
      };
    case "NotAgent":
      return {
        kind: "revert",
        errorName: name,
        title: "Not the agent key",
        detail: `Only the vault's registered agent address can send a heartbeat. The connected account is ${addr(args[0])}.`,
      };

    /* --- Lifecycle guards ------------------------------------------------- */
    case "SwitchAlreadyTriggered":
      return {
        kind: "revert",
        errorName: name,
        title: "Switch already fired",
        detail:
          "The treasury has already been evacuated to the recovery address. Owner actions and heartbeats are frozen until the vault is re-armed.",
      };
    case "SwitchNotTriggered":
      return {
        kind: "revert",
        errorName: name,
        title: "Switch has not fired",
        detail: "This action is only available after the dead-man's switch has been executed.",
      };
    case "AgentStillAlive":
      return {
        kind: "revert",
        errorName: name,
        title: "Agent is still alive",
        detail: `The heartbeat has not lapsed yet; ${formatDuration(num(args[0]))} of grace remain. Execution needs the deadline to be strictly in the past.`,
      };
    case "NotInitialized":
      return {
        kind: "revert",
        errorName: name,
        title: "Vault not configured",
        detail:
          "This vault has never been initialised, so it has no timeout, owner or recovery address. Permissionless actions are blocked on unconfigured vaults by design.",
      };
    case "AlreadyInitialized":
      return {
        kind: "revert",
        errorName: name,
        title: "Vault already configured",
        detail: "initialize() can only be called once, and the factory already called it.",
      };

    /* --- Input validation ------------------------------------------------- */
    case "InvalidTimeoutPeriod":
      return {
        kind: "revert",
        errorName: name,
        title: "Timeout out of range",
        detail: `${formatDuration(num(args[0]))} is outside the permitted window of ${formatDuration(num(args[1]))} to ${formatDuration(num(args[2]))}.`,
      };
    case "ZeroAddress":
      return {
        kind: "revert",
        errorName: name,
        title: "Address cannot be zero",
        detail: `The "${String(args[0] ?? "address")}" field was the zero address.`,
      };
    case "InvalidAddress":
      return {
        kind: "revert",
        errorName: name,
        title: "Invalid address",
        detail:
          String(args[0]) === "recoveryAddress"
            ? "The recovery address cannot be the vault itself and cannot equal the agent address: the hot key must never be the rescue destination."
            : `The "${String(args[0])}" field was rejected by the contract.`,
      };
    case "ZeroAmount":
      return {
        kind: "revert",
        errorName: name,
        title: "Amount cannot be zero",
      };
    case "InsufficientBalance":
      return {
        kind: "revert",
        errorName: name,
        title: "Insufficient vault balance",
        detail: `Requested ${formatAmount(num(args[0]))} BOT but the vault only holds ${formatAmount(num(args[1]))} BOT.`,
      };

    /* --- Token watchlist -------------------------------------------------- */
    case "TokenAlreadyTracked":
      return {
        kind: "revert",
        errorName: name,
        title: "Token already tracked",
        detail: `${addr(args[0])} is already on this vault's sweep watchlist.`,
      };
    case "TokenNotTracked":
      return {
        kind: "revert",
        errorName: name,
        title: "Token not tracked",
        detail: `${addr(args[0])} is not on this vault's watchlist.`,
      };
    case "TrackedTokenLimitReached":
      return {
        kind: "revert",
        errorName: name,
        title: "Watchlist full",
        detail: `A vault can track at most ${num(args[0]).toString()} ERC-20s, so the rescue transaction always fits inside the block gas limit. Remove one first.`,
      };
    case "NothingToSweep":
      return {
        kind: "revert",
        errorName: name,
        title: "Nothing to sweep",
        detail: "The balance being swept is zero.",
      };

    /* --- Transfers -------------------------------------------------------- */
    case "NativeTransferFailed":
      return {
        kind: "revert",
        errorName: name,
        title: "BOT transfer failed",
        detail: `Sending ${formatAmount(num(args[1]))} BOT to ${addr(args[0])} reverted. If that address is a contract that rejects payments, the whole transaction is rolled back, so the switch stays armed and can be fired again.`,
      };
    case "TokenTransferFailed":
      return {
        kind: "revert",
        errorName: name,
        title: "Token transfer failed",
        detail: `Token ${addr(args[0])} refused a transfer of ${num(args[2]).toString()} to ${addr(args[1])}.`,
      };

    /* --- Factory ---------------------------------------------------------- */
    case "VaultAlreadyExists":
      return {
        kind: "revert",
        errorName: name,
        title: "Salt already used",
        detail: `You have already created a vault at ${addr(args[0])} with this salt. Pick a different one.`,
      };
    case "NotANostromVault":
      return {
        kind: "revert",
        errorName: name,
        title: "Not a registered vault",
        detail: `${addr(args[0])} was not created by this factory.`,
      };
    case "InvalidPageLimit":
      return {
        kind: "revert",
        errorName: name,
        title: "Page size too large",
        detail: `Requested ${num(args[0]).toString()} entries; the maximum is ${num(args[1]).toString()}.`,
      };
    case "ERC1167FailedCreateClone":
      return {
        kind: "revert",
        errorName: name,
        title: "Vault creation failed",
        detail: "The minimal-proxy deployment failed. Retry, or try a different salt.",
      };

    default:
      return {
        kind: "revert",
        errorName: name,
        title: "Transaction rejected by the contract",
        detail: `The contract reverted with ${name}(${args.map((a) => String(a)).join(", ")}).`,
      };
  }
}

/** Heuristics for wallet-level failures that never reach the contract. */
function explainWalletError(message: string): DecodedTxError | null {
  const m = message.toLowerCase();

  if (m.includes("insufficient funds")) {
    return {
      kind: "wallet",
      title: "Not enough BOT for gas",
      detail:
        "The connected account cannot cover this transaction's gas. Top it up with native BOT and retry.",
    };
  }
  if (m.includes("chain") && (m.includes("mismatch") || m.includes("does not match"))) {
    return {
      kind: "wallet",
      title: "Wrong network",
      detail: "Your wallet is on a different chain than the app. Switch networks and retry.",
    };
  }
  if (m.includes("nonce")) {
    return {
      kind: "wallet",
      title: "Nonce conflict",
      detail:
        "Another transaction from this account is still pending. Wait for it to confirm, or reset the account's nonce in your wallet.",
    };
  }
  if (m.includes("replacement") && m.includes("underpriced")) {
    return {
      kind: "wallet",
      title: "Replacement underpriced",
      detail: "A pending transaction is being replaced at too low a fee. Raise the gas price.",
    };
  }
  if (m.includes("timeout") || m.includes("failed to fetch") || m.includes("network error")) {
    return {
      kind: "wallet",
      title: "Network unreachable",
      detail: "The BOT Chain RPC did not respond. Check your connection and retry.",
    };
  }
  return null;
}

export function decodeTxError(error: unknown): DecodedTxError {
  if (!error) {
    return { kind: "unknown", title: "Unknown error" };
  }

  if (error instanceof BaseError) {
    // User declined in the wallet: the most common "error" by far.
    const rejected = error.walk((e) => e instanceof UserRejectedRequestError);
    if (rejected) {
      return {
        kind: "rejected",
        title: "Signature declined",
        detail: "You rejected the request in your wallet. Nothing was sent to the chain.",
      };
    }

    // Decoded custom error from the contract.
    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name) {
        return explainCustomError(name, (reverted.data?.args ?? []) as readonly unknown[]);
      }
      if (reverted.reason) {
        return { kind: "revert", title: "Transaction reverted", detail: reverted.reason };
      }
    }

    const wallet = explainWalletError(error.message ?? "");
    if (wallet) return wallet;

    return {
      kind: "unknown",
      title: "Transaction failed",
      detail: error.shortMessage || error.message,
    };
  }

  const message = error instanceof Error ? error.message : String(error);

  // Raw EIP-1193 rejection, in case it arrives un-wrapped.
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 4001
  ) {
    return {
      kind: "rejected",
      title: "Signature declined",
      detail: "You rejected the request in your wallet.",
    };
  }

  const wallet = explainWalletError(message);
  if (wallet) return wallet;

  return { kind: "unknown", title: "Transaction failed", detail: message };
}

/** Compact one-liner for inline placement (table rows, field hints). */
export function shortErrorText(error: unknown): string {
  const decoded = decodeTxError(error);
  return decoded.detail ? `${decoded.title}: ${decoded.detail}` : decoded.title;
}
