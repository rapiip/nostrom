import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { chunk, planRegistryScan, rolesFor, unionAddresses } from "./discovery";

const A = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;
const B = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
const C = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address;

describe("rolesFor", () => {
  const vault = { owner: A, agent: B, recovery: C };

  it("reports every role the account currently holds", () => {
    expect(rolesFor(vault, A, true)).toEqual(["owner", "creator"]);
    expect(rolesFor(vault, B, false)).toEqual(["agent"]);
    expect(rolesFor(vault, C.toLowerCase() as Address, false)).toEqual(["recovery"]);
    expect(rolesFor({ owner: A, agent: A, recovery: C }, A, false)).toEqual(["owner", "agent"]);
  });

  it("a creator who transferred ownership away keeps only the creator link", () => {
    expect(rolesFor({ owner: B, agent: C, recovery: B }, A, true)).toEqual(["creator"]);
  });

  it("no account, no roles", () => {
    expect(rolesFor(vault, undefined, true)).toEqual([]);
  });
});

describe("planRegistryScan", () => {
  it("covers the registry in fixed pages", () => {
    expect(planRegistryScan(6n, 250n, 10)).toEqual({ offsets: [0n], truncated: false });
    expect(planRegistryScan(250n, 250n, 10)).toEqual({ offsets: [0n], truncated: false });
    expect(planRegistryScan(251n, 250n, 10)).toEqual({ offsets: [0n, 250n], truncated: false });
  });

  it("caps the page count and says so", () => {
    const plan = planRegistryScan(10_000n, 250n, 4);
    expect(plan.offsets).toEqual([0n, 250n, 500n, 750n]);
    expect(plan.truncated).toBe(true);
  });

  it("plans nothing for an empty or unknown registry", () => {
    expect(planRegistryScan(0n, 250n, 10)).toEqual({ offsets: [], truncated: false });
    expect(planRegistryScan(undefined, 250n, 10)).toEqual({ offsets: [], truncated: false });
  });
});

describe("unionAddresses", () => {
  it("dedupes case-insensitively and keeps first-seen order", () => {
    expect(unionAddresses([A, B], [B.toLowerCase() as Address, C])).toEqual([A, B, C]);
    expect(unionAddresses()).toEqual([]);
  });
});

describe("chunk", () => {
  it("splits into consecutive slices", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
    expect(() => chunk([1], 0)).toThrow();
  });
});
