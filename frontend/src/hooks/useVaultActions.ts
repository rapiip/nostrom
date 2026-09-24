import { useCallback } from "react";
import { keccak256, stringToHex, type Address, type Hash, type Hex } from "viem";
import { nostromFactoryAbi, nostromVaultAbi } from "@/contracts/abis";
import { describeTimeout, formatAmount, truncateAddress } from "@/lib/format";
import { useTransaction, type UseTransactionResult } from "./useTransaction";

/**
 * Every write the protocol exposes, wrapped so each call site gets a
 * human-readable label and success message for the transaction dialog.
 *
 * No function is invented here: each maps 1:1 onto a function in
 * contracts/NostromFactory.sol. Nothing is composed, batched or reinterpreted.
 */

/* ===========================================================================
   Salt handling for deterministic creation
   =========================================================================== */

/**
 * bytes32 salt from either a raw 32-byte hex value or a short human label.
 * The factory namespaces this by msg.sender internally, so a label like
 * "treasury-1" is safe even if another user picks the same one.
 */
export function toSalt(input: string): Hex {
  const v = input.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(v)) return v as Hex;
  return keccak256(stringToHex(v));
}

/* ===========================================================================
   Factory writes
   =========================================================================== */

export interface CreateVaultParams {
  agent: Address;
  recovery: Address;
  timeoutSeconds: bigint;
  /** Optional initial deposit — routed through createVaultAndFund. */
  depositWei?: bigint;
  /** Optional salt — routed through createVaultDeterministic (CREATE2). */
  salt?: string;
}

export function useCreateVault(
  factory: Address | null,
  onConfirmed?: (hash: Hash) => void,
): UseTransactionResult & { create: (params: CreateVaultParams) => void } {
  const tx = useTransaction({ onConfirmed });

  const create = useCallback(
    (params: CreateVaultParams) => {
      if (!factory) return;
      const { agent, recovery, timeoutSeconds, depositWei = 0n, salt } = params;

      const deposit = depositWei > 0n ? ` and fund it with ${formatAmount(depositWei)} BOT` : "";
      const label = `Create a vault with a ${describeTimeout(timeoutSeconds)} timeout${deposit}`;

      // Deterministic path: one extra argument, and the address is knowable in
      // advance. Preferred when the user asked to reserve an address.
      if (salt !== undefined && salt.trim() !== "") {
        tx.send({
          address: factory,
          abi: nostromFactoryAbi,
          functionName: "createVaultDeterministic",
          args: [agent, recovery, timeoutSeconds, toSalt(salt)],
          value: depositWei,
          label,
          successMessage: "Vault created at the predicted address.",
        });
        return;
      }

      // createVaultAndFund is payable and does both in one signature; createVault
      // is the cheaper path when there is nothing to deposit.
      if (depositWei > 0n) {
        tx.send({
          address: factory,
          abi: nostromFactoryAbi,
          functionName: "createVaultAndFund",
          args: [agent, recovery, timeoutSeconds],
          value: depositWei,
          label,
          successMessage: "Vault created and funded.",
        });
        return;
      }

      tx.send({
        address: factory,
        abi: nostromFactoryAbi,
        functionName: "createVault",
        args: [agent, recovery, timeoutSeconds],
        label,
        successMessage: "Vault created. Fund it to arm the switch.",
      });
    },
    [factory, tx],
  );

  return { ...tx, create };
}

/* ===========================================================================
   Vault writes
   =========================================================================== */

export interface VaultActions {
  tx: UseTransactionResult;

  /** onlyAgent — proof of life. Resets the countdown. */
  ping: () => void;

  /**
   * Fund the vault. Uses deposit() rather than a bare value transfer: a
   * factory vault is an EIP-1167 proxy, so a plain transfer is forwarded by
   * delegatecall and costs well over the 2300-gas stipend. deposit() is
   * explicit, emits VaultFunded, and works for both vault flavours.
   */
  deposit: (wei: bigint) => void;

  /** onlyOwner — normal withdrawals. */
  withdraw: (wei: bigint) => void;
  withdrawAll: () => void;
  withdrawToken: (token: Address, to: Address, amount: bigint, symbol?: string) => void;

  /** Permissionless — the whole point of the protocol. */
  executeDeadManSwitch: () => void;

