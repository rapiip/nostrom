import { Bell, BellRinging, BellSlash, CalendarPlus } from "@phosphor-icons/react";
import { buildDeadlineIcs } from "@/lib/calendar";
import { formatTimestamp } from "@/lib/format";
import type { VaultView } from "@/lib/vaultState";
import { useBrowserAlerts, type AlertsStatus } from "@/hooks/useBrowserAlerts";
import { Button } from "@/components/ui/Button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";

/**
 * Reminders: how to hear about a vault when nobody is looking at it.
 *
 * The protocol's failure mode is silence, and a website with no server cannot
 * break that silence once its tab is closed. The calendar event is the one
 * reminder that lives entirely outside the browser; browser alerts cover the
 * "console left open in a spare tab" case. Both are local: nothing is sent
 * anywhere.
 */
export function ReminderPanel({
  view,
  label,
  chainName,
}: {
  view: VaultView;
  /** Saved name, or a truncated address. */
  label: string;
  chainName: string;
}) {
  const hasDeadline = view.phase === "ALIVE" || view.phase === "EXPIRING";

  const download = () => {
    const ics = buildDeadlineIcs({
      vault: view.address,
      label,
      chainName,
      deadline: view.deadline,
      timeoutPeriod: view.timeoutPeriod,
      url: `${window.location.origin}/app/vault/${view.address}`,
    });
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nostrom-deadline-${view.address.slice(2, 8).toLowerCase()}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const noDeadlineReason =
    view.phase === "EXECUTABLE"
      ? "The deadline has already passed."
      : view.phase === "TRIGGERED"
        ? "The switch has fired; there is no deadline until the vault is re-armed."
        : "An unconfigured vault has no deadline.";

  return (
    <Panel>
      <PanelHeader
        title="Reminders"
        description="Nostrom has no server, so nothing can warn you once every tab is closed. These can, and neither sends data anywhere."
      />
      <PanelBody className="flex flex-col gap-5">
        <div>
          <p className="text-[13px] text-text">Calendar reminder</p>
          <p className="mt-1 text-[12px] leading-relaxed text-text-faint">
            An event at the current deadline
            {hasDeadline && (
              <>
                {" "}
                (<span className="tnum text-text-dim">{formatTimestamp(view.deadline)}</span>)
              </>
            )}
            , with an alert when the last 20% of grace begins. It is fixed when you download it.
            Every heartbeat moves the real deadline later, so if it goes off, open the vault and
            check.
          </p>
          <Button
            size="sm"
            className="mt-3"
            icon={<CalendarPlus size={13} aria-hidden />}
            onClick={download}
            disabled={!hasDeadline}
          >
            Download .ics
          </Button>
          {!hasDeadline && <p className="mt-2 text-[12px] text-text-faint">{noDeadlineReason}</p>}
        </div>

        <div className="border-t border-line pt-5">
          <p className="text-[13px] text-text">Browser alerts</p>
          <p className="mt-1 text-[12px] leading-relaxed text-text-faint">
            A system notification when grace runs low, the heartbeat lapses or the switch fires,
            while a Nostrom tab stays open, even in the background. Phones often pause background
            tabs, so rely on the calendar there.
          </p>
          <div className="mt-3">
            <AlertsToggle />
          </div>
        </div>
      </PanelBody>
    </Panel>
  );
}

const STATUS_COPY: Record<Exclude<AlertsStatus, "off" | "on">, string> = {
  unsupported: "This browser cannot show notifications from a website.",
  denied: "Notifications are blocked for this site. Allow them in your browser's site settings, then reload.",
};

/** On/off control for browser alerts. `compact` for page headers. */
export function AlertsToggle({ compact = false }: { compact?: boolean }) {
  const alerts = useBrowserAlerts();

  if (alerts.status === "unsupported" || alerts.status === "denied") {
    if (compact) {
      return alerts.status === "denied" ? (
        <Button
          size="sm"
          variant="ghost"
          disabled
          icon={<BellSlash size={13} aria-hidden />}
          title={STATUS_COPY.denied}
        >
          Alerts blocked
        </Button>
      ) : null;
    }
    return <p className="text-[12px] text-text-faint">{STATUS_COPY[alerts.status]}</p>;
  }

  const on = alerts.status === "on";
  // The label states the current state (compact) or the action (full), so no
  // aria-pressed: a toggle whose label also changes reads as contradictory.
  const button = (
    <Button
      size="sm"
      variant={compact ? "ghost" : "secondary"}
      icon={
        on ? (
          <BellRinging size={13} className="text-signal" aria-hidden />
        ) : (
          <Bell size={13} aria-hidden />
        )
      }
      onClick={() => (on ? alerts.disable() : void alerts.enable())}
      title={on ? "Browser alerts are on. Click to turn them off." : "Get a system notification when a vault needs attention."}
    >
      {compact ? (on ? "Alerts on" : "Alerts off") : on ? "Turn off browser alerts" : "Turn on browser alerts"}
    </Button>
  );

  if (compact) return button;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {button}
      {on && (
        <span className="inline-flex items-center gap-1.5 text-[12px] text-signal">
          <span className="size-1.5 rounded-full bg-signal" aria-hidden />
          On in this browser
        </span>
      )}
    </div>
  );
}
