import { EXPIRING_THRESHOLD_FRACTION } from "./vaultState";

/**
 * A calendar reminder for a vault's execution deadline (RFC 5545 iCalendar).
 *
 * The site has no backend, so it cannot warn anyone once its tab is closed. A
 * calendar event is the one reminder that lives outside the browser without a
 * server: the user's own calendar raises it.
 *
 * The limitation is stated inside the event itself: the deadline is fixed at
 * export time, and every heartbeat moves the real one later. The event is a
 * "check by" reminder, and its text says that if the vault shows a recent
 * heartbeat there is nothing to do.
 */

export interface DeadlineEventInput {
  vault: string;
  /** Saved name, or a truncated address. */
  label: string;
  chainName: string;
  /** Unix seconds: `lastPingTime + timeoutPeriod`. */
  deadline: bigint;
  timeoutPeriod: bigint;
  /** Link back to the live vault page. */
  url: string;
  /** Export time; injectable for tests. */
  now?: Date;
}

/** Floor for the early alarm's lead time, in minutes. */
const MIN_LEAD_MINUTES = 5;

/**
 * Early-warning lead, in whole minutes. Matches the console's EXPIRING band
 * (the last 20% of the window), so the calendar and the UI turn amber at the
 * same moment.
 */
export function alarmLeadMinutes(timeoutPeriod: bigint): number {
  const seconds = Number(timeoutPeriod) * EXPIRING_THRESHOLD_FRACTION;
  return Math.max(MIN_LEAD_MINUTES, Math.round(seconds / 60));
}

/** 20260101T120000Z */
export function icsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escape TEXT values: backslash, semicolon, comma and newlines (RFC 5545 3.3.11). */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

const encoder = new TextEncoder();

/**
 * Fold a content line to at most 75 octets per physical line (RFC 5545 3.1).
 * Counts UTF-8 bytes, not characters, and never splits a code point, so a
 * saved vault name in any script survives the round trip.
 */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  // Continuation lines start with one space, which counts toward their 75.
  let limit = 75;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = 74;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildDeadlineIcs(input: DeadlineEventInput): string {
  const start = new Date(Number(input.deadline) * 1000);
  const stamp = input.now ?? new Date();
  const lead = alarmLeadMinutes(input.timeoutPeriod);

  const description = [
    `Execution deadline for Nostrom vault ${input.vault} on ${input.chainName}, as of ${stamp.toISOString()}.`,
    "Every heartbeat moves the real deadline later, so this reminder only matters if the agent has gone quiet since you exported it.",
    "If the vault page shows a recent heartbeat, there is nothing to do.",
    "If not, anyone can execute the switch after this time and send the treasury to the recovery address.",
    `Live state: ${input.url}`,
  ].join("\n\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Nostrom//Vault deadline//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    // Stable per vault AND deadline: re-exporting after a heartbeat creates a
    // new event rather than silently overwriting the old one in some clients.
    `UID:${input.vault.toLowerCase()}-${input.deadline.toString()}@nostrom`,
    `DTSTAMP:${icsDate(stamp)}`,
    `DTSTART:${icsDate(start)}`,
    "DURATION:PT15M",
    `SUMMARY:${escapeText(`Nostrom deadline: ${input.label}`)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `URL:${input.url}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(`Nostrom vault ${input.label} enters its last 20% of grace. Check that the agent is still sending heartbeats.`)}`,
    `TRIGGER:-PT${lead}M`,
    "END:VALARM",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(`Nostrom vault ${input.label} is executable now unless a heartbeat arrived.`)}`,
    "TRIGGER:PT0M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.map(foldLine).join("\r\n") + "\r\n";
}
