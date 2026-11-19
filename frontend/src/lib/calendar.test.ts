import { describe, expect, it } from "vitest";
import { alarmLeadMinutes, buildDeadlineIcs, escapeText, foldLine, icsDate } from "./calendar";

const encoder = new TextEncoder();

const input = {
  vault: "0xB7A5bd0345EF1Cc5E66bf61BdeC17D2461fBd968",
  label: "Treasury, main; ops",
  chainName: "BOT Chain",
  // 2026-10-02T00:00:00Z
  deadline: 1_790_899_200n,
  timeoutPeriod: 86_400n,
  url: "https://nostrom.example/app/vault/0xB7A5bd0345EF1Cc5E66bf61BdeC17D2461fBd968",
  now: new Date("2026-10-01T00:00:00Z"),
};

/** Undo RFC 5545 folding: CRLF followed by one space joins lines. */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n /g, "").split("\r\n");
}

describe("buildDeadlineIcs", () => {
  const ics = buildDeadlineIcs(input);
  const lines = unfold(ics);

  it("is a single VEVENT at the deadline, in UTC", () => {
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("DTSTART:20261002T000000Z");
    expect(lines).toContain("DTSTAMP:20261001T000000Z");
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
  });

  it("uses CRLF line endings and never exceeds 75 octets per physical line", () => {
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.includes("\n") && !/[^\r]\n/.test(ics)).toBe(true);
    for (const physical of ics.split("\r\n")) {
      expect(encoder.encode(physical).length).toBeLessThanOrEqual(75);
    }
  });

  it("warns at the start of the EXPIRING band, then again at the deadline", () => {
    // 20% of 24h = 288 minutes.
    expect(lines).toContain("TRIGGER:-PT288M");
    expect(lines).toContain("TRIGGER:PT0M");
  });

  it("gets a UID unique to this vault and deadline", () => {
    expect(lines).toContain(`UID:${input.vault.toLowerCase()}-1790899200@nostrom`);
  });

  it("escapes TEXT values", () => {
    expect(lines).toContain("SUMMARY:Nostrom deadline: Treasury\\, main\\; ops");
  });

  it("says in the event itself that a heartbeat makes it stale", () => {
    expect(lines.find((l) => l.startsWith("DESCRIPTION:"))).toMatch(/Every heartbeat moves the real deadline later/);
  });
});

describe("helpers", () => {
  it("floors the early alarm at five minutes for very short timeouts", () => {
    expect(alarmLeadMinutes(60n)).toBe(5);
    expect(alarmLeadMinutes(3_600n)).toBe(12);
  });

  it("formats UTC basic time", () => {
    expect(icsDate(new Date("2026-01-02T03:04:05.678Z"))).toBe("20260102T030405Z");
  });

  it("escapes backslash, semicolon, comma and newlines", () => {
    expect(escapeText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });

  it("folds by UTF-8 bytes without splitting a multi-byte character", () => {
    const line = `SUMMARY:${"é".repeat(60)}`;
    const folded = foldLine(line);
    for (const physical of folded.split("\r\n")) {
      expect(encoder.encode(physical).length).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });
});