  /** Permissionless, post-trigger — push late arrivals to recovery. */
  sweepNative: () => void;
  sweepToken: (token: Address, symbol?: string) => void;

  /** onlyOwner configuration. */
  updateTimeout: (seconds: bigint) => void;
  updateRecovery: (address: Address) => void;
  updateAgent: (address: Address) => void;
  transferOwnership: (address: Address) => void;

  /** onlyOwner, post-trigger — return a fired vault to service. */
  rearm: () => void;

  /** onlyOwner — ERC-20 sweep watchlist. */
  addTrackedToken: (token: Address) => void;
  removeTrackedToken: (token: Address) => void;
}

export function useVaultActions(
  vault: Address | undefined,
  onConfirmed?: (hash: Hash) => void,
): VaultActions {
  const tx = useTransaction({ onConfirmed });

  const call = useCallback(
    (
      functionName: string,
      args: readonly unknown[],
      label: string,
      successMessage: string,
      value?: bigint,
    ) => {
      if (!vault) return;
      tx.send({
        address: vault,
        abi: nostromVaultAbi,
        functionName,
        args,
        ...(value !== undefined ? { value } : {}),
        label,
        successMessage,
      });
    },
    [vault, tx],
  );

  return {
    tx,

    ping: () =>
      call("ping", [], "Send a heartbeat", "Heartbeat recorded. The countdown has been reset."),

    deposit: (wei) =>
      call(
        "deposit",
        [],
        `Deposit ${formatAmount(wei)} BOT into the vault`,
        "Deposit confirmed.",
        wei,
      ),

    withdraw: (wei) =>
      call(
        "withdrawByOwner",
        [wei],
        `Withdraw ${formatAmount(wei)} BOT to the owner`,
        "Withdrawal confirmed.",
      ),

    withdrawAll: () =>
      call(
        "withdrawAllByOwner",
        [],
        "Withdraw the entire vault balance to the owner",
        "Vault drained to the owner.",
      ),

    withdrawToken: (token, to, amount, symbol) =>
      call(
        "withdrawTokenByOwner",
        [token, to, amount],
        `Withdraw ${symbol ?? "tokens"} to ${truncateAddress(to)}`,
        "Token withdrawal confirmed.",
      ),

    executeDeadManSwitch: () =>
      call(
        "executeDeadManSwitch",
        [],
        "Execute the dead-man's switch and evacuate the treasury",
        "Switch fired. The treasury has been sent to the recovery address.",
      ),

    sweepNative: () =>
      call(
        "sweepNativeToRecovery",
        [],
        "Sweep native BOT to the recovery address",
        "Native balance swept to recovery.",
      ),

    sweepToken: (token, symbol) =>
      call(
        "sweepTokenToRecovery",
        [token],
        `Sweep ${symbol ?? truncateAddress(token)} to the recovery address`,
        "Token swept to recovery.",
      ),

    updateTimeout: (seconds) =>
      call(
        "updateTimeoutPeriod",
        [seconds],
        `Change the timeout to ${describeTimeout(seconds)}`,
        "Timeout updated.",
      ),

    updateRecovery: (address) =>
      call(
        "updateRecoveryAddress",
        [address],
        `Change the recovery address to ${truncateAddress(address)}`,
        "Recovery address updated.",
      ),

    updateAgent: (address) =>
      call(
        "updateAgentAddress",
        [address],
        `Rotate the agent key to ${truncateAddress(address)}`,
        "Agent key rotated. The countdown was reset.",
      ),

    transferOwnership: (address) =>
      call(
        "transferOwnership",
        [address],
        `Transfer ownership to ${truncateAddress(address)}`,
        "Ownership transferred.",
      ),

    rearm: () =>
      call("rearm", [], "Return the vault to service", "Vault re-armed. The clock has restarted."),

    addTrackedToken: (token) =>
      call(
        "addTrackedToken",
        [token],
        `Add ${truncateAddress(token)} to the sweep watchlist`,
        "Token added to the watchlist.",
      ),

    removeTrackedToken: (token) =>
      call(
        "removeTrackedToken",
        [token],
        `Remove ${truncateAddress(token)} from the watchlist`,
        "Token removed from the watchlist.",
      ),
  };
}
