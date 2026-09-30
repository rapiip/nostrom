import { clsx } from "clsx";
import { useState } from "react";
import { ArrowLineUp, GasPump, Pulse, ShieldCheck } from "@phosphor-icons/react";
import { useBalance, useGasPrice } from "wagmi";
import { AGENT_GAS_RUNWAY, GAS } from "@/config/contracts";
import {
  describeTimeout,
  formatAgo,
  formatAmount,
  formatCount,
  formatDuration,
  formatRelative,
  formatTimestamp,
} from "@/lib/format";
import { PHASE_META, type VaultCapabilities, type VaultView } from "@/lib/vaultState";
import { useClock } from "@/hooks/useClock";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { GraceCountdown, GraceTrack } from "@/components/ui/GraceTrack";
import { DataList, DataRow, Label, Notice, Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { GetBotLink } from "@/components/web3/FundWallet";

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
  onRearm,
  isPinging,
  chainId,
}: {
  view: VaultView;
  capabilities: VaultCapabilities;
  onPing: () => void;
  /** Present only for the owner of a triggered vault. */
  onRearm?: () => void;
  isPinging: boolean;
  chainId: number | undefined;
}) {
  const now = useClock();
  const meta = PHASE_META[view.phase];
  const gas = useAgentGasRunway(view, chainId);
  const [confirmRearm, setConfirmRearm] = useState(false);

  /** Scrolls to the withdrawal form and focuses the amount field. */
  const goToWithdraw = () => {
    const panel = document.getElementById("funding");
    panel?.scrollIntoView({ behavior: "smooth", block: "start" });
    const inputs = panel?.querySelectorAll<HTMLInputElement>('input[inputmode="decimal"]');
    inputs?.[inputs.length - 1]?.focus({ preventScroll: true });
  };

  return (
    <Panel>
      <PanelHeader
        title="Heartbeat"
        description={meta.description}
        actions={
          // In the warning states the button moves into the warning itself, so
          // the one thing to do sits next to the reason to do it (and is not
          // offered twice on the same screen).
          capabilities.canPing && view.phase === "ALIVE" ? (
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
              last ping {formatAgo(view.lastPingTime, now)}
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
          <Notice
            tone="danger"
            title="The switch is live"
            action={
              capabilities.canPing ? (
                <Button variant="primary" size="sm" icon={<Pulse size={13} aria-hidden />} onClick={onPing} loading={isPinging}>
                  Send heartbeat now
                </Button>
              ) : capabilities.canWithdraw && view.balance > 0n ? (
                <Button variant="danger" size="sm" icon={<ArrowLineUp size={13} aria-hidden />} onClick={goToWithdraw}>
                  Withdraw now
                </Button>
              ) : undefined
            }
          >
            The heartbeat lapsed {formatDuration(BigInt(now) - view.deadline)} ago, so anyone can
            now send the whole balance to the recovery address.{" "}
            {capabilities.isOwner || capabilities.isAgent
              ? "If that is not what you want, act now: a heartbeat still resets the clock, and the owner can still withdraw."
              : "That is the vault working as designed."}
          </Notice>
        )}

        {view.phase === "EXPIRING" && (
          <Notice
            tone="warn"
            title="Grace period running low"
            action={
              capabilities.canPing ? (
                <Button variant="secondary" size="sm" icon={<Pulse size={13} aria-hidden />} onClick={onPing} loading={isPinging}>
                  Send heartbeat
                </Button>
              ) : undefined
            }
          >
            Less than {Math.ceil(view.gracePct)}% of the window is left. One heartbeat refills it.
          </Notice>
        )}

        {view.phase === "TRIGGERED" && (
          <Notice
            tone="danger"
            title="Treasury already evacuated"
            action={
              onRearm ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<ShieldCheck size={13} aria-hidden />}
                  onClick={() => setConfirmRearm(true)}
                >
                  Re-arm vault
                </Button>
              ) : undefined
            }
          >
            The switch fired and the balance went to the recovery address. Heartbeats, withdrawals
            and settings are locked.{" "}
            {onRearm
              ? "Re-arm to put this vault back into service with a fresh countdown."
              : "Only the owner can put it back into service."}
          </Notice>
        )}

        {view.phase === "ALIVE" && view.balance === 0n && (
          <Notice tone="warn" title="Vault is empty">
            The switch is armed and the heartbeat is current, but there is nothing to protect.
            Deposit BOT to make the fail-safe meaningful.
          </Notice>
        )}

        {/* An agent that cannot pay for ping() is indistinguishable, on-chain,
            from a dead one. Flag it while there is still time to top it up. */}
        {gas.level !== "ok" && gas.level !== "unknown" && (
          <Notice
            tone={gas.level === "empty" ? "danger" : "warn"}
            title={
              gas.level === "empty"
                ? "The agent wallet cannot pay for a heartbeat"
                : "The agent wallet is running low on gas"
            }
          >
            {gas.level === "empty" ? (
              <>
                The agent holds {formatAmount(gas.balance)} BOT, less than one ping costs at the
                current gas price. Its heartbeats will fail and the switch will fire on a healthy
                agent in{" "}
                <span className="tnum text-text">{formatDuration(view.liveSecondsRemaining)}</span>.
              </>
            ) : (
              <>
                Enough for about <span className="tnum text-text">{formatCount(gas.pingsLeft)}</span>{" "}
                more heartbeats ({formatAmount(gas.balance)} BOT at ~{formatAmount(gas.pingCost, { maxFractionDigits: 6 })}{" "}
                BOT each).
              </>
            )}{" "}
            Send BOT to the agent address to keep it alive.{" "}
            <GetBotLink chainId={chainId} compact />
          </Notice>
        )}

        {/* --- Timing detail --- */}
        <DataList className="border-t border-line pt-1">
          <DataRow
            label="Last heartbeat"
            hint={view.lastPingTime > 0n ? formatAgo(view.lastPingTime, now) : undefined}
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
          {gas.level !== "unknown" && view.phase !== "TRIGGERED" && (
            <DataRow
              label={
                <span className="inline-flex items-center gap-1.5">
                  <GasPump size={11} aria-hidden />
                  Agent gas
                </span>
              }
              hint={
                gas.pingsLeft !== undefined
                  ? `≈ ${formatCount(gas.pingsLeft)} heartbeats at the current gas price`
                  : undefined
              }
            >
              <span
                className={clsx(
                  "tnum",
                  gas.level === "empty" ? "text-danger" : gas.level === "low" ? "text-warn" : undefined,
                )}
              >
                {formatAmount(gas.balance)} <span className="text-text-faint">BOT</span>
              </span>
            </DataRow>
          )}
        </DataList>

        {capabilities.canPing && (
          <p className="text-[12px] leading-relaxed text-text-faint">
            You are signed in with this vault's agent key. In normal operation your agent process
            sends heartbeats on its own; this button is for testing or a manual rescue.
          </p>
        )}
      </PanelBody>

      {onRearm && (
        <ConfirmDialog
          open={confirmRearm}
          onClose={() => setConfirmRearm(false)}
          onConfirm={() => {
            setConfirmRearm(false);
            onRearm();
          }}
          tone="primary"
          title="Re-arm this vault"
          confirmLabel="Re-arm"
          consequence={
            <>
              The vault returns to normal and the countdown restarts now, with{" "}
              {describeTimeout(view.timeoutPeriod)} of grace. It does{" "}
              <span className="text-text">not</span> bring back the evacuated funds. Make sure the
              agent is running and checking in before you confirm, or the switch can fire again.
            </>
          }
        />
      )}
    </Panel>
  );
}


