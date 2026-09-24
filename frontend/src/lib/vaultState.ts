import type { Address } from "viem";
import { gracePercent, sameAddress } from "./format";

/**
 * The protocol's observable state machine, derived from `NostromVault.status()`.
 *
 * The contract exposes two booleans (`isTriggered`, `isExecutable`) plus a
 * countdown. Those three collapse into four states the user needs to tell apart,
 * and one degenerate state for an unconfigured clone:
 *
 *   ALIVE      heartbeat recent, comfortable grace remaining
 *   EXPIRING   still alive, but the grace window is nearly gone
 *   EXECUTABLE heartbeat lapsed — ANYONE may now fire the switch
 *   TRIGGERED  switch fired, treasury already evacuated to recovery
 *   UNCONFIGURED  clone exists but initialize() was never called
 *
 * EXPIRING has no on-chain representation: it is a UI-only warning band so an
 * owner has a chance to act before a keeper does. The threshold is a fraction of
 * the vault's own timeout, so a 1-hour vault and a 30-day vault both warn at a
 * proportionate point rather than at some fixed number of seconds.
 */

export const EXPIRING_THRESHOLD_FRACTION = 0.2;

export type VaultPhase = "UNCONFIGURED" | "ALIVE" | "EXPIRING" | "EXECUTABLE" | "TRIGGERED";

/** Raw 11-tuple returned by `NostromVault.status()`, named. */
export interface VaultStatus {
  owner: Address;
  agent: Address;
  recovery: Address;
  balance: bigint;
  timeoutPeriod: bigint;
  lastPingTime: bigint;
  deadline: bigint;
  secondsRemaining: bigint;
  isTriggered: boolean;
  isExecutable: boolean;
  pingCount: bigint;
}

export interface VaultView extends VaultStatus {
  address: Address;
  phase: VaultPhase;
  /** Percentage of the grace window still available, 0-100. */
  gracePct: number;
  /** Seconds remaining, recomputed against local wall-clock. See note below. */
  liveSecondsRemaining: bigint;
}

/**
 * Decode the tuple `status()` returns into a named object.
 * Order is fixed by the ABI; see contracts/NostromFactory.sol `status()`.
 */
export function decodeStatusTuple(
  tuple: readonly [
    Address,
    Address,
    Address,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    boolean,
    boolean,
    bigint,
  ],
): VaultStatus {
  return {
    owner: tuple[0],
    agent: tuple[1],
    recovery: tuple[2],
    balance: tuple[3],
    timeoutPeriod: tuple[4],
    lastPingTime: tuple[5],
    deadline: tuple[6],
    secondsRemaining: tuple[7],
    isTriggered: tuple[8],
    isExecutable: tuple[9],
    pingCount: tuple[10],
  };
}

/** Shape returned by `NostromFactory.getVaultSnapshot` / `getVaultsSnapshot`. */
export interface VaultSnapshotStruct {
  vault: Address;
  owner: Address;
  agentAddress: Address;
  recoveryAddress: Address;
  balance: bigint;
  timeoutPeriod: bigint;
  lastPingTime: bigint;
  executionDeadline: bigint;
  secondsRemaining: bigint;
  isTriggered: boolean;
  isExecutable: boolean;
  pingCount: bigint;
}

export function statusFromSnapshot(s: VaultSnapshotStruct): VaultStatus {
  return {
    owner: s.owner,
    agent: s.agentAddress,
    recovery: s.recoveryAddress,
    balance: s.balance,
    timeoutPeriod: s.timeoutPeriod,
    lastPingTime: s.lastPingTime,
    deadline: s.executionDeadline,
    secondsRemaining: s.secondsRemaining,
    isTriggered: s.isTriggered,
    isExecutable: s.isExecutable,
    pingCount: s.pingCount,
  };
}

/**
 * A batch snapshot returns a zeroed struct for an address the factory does not
 * recognise, rather than reverting the whole page. Detect that so the UI can
 * skip the entry instead of rendering a vault owned by 0x0.
 */
export function isEmptySnapshot(s: VaultSnapshotStruct): boolean {
  return s.owner === "0x0000000000000000000000000000000000000000" && s.timeoutPeriod === 0n;
}

/**
 * Classify a vault.
 *
 * `nowSeconds` lets the countdown tick between RPC polls. The derived deadline
 * comparison is authoritative here rather than the contract's `isExecutable`
 * boolean, because that boolean is only as fresh as the last read — a vault can
 * cross its deadline while the page sits idle. Both are consulted: if the chain
 * says executable we trust it immediately; otherwise we also check the clock.
 *
 * One subtlety carried over from the contract: execution requires
 * `block.timestamp > deadline`, strictly. At exactly the deadline the switch is
 * NOT yet executable, so the same strict comparison is used here.
 */
