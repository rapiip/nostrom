import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import {
  normalizeAddress,
  validateAddressField,
  validateAmount,
  validateSaltLabel,
  validateTimeout,
  validateVaultConfig,
} from "./validation";

const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;
const AGENT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const RECOVERY = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

describe("validateAddressField", () => {
  it("accepts a checksummed or all-lowercase address", () => {
    expect(validateAddressField(AGENT, "Agent").ok).toBe(true);
    expect(validateAddressField(AGENT.toLowerCase(), "Agent").ok).toBe(true);
  });

  it("names each distinct mistake", () => {
    expect(validateAddressField("", "Agent").error).toMatch(/required/);
    expect(validateAddressField("70997970C51812dc3A010C7d01b50e0d17dc79C8", "Agent").error).toMatch(/0x/);
    expect(validateAddressField("0x1234", "Agent").error).toMatch(/42 characters/);
    expect(validateAddressField(`0x${"g".repeat(40)}`, "Agent").error).toMatch(/non-hex/);
  });

  it("rejects a bad EIP-55 checksum rather than silently accepting it", () => {
    const flipped = AGENT.replace("C51812dc", "c51812DC");
    expect(validateAddressField(flipped, "Agent").error).toMatch(/checksum/);
  });

  it("rejects the zero address (ZeroAddress in initialize)", () => {
    expect(validateAddressField(`0x${"0".repeat(40)}`, "Agent").error).toMatch(/zero address/);
  });

  it("normalises to the checksummed form", () => {
    expect(normalizeAddress(AGENT.toLowerCase())).toBe(AGENT);
    expect(normalizeAddress("nope")).toBeNull();
  });
});

describe("validateTimeout mirrors InvalidTimeoutPeriod", () => {
  it("enforces MIN_TIMEOUT_PERIOD (30s) and MAX_TIMEOUT_PERIOD (365 days)", () => {
    expect(validateTimeout(29n).ok).toBe(false);
    expect(validateTimeout(30n).ok).toBe(true);
    expect(validateTimeout(365n * 86_400n).ok).toBe(true);
    expect(validateTimeout(365n * 86_400n + 1n).ok).toBe(false);
  });

  it("warns, without blocking, below five minutes", () => {
    const r = validateTimeout(120n);
    expect(r.ok).toBe(true);
    expect(r.warning).toBeTruthy();
    expect(validateTimeout(300n).warning).toBeUndefined();
  });
});

describe("validateVaultConfig", () => {
  it("passes a well-separated configuration", () => {
    const r = validateVaultConfig({ agent: AGENT, recovery: RECOVERY, timeoutSeconds: 86_400n, owner: OWNER });
    expect(r.ok).toBe(true);
  });

  it("blocks recovery == agent (InvalidAddress(\"recoveryAddress\")), in any letter case", () => {
    const r = validateVaultConfig({
      agent: AGENT,
      recovery: AGENT.toLowerCase(),
      timeoutSeconds: 86_400n,
      owner: OWNER,
    });
    expect(r.ok).toBe(false);
    expect(r.recovery.error).toMatch(/cannot equal the agent/);
  });

  it("allows but warns when the owner doubles as agent or recovery", () => {
    const asRecovery = validateVaultConfig({ agent: AGENT, recovery: OWNER, timeoutSeconds: 86_400n, owner: OWNER });
    expect(asRecovery.ok).toBe(true);
    expect(asRecovery.recovery.warning).toBeTruthy();

    const asAgent = validateVaultConfig({ agent: OWNER, recovery: RECOVERY, timeoutSeconds: 86_400n, owner: OWNER });
    expect(asAgent.ok).toBe(true);
    expect(asAgent.agent.warning).toBeTruthy();
  });
});

describe("validateAmount", () => {
  it("parses decimal BOT into wei", () => {
    expect(validateAmount("1.5").wei).toBe(1_500_000_000_000_000_000n);
    expect(validateAmount("").wei).toBe(0n);
  });

  it("rejects zero when an amount is required (ZeroAmount)", () => {
    expect(validateAmount("0", { required: true }).ok).toBe(false);
    expect(validateAmount("", { required: true }).ok).toBe(false);
  });

  it("rejects more than the available balance (InsufficientBalance)", () => {
    expect(validateAmount("2", { max: 1_000_000_000_000_000_000n }).ok).toBe(false);
    expect(validateAmount("1", { max: 1_000_000_000_000_000_000n }).ok).toBe(true);
  });

  it("rejects malformed numbers and excess precision instead of rounding it away", () => {
    expect(validateAmount("1e18").ok).toBe(false);
    expect(validateAmount("-1").ok).toBe(false);
    expect(validateAmount(".").ok).toBe(false);
    expect(validateAmount(`0.${"1".repeat(19)}`).error).toMatch(/max 18/);
    expect(validateAmount(`0.${"1".repeat(18)}`).wei).toBe(111_111_111_111_111_111n);
  });
});

describe("validateSaltLabel", () => {
  it("accepts a label or a raw bytes32, and rejects anything in between", () => {
    expect(validateSaltLabel("treasury-1").ok).toBe(true);
    expect(validateSaltLabel(`0x${"ab".repeat(32)}`).ok).toBe(true);
    expect(validateSaltLabel("0x1234").ok).toBe(false);
    expect(validateSaltLabel("").ok).toBe(false);
    expect(validateSaltLabel("x".repeat(65)).ok).toBe(false);
  });
});