/* ===========================================================================
   Agent gas runway
   =========================================================================== */

type GasLevel = "unknown" | "ok" | "low" | "empty";

/**
 * How many heartbeats the agent's own wallet can still pay for.
 *
 * Public data (anyone can read any balance), so it is shown to every visitor,
 * not just the owner: a keeper deciding whether a lapse is "agent died" or
 * "agent ran out of gas" benefits from the same number.
 *
 * Only meaningful while the vault is armed; after a trigger the agent no longer
 * needs gas for this vault.
 */
function useAgentGasRunway(view: VaultView, chainId: number | undefined) {
  const active = view.phase === "ALIVE" || view.phase === "EXPIRING" || view.phase === "EXECUTABLE";

  const balance = useBalance({
    address: view.agent,
    chainId: chainId as never,
    query: { enabled: active, refetchInterval: 30_000 },
  });
  const gasPrice = useGasPrice({ chainId: chainId as never, query: { enabled: active, refetchInterval: 60_000 } });

  const wei = balance.data?.value;
  const price = gasPrice.data;

  if (!active || wei === undefined || price === undefined || price === 0n) {
    return { level: "unknown" as GasLevel, balance: wei, pingCost: undefined, pingsLeft: undefined };
  }

  const pingCost = GAS.PING * price;
  const pingsLeft = wei / pingCost;
  const level: GasLevel =
    pingsLeft < 1n ? "empty" : pingsLeft < AGENT_GAS_RUNWAY.WARN_PINGS ? "low" : "ok";

  return { level, balance: wei, pingCost, pingsLeft };
}
