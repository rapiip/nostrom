import { describe, expect, it } from "vitest";
import {
  describeTimeout,
  formatAgo,
  formatAmount,
  formatDuration,
  formatRelative,
  gracePercent,
  sameAddress,
  truncateAddress,
} from "./format";

describe("formatDuration", () => {
  it("zero-pads every component after the first so countdowns keep their width", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(59)).toBe("59s");
    expect(formatDuration(61)).toBe("1m 01s");
    expect(formatDuration(3_601)).toBe("1h 00m 01s");
    expect(formatDuration(90_061n)).toBe("1d 01h 01m");
    expect(formatDuration(90_061n, { short: true })).toBe("1d 01h");
  });

  it("treats negative and non-finite input as zero", () => {
    expect(formatDuration(-5)).toBe("0s");
    expect(formatDuration(Number.NaN)).toBe("0s");
  });
});

describe("describeTimeout", () => {
  it("uses the largest whole unit", () => {
    expect(describeTimeout(86_400n)).toBe("1 day");
    expect(describeTimeout(259_200n)).toBe("3 days");
    expect(describeTimeout(3_600n)).toBe("1 hour");
    expect(describeTimeout(21_600n)).toBe("6 hours");
    expect(describeTimeout(300n)).toBe("5 minutes");
    expect(describeTimeout(45n)).toBe("45 seconds");
  });
});

describe("relative time", () => {
  it("reads past and future relative to now", () => {
    expect(formatRelative(1_000, 1_000)).toBe("just now");
    expect(formatRelative(1_000 - 120, 1_000)).toBe("2m 00s ago");
    expect(formatRelative(1_000 + 3_700, 1_000)).toBe("in 1h 01m 40s");
  });

  it("never says a past event happens in the future (block clock ahead of device)", () => {
    expect(formatAgo(1_100, 1_000)).toBe("just now");
  });
});

describe("formatAmount", () => {
  it("groups thousands and trims trailing zeros", () => {
    expect(formatAmount(12_500_000_000_000_000_000_000n)).toBe("12,500");
    expect(formatAmount(1_500_000_000_000_000_000n)).toBe("1.5");
  });

  it("says a dust balance is non-zero instead of rounding it to 0", () => {
    expect(formatAmount(1n)).toBe("<0.0001");
    expect(formatAmount(0n)).toBe("0");
  });

  it("honours custom decimals", () => {
    expect(formatAmount(2_500_000n, { decimals: 6 })).toBe("2.5");
  });

  it("renders a dash for an unknown value", () => {
    expect(formatAmount(undefined)).toBe("-");
  });
});

describe("addresses", () => {
  it("compares case-insensitively and never matches an absent value", () => {
    expect(sameAddress("0xABCDEF", "0xabcdef")).toBe(true);
    expect(sameAddress(undefined, "0xabc")).toBe(false);
    expect(sameAddress(undefined, undefined)).toBe(false);
  });

  it("truncates with head and tail preserved", () => {
    expect(truncateAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")).toBe("0xf39F…2266");
    expect(truncateAddress(undefined)).toBe("-");
  });
});

describe("gracePercent", () => {
  it("clamps to 0..100 and handles a zero timeout", () => {
    expect(gracePercent(50n, 100n)).toBe(50);
    expect(gracePercent(500n, 100n)).toBe(100);
    expect(gracePercent(10n, 0n)).toBe(0);
  });
});
