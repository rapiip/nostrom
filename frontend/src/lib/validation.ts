import { getAddress, isAddress, parseEther, type Address } from "viem";
import { PROTOCOL } from "@/config/contracts";
import { sameAddress } from "./format";

/**
 * Client-side mirrors of the contract's own validation.
 *
 * Purpose is strictly to save the user a wasted signature and a revert; the
 * contract remains the authority. Every rule here corresponds to a specific
 * revert in contracts/NostromFactory.sol, cited inline.
 */

export interface FieldResult {
  ok: boolean;
  error?: string;
  /** Non-blocking caution the user should read before signing. */
  warning?: string;
}

const OK: FieldResult = { ok: true };

/* ===========================================================================
   Addresses
   =========================================================================== */

export function validateAddressField(value: string, label: string): FieldResult {
  const v = value.trim();
  if (!v) return { ok: false, error: `${label} is required.` };
  if (!v.startsWith("0x")) return { ok: false, error: `${label} must start with 0x.` };
  if (v.length !== 42) {
    return { ok: false, error: `${label} must be 42 characters (got ${v.length}).` };
  }
  if (!isAddress(v)) {
    // isAddress fails a mixed-case string whose EIP-55 checksum is wrong.
    if (/^0x[0-9a-fA-F]{40}$/.test(v)) {
      return { ok: false, error: `${label} has an invalid checksum. Re-copy the address.` };
    }
    return { ok: false, error: `${label} contains non-hex characters.` };
  }
  // ZeroAddress(string): initialize() rejects all three participants as zero.
  if (/^0x0{40}$/i.test(v)) {
    return { ok: false, error: `${label} cannot be the zero address.` };
  }
  return OK;
}

/** Checksummed form, or null when unparseable. */
export function normalizeAddress(value: string): Address | null {
  const v = value.trim();
  if (!isAddress(v)) return null;
  return getAddress(v);
}

/* ===========================================================================
   Vault configuration
   =========================================================================== */

export interface VaultConfigInput {
  agent: string;
  recovery: string;
  timeoutSeconds: bigint;
  /** Connected account: becomes the vault owner via createVault's msg.sender. */
  owner: Address | undefined;
}

export interface VaultConfigValidation {
  agent: FieldResult;
  recovery: FieldResult;
  timeout: FieldResult;
  ok: boolean;
}

export function validateVaultConfig(input: VaultConfigInput): VaultConfigValidation {
  const agent = validateAddressField(input.agent, "Agent address");
  let recovery = validateAddressField(input.recovery, "Recovery address");
  const timeout = validateTimeout(input.timeoutSeconds);

  if (recovery.ok && agent.ok) {
    // InvalidAddress("recoveryAddress"): the hot key must never be the rescue
    // destination, or compromising the agent compromises recovery.
    if (sameAddress(input.recovery, input.agent)) {
      recovery = {
        ok: false,
        error:
          "Recovery address cannot equal the agent address. The agent key is the hot, expendable key, so making it the rescue destination would defeat the design.",
      };
    } else if (sameAddress(input.recovery, input.owner)) {
      // Not a contract rule, but worth flagging: an owner EOA that is also the
      // recovery target gives you no cold-storage separation.
      recovery = {
        ok: true,
        warning:
          "Recovery is the same account as the vault owner. That works, but it gives you no cold-storage separation. Consider a wallet you do not operate the agent from.",
      };
    }
  }

  let agentChecked = agent;
  if (agent.ok && sameAddress(input.agent, input.owner)) {
    agentChecked = {
      ok: true,
      warning:
        "The agent key is the same account as the owner. The contract allows it, but the agent key is designed to be powerless and expendable; keep them separate in production.",
    };
  }

  return {
    agent: agentChecked,
    recovery,
    timeout,
    ok: agentChecked.ok && recovery.ok && timeout.ok,
  };
}

/** InvalidTimeoutPeriod(provided, min, max): see _validateTimeout. */
export function validateTimeout(seconds: bigint): FieldResult {
  if (seconds <= 0n) return { ok: false, error: "Timeout is required." };
  if (seconds < PROTOCOL.MIN_TIMEOUT_SECONDS) {
    return {
      ok: false,
      error: `Timeout must be at least ${PROTOCOL.MIN_TIMEOUT_SECONDS} seconds. The floor exists so validator clock drift can never race a heartbeat.`,
    };
  }
  if (seconds > PROTOCOL.MAX_TIMEOUT_SECONDS) {
    return {
      ok: false,
      error: "Timeout cannot exceed 365 days. A switch that can never fire is not a safety device.",
    };
  }
  if (seconds < 300n) {
    return {
      ok: true,
      warning:
        "Under 5 minutes leaves very little room for a missed transaction. The heartbeat clients ping at timeout/3, so a single RPC hiccup could fire the switch on a healthy agent.",
    };
  }
  return OK;
}

/* ===========================================================================
   Amounts
   =========================================================================== */

export interface AmountResult extends FieldResult {
  wei?: bigint;
}

export function validateAmount(
  value: string,
  opts?: { max?: bigint; required?: boolean; label?: string },
): AmountResult {
  const label = opts?.label ?? "Amount";
  const v = value.trim();

  if (!v) {
    return opts?.required ? { ok: false, error: `${label} is required.` } : { ok: true, wei: 0n };
  }
  if (!/^\d*\.?\d*$/.test(v)) {
    return { ok: false, error: `${label} must be a number.` };
  }

  let wei: bigint;
  try {
    wei = parseEther(v);
  } catch {
    return { ok: false, error: `${label} has too many decimal places (max 18).` };
  }

  // ZeroAmount(): withdrawByOwner and deposit both reject zero.
  if (wei === 0n && opts?.required) {
    return { ok: false, error: `${label} must be greater than zero.` };
  }
  // InsufficientBalance(requested, available)
  if (opts?.max !== undefined && wei > opts.max) {
    return { ok: false, error: `${label} exceeds the available balance.`, wei };
  }
  return { ok: true, wei };
}

/* ===========================================================================
   Deterministic salt
   =========================================================================== */

/**
 * createVaultDeterministic takes a bytes32. Accept either a raw 32-byte hex
 * value or a short human label, which is hashed to fill the word. The factory
 * namespaces the salt by msg.sender internally, so two users may safely choose
 * the same label.
 */
export function validateSaltLabel(value: string): FieldResult {
  const v = value.trim();
  if (!v) return { ok: false, error: "Label is required for a deterministic address." };
  if (/^0x[0-9a-fA-F]{64}$/.test(v)) return OK;
  if (v.startsWith("0x")) {
    return { ok: false, error: "A raw salt must be exactly 32 bytes (0x + 64 hex characters)." };
  }
  if (v.length > 64) return { ok: false, error: "Label is too long (max 64 characters)." };
  return OK;
}
