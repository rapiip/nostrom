import type { VaultPhase } from "./vaultState";

/**
 * Which phase transitions deserve an operating-system notification.
 *
 * Only the ones that change what somebody must do: the grace window entering
 * its last 20%, the heartbeat lapsing, and the switch firing. A routine
 * heartbeat is not worth interrupting anyone for.
 *
 * The first reading of a vault (`prev === undefined`) is a baseline and is
 * never announced: opening a page onto an already-lapsed vault shows that state
 * on screen, it is not news.
 */

export interface PhaseAlert {
  title: string;
  body: string;
  urgency: "warn" | "danger";
}

export function phaseAlert(
  prev: VaultPhase | undefined,
  next: VaultPhase,
  label: string,
): PhaseAlert | null {
  if (prev === undefined || prev === next) return null;

  switch (next) {
    case "EXPIRING":
      return prev === "ALIVE"
        ? {
            title: `Grace running low: ${label}`,
            body: "Under 20% of the heartbeat window is left. One heartbeat resets it.",
            urgency: "warn",
          }
        : null;
    case "EXECUTABLE":
      return prev === "ALIVE" || prev === "EXPIRING"
        ? {
            title: `Heartbeat lapsed: ${label}`,
            body: "Anyone can now execute the switch and send the treasury to the recovery address.",
            urgency: "danger",
          }
        : null;
    case "TRIGGERED":
      return prev === "ALIVE" || prev === "EXPIRING" || prev === "EXECUTABLE"
        ? {
            title: `Switch fired: ${label}`,
            body: "The treasury was sent to the recovery address.",
            urgency: "danger",
          }
        : null;
    default:
      return null;
  }
}
