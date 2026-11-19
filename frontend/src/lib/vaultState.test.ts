import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import {
  buildVaultView,
  classifyVault,
  deriveCapabilities,
  describeRole,
  isEmptySnapshot,
  statusFromSnapshot,
  type VaultSnapshotStruct,
  type VaultStatus,
} from "./vaultState";

const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;
const AGENT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
const RECOVERY = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address;
const STRANGER = "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as Address;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;

/** A vault pinged at t=1000 with a 1,000 second timeout: deadline 2000. */
function status(overrides: Partial<VaultStatus> = {}): VaultStatus {
  return {
    owner: OWNER,
    agent: AGENT,
    recovery: RECOVERY,
    balance: 10n,
    timeoutPeriod: 1_000n,
    lastPingTime: 1_000n,
    deadline: 2_000n,
    secondsRemaining: 1_000n,
    isTriggered: false,
    isExecutable: false,
    pingCount: 1n,
    ...overrides,
  };
}

describe("classifyVault", () => {
  it("is ALIVE with comfortable grace", () => {
    const r = classifyVault(status(), 1_100);
    expect(r.phase).toBe("ALIVE");
    expect(r.liveSecondsRemaining).toBe(900n);
    expect(r.gracePct).toBe(90);
  });

  it("enters EXPIRING at 20% of the vault's own timeout", () => {
    expect(classifyVault(status(), 1_799).phase).toBe("ALIVE");
    expect(classifyVault(status(), 1_800).phase).toBe("EXPIRING");
  });

  it("is NOT executable at exactly the deadline: the contract requires block.timestamp > deadline", () => {
    expect(classifyVault(status(), 2_000).phase).toBe("EXPIRING");
    expect(classifyVault(status(), 2_001).phase).toBe("EXECUTABLE");
  });

  it("trusts the chain immediately when it already says executable", () => {
    expect(classifyVault(status({ isExecutable: true }), 1_100).phase).toBe("EXECUTABLE");
  });

  it("TRIGGERED wins over everything else", () => {
    expect(classifyVault(status({ isTriggered: true, isExecutable: true }), 5_000).phase).toBe(
      "TRIGGERED",
    );
  });

  it("reports an uninitialised clone as UNCONFIGURED", () => {
    expect(classifyVault(status(), 1_100, { initialized: false }).phase).toBe("UNCONFIGURED");
  });

  it("clamps remaining grace to the timeout when this device's clock runs behind the chain", () => {
    const r = classifyVault(status(), 500);
    expect(r.liveSecondsRemaining).toBe(1_000n);
    expect(r.gracePct).toBe(100);
  });
});

describe("snapshots", () => {
  const snapshot: VaultSnapshotStruct = {
    vault: STRANGER,
    owner: OWNER,
    agentAddress: AGENT,
    recoveryAddress: RECOVERY,
    balance: 1n,
    timeoutPeriod: 60n,
    lastPingTime: 10n,
    executionDeadline: 70n,
    secondsRemaining: 0n,
    isTriggered: false,
    isExecutable: true,
    pingCount: 3n,
  };

  it("maps the factory's snapshot field names onto the vault's status names", () => {
    const s = statusFromSnapshot(snapshot);
    expect(s.agent).toBe(AGENT);
    expect(s.recovery).toBe(RECOVERY);
    expect(s.deadline).toBe(70n);
    expect(buildVaultView(snapshot.vault, s, 100).phase).toBe("EXECUTABLE");
  });

  it("detects the zeroed struct getVaultsSnapshot returns for an unknown address", () => {
    expect(isEmptySnapshot(snapshot)).toBe(false);
    expect(
      isEmptySnapshot({ ...snapshot, owner: ZERO, timeoutPeriod: 0n }),
    ).toBe(true);
  });
});

describe("deriveCapabilities mirrors the contract's modifiers", () => {
  const alive = buildVaultView(STRANGER, status(), 1_100);
  const lapsed = buildVaultView(STRANGER, status(), 2_500);
  const fired = buildVaultView(STRANGER, status({ isTriggered: true }), 2_500);

  it("onlyAgent + whenNotTriggered gates ping", () => {
    expect(deriveCapabilities(alive, AGENT).canPing).toBe(true);
    expect(deriveCapabilities(alive, OWNER).canPing).toBe(false);
    expect(deriveCapabilities(fired, AGENT).canPing).toBe(false);
  });

  it("onlyOwner gates withdrawals and configuration, and a trigger freezes them", () => {
    expect(deriveCapabilities(alive, OWNER).canWithdraw).toBe(true);
    expect(deriveCapabilities(alive, AGENT).canWithdraw).toBe(false);
    expect(deriveCapabilities(fired, OWNER).canWithdraw).toBe(false);
    expect(deriveCapabilities(fired, OWNER).canConfigure).toBe(false);
  });

  it("execution is permissionless once lapsed, including for a stranger or no wallet", () => {
    expect(deriveCapabilities(alive, STRANGER).canExecute).toBe(false);
    expect(deriveCapabilities(lapsed, STRANGER).canExecute).toBe(true);
    expect(deriveCapabilities(lapsed, undefined).canExecute).toBe(true);
  });

  it("rearm is owner-only and only after a trigger; sweeps are open after a trigger", () => {
    expect(deriveCapabilities(fired, OWNER).canRearm).toBe(true);
    expect(deriveCapabilities(alive, OWNER).canRearm).toBe(false);
    expect(deriveCapabilities(fired, STRANGER).canSweep).toBe(true);
  });

  it("compares addresses case-insensitively", () => {
    expect(deriveCapabilities(alive, OWNER.toLowerCase() as Address).isOwner).toBe(true);
  });

  it("names the caller's role", () => {
    expect(describeRole(deriveCapabilities(alive, STRANGER))).toBe("Observer");
    expect(describeRole(deriveCapabilities(alive, AGENT))).toBe("Agent");
    const both = buildVaultView(STRANGER, status({ agent: OWNER }), 1_100);
    expect(describeRole(deriveCapabilities(both, OWNER))).toBe("Owner · Agent");
  });
});