export function classifyVault(
  status: VaultStatus,
  nowSeconds: number,
  opts?: { initialized?: boolean },
): { phase: VaultPhase; liveSecondsRemaining: bigint; gracePct: number } {
  if (opts?.initialized === false) {
    return { phase: "UNCONFIGURED", liveSecondsRemaining: 0n, gracePct: 0 };
  }

  if (status.isTriggered) {
    return { phase: "TRIGGERED", liveSecondsRemaining: 0n, gracePct: 0 };
  }

  const now = BigInt(Math.floor(nowSeconds));
  const lapsed = status.isExecutable || now > status.deadline;

  if (lapsed) {
    return { phase: "EXECUTABLE", liveSecondsRemaining: 0n, gracePct: 0 };
  }

  const remaining = status.deadline > now ? status.deadline - now : 0n;
  const pct = gracePercent(remaining, status.timeoutPeriod);
  const phase: VaultPhase = pct <= EXPIRING_THRESHOLD_FRACTION * 100 ? "EXPIRING" : "ALIVE";

  return { phase, liveSecondsRemaining: remaining, gracePct: pct };
}

export function buildVaultView(
  address: Address,
  status: VaultStatus,
  nowSeconds: number,
  opts?: { initialized?: boolean },
): VaultView {
  const { phase, liveSecondsRemaining, gracePct } = classifyVault(status, nowSeconds, opts);
  return { ...status, address, phase, liveSecondsRemaining, gracePct };
}

/* ===========================================================================
   Presentation metadata for each phase
   =========================================================================== */

export interface PhaseMeta {
  label: string;
  /** Tailwind text colour class. */
  tone: string;
  /** Tailwind border colour class. */
  border: string;
  /** Tailwind background colour class for the track fill. */
  fill: string;
  description: string;
}

export const PHASE_META: Record<VaultPhase, PhaseMeta> = {
  ALIVE: {
    label: "Alive",
    tone: "text-signal",
    border: "border-signal-dim",
    fill: "bg-signal",
    description: "The agent is reporting in. Funds stay in the vault.",
  },
  EXPIRING: {
    label: "Expiring",
    tone: "text-warn",
    border: "border-warn-dim",
    fill: "bg-warn",
    description: "The grace window is nearly gone. One more heartbeat resets it.",
  },
  EXECUTABLE: {
    label: "Executable",
    tone: "text-danger",
    border: "border-danger-dim",
    fill: "bg-danger",
    description: "The heartbeat has lapsed. Anyone can now evacuate the treasury.",
  },
  TRIGGERED: {
    label: "Triggered",
    tone: "text-danger",
    border: "border-danger-dim",
    fill: "bg-danger",
    description: "The switch fired. The treasury has been sent to the recovery address.",
  },
  UNCONFIGURED: {
    label: "Unconfigured",
    tone: "text-text-faint",
    border: "border-line-strong",
    fill: "bg-text-faint",
    description: "This vault exists but initialize() was never called.",
  },
};

/* ===========================================================================
   Caller capability
   ---------------------------------------------------------------------------
   Mirrors the contract's access control exactly, so the UI never offers an
   action that is certain to revert. Each flag maps to one modifier:

     onlyOwner            -> isOwner
     onlyAgent            -> isAgent
     whenNotTriggered     -> !isTriggered
     whenTriggered        -> isTriggered
     (no modifier)        -> anyone
   =========================================================================== */

export interface VaultCapabilities {
  isOwner: boolean;
  isAgent: boolean;
  isRecovery: boolean;
  /** onlyAgent + whenNotTriggered */
  canPing: boolean;
  /** onlyOwner + whenNotTriggered */
  canWithdraw: boolean;
  canConfigure: boolean;
  /** onlyOwner, no trigger guard */
  canTransferOwnership: boolean;
  canManageTokens: boolean;
  /** onlyOwner + whenTriggered */
  canRearm: boolean;
  /** permissionless + whenNotTriggered + past deadline */
  canExecute: boolean;
  /** permissionless + whenTriggered */
  canSweep: boolean;
  /** receive()/deposit() are open to anyone, including after a trigger. */
  canDeposit: boolean;
}

export function deriveCapabilities(
  view: Pick<VaultView, "owner" | "agent" | "recovery" | "isTriggered" | "phase">,
  account: Address | undefined,
): VaultCapabilities {
  const isOwner = sameAddress(account, view.owner);
  const isAgent = sameAddress(account, view.agent);
  const isRecovery = sameAddress(account, view.recovery);
  const triggered = view.isTriggered;
  const configured = view.phase !== "UNCONFIGURED";

  return {
    isOwner,
    isAgent,
    isRecovery,
    canPing: isAgent && !triggered && configured,
    canWithdraw: isOwner && !triggered && configured,
    canConfigure: isOwner && !triggered && configured,
    canTransferOwnership: isOwner && configured,
    canManageTokens: isOwner && configured,
    canRearm: isOwner && triggered,
    canExecute: view.phase === "EXECUTABLE",
    canSweep: triggered,
    canDeposit: configured,
  };
}

/** Human label for the connected account's relationship to a vault. */
export function describeRole(caps: VaultCapabilities): string {
  const roles: string[] = [];
  if (caps.isOwner) roles.push("Owner");
  if (caps.isAgent) roles.push("Agent");
  if (caps.isRecovery) roles.push("Recovery");
  if (roles.length === 0) return "Observer";
  return roles.join(" · ");
}
