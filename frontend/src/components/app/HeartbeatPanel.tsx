import { clsx } from "clsx";
import { Pulse } from "@phosphor-icons/react";
import { formatDuration, formatRelative, formatTimestamp } from "@/lib/format";
import { PHASE_META, type VaultCapabilities, type VaultView } from "@/lib/vaultState";
import { useClock } from "@/hooks/useClock";
import { Button } from "@/components/ui/Button";
import { GraceCountdown, GraceTrack } from "@/components/ui/GraceTrack";
import { DataList, DataRow, Label, Notice, Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";

/**
 * Heartbeat panel: the vault's vital sign.
 *
 * This is the screen's focal point, so it gets the largest type on the page and
 * the grace track at full width. Everything else about a vault is secondary to
 * "how long until someone can take the funds".
 *
 * The ping button appears only for the agent key, because ping() carries
 * onlyAgent: offering it to an owner would produce a guaranteed revert.
 */
export function HeartbeatPanel({
  view,
  capabilities,
  onPing,
  isPinging,
}: {
  view: VaultView;
  capabilities: VaultCapabilities;
  onPing: () => void;
  isPinging: boolean;
}) {
  const now = useClock();
  const meta = PHASE_META[view.phase];

  return (
    <Panel>
      <PanelHeader
        title="Heartbeat"
        description={meta.description}
        actions={
          capabilities.canPing ? (
            <Button
              variant="primary"
              icon={<Pulse size={14} aria-hidden />}
              onClick={onPing}
              loading={isPinging}
            >
              Send heartbeat
            </Button>
          ) : undefined
        }
      />

      <PanelBody className="flex flex-col gap-6">
        {/* --- Countdown --- */}
        <div>
          <Label>
            {view.phase === "TRIGGERED"
              ? "Final state"
              : view.phase === "EXECUTABLE"
                ? "Grace period"
                : "Grace remaining"}
          </Label>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <GraceCountdown view={view} size="lg" />
            {(view.phase === "ALIVE" || view.phase === "EXPIRING") && (
              <span className="text-[13px] text-text-dim">
                of {formatDuration(view.timeoutPeriod)}
              </span>
            )}
          </div>
          <GraceTrack view={view} height="lg" className="mt-5" />

          {/* Axis labels turn the bar into a gauge with real endpoints. */}
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-[11px] text-text-faint">
              last ping {formatRelative(view.lastPingTime, now)}
            </span>
            <span
              className={clsx(
                "tnum text-[11px]",
                view.phase === "EXECUTABLE" || view.phase === "TRIGGERED"
                  ? "text-danger"
                  : "text-text-faint",
              )}
            >
              deadline {formatRelative(view.deadline, now)}
            </span>
          </div>
        </div>

        {/* --- Phase-specific guidance --- */}
        {view.phase === "EXECUTABLE" && (
          <Notice tone="danger" title="The switch is live">
            The heartbeat lapsed {formatDuration(BigInt(now) - view.deadline)} ago. Anyone can now
            trigger emergency evacuation to transfer the entire balance to the recovery address. If
            this is unexpected, act now: a heartbeat still resets the countdown, and the owner can
            still withdraw.
          </Notice>
        )}

        {view.phase === "EXPIRING" && (
          <Notice tone="warn" title="Grace period running low">
            Under {Math.ceil(view.gracePct)}% of the window remains. One heartbeat resets it to full.
          </Notice>
        )}

        {view.phase === "TRIGGERED" && (
          <Notice tone="danger" title="Treasury already evacuated">
            The switch fired and the balance was transferred to the recovery address. Owner
            withdrawals and heartbeats are frozen. The owner can re-arm and reactivate the vault to
            return it to active service with a fresh agent.
          </Notice>
        )}

        {view.phase === "ALIVE" && view.balance === 0n && (
          <Notice tone="warn" title="Vault is empty">
            The switch is armed and the heartbeat is current, but there is nothing to protect.
            Deposit BOT to make the fail-safe meaningful.
          </Notice>
        )}

        {/* --- Timing detail --- */}
        <DataList className="border-t border-line pt-1">
          <DataRow
            label="Last heartbeat"
            hint={view.lastPingTime > 0n ? formatRelative(view.lastPingTime, now) : undefined}
          >
            <span className="tnum">{formatTimestamp(view.lastPingTime)}</span>
          </DataRow>
          <DataRow label="Execution deadline">
            <span className="tnum">{formatTimestamp(view.deadline)}</span>
          </DataRow>
          <DataRow label="Timeout period">
            <span className="tnum">{formatDuration(view.timeoutPeriod)}</span>
          </DataRow>
          <DataRow
            label="Lifetime pings"
            hint={view.pingCount === 0n ? "No heartbeat has ever been sent" : undefined}
          >
            <span className="tnum">{view.pingCount.toString()}</span>
          </DataRow>
        </DataList>

        {capabilities.canPing && (
          <p className="text-[12px] leading-relaxed text-text-faint">
            You are connected with this vault's agent key. In live operation, heartbeats are dispatched
            automatically by your agent process.
          </p>
        )}
      </PanelBody>
    </Panel>
  );
}
