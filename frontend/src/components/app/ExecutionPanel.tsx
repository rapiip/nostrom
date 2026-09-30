import { useState } from "react";
import { Broadcast, Lock, Warning } from "@phosphor-icons/react";
import { formatAmount, formatDuration } from "@/lib/format";
import type { VaultActions } from "@/hooks/useVaultActions";
import type { VaultCapabilities, VaultView } from "@/lib/vaultState";
import { useClock } from "@/hooks/useClock";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { AddressDisplay } from "@/components/ui/Address";
import { Notice, Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";

/**
 * Execution panel: the permissionless surface.
 *
 * Shown to every visitor, not just the owner, because that is precisely the
 * protocol's design: recovery must not depend on the owner being online. The
 * panel is explicit that the caller cannot choose the destination, so a stranger
 * reading it can tell there is nothing to extract and nothing to fear.
 *
 * It renders in three modes:
 *   armed but not lapsed  explains what will become possible, and when
 *   executable            offers the button
 *   triggered             offers the post-trigger sweeps
 */
export function ExecutionPanel({
  view,
  capabilities,
  actions,
  chainId,
}: {
  view: VaultView;
  capabilities: VaultCapabilities;
  actions: VaultActions;
  chainId: number | undefined;
}) {
  const now = useClock();
  const [confirmExecute, setConfirmExecute] = useState(false);

  return (
    <>
      <Panel>
        <PanelHeader
          title="Permissionless execution"
          description="Once the deadline passes, anyone can fire the switch. They cannot choose where the money goes."
        />

        <PanelBody className="flex flex-col gap-5">
          {/* Destination is fixed: the single most important fact here. */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded border border-line bg-ink-800 px-3.5 py-3">
            <div>
              <span className="label">Funds always go to</span>
              <p className="mt-1 text-[12px] text-text-faint">The stored recovery address</p>
            </div>
            <AddressDisplay
              address={view.recovery}
              chainId={chainId}
              label="recovery address"
              chars={6}
            />
          </div>

          {/* --- Mode: armed, not yet lapsed --- */}
          {(view.phase === "ALIVE" || view.phase === "EXPIRING") && (
            <div className="flex items-start gap-3 rounded border border-line px-3.5 py-3">
              <Lock size={15} className="mt-0.5 shrink-0 text-text-faint" aria-hidden />
              <div className="min-w-0">
                <p className="text-[13px] text-text">
                  Locked for{" "}
                  <span className="tnum">{formatDuration(view.liveSecondsRemaining)}</span>
                </p>
                {/* Name the on-chain error, not just the locked state.
                    `executeDeadManSwitch()` reverts with AgentStillAlive while
                    the deadline is in the future, so a reader who is about to
                    call the contract directly learns the actual reason. */}
                <p className="mt-1 text-[12px] leading-relaxed text-text-faint">
                  Opens to anyone when the countdown reaches zero. Calling it earlier is rejected by
                  the contract with <span className="tnum text-text-dim">AgentStillAlive</span>.
                </p>
              </div>
            </div>
          )}

          {/* --- Mode: executable --- */}
          {capabilities.canExecute && (
            <>
              <div className="rounded border border-danger-dim bg-danger/[0.04] px-3.5 py-3">
                <span className="label">Will be moved</span>
                <p className="tnum mt-1.5 text-[20px] font-medium text-text">
                  {formatAmount(view.balance)} <span className="text-[13px] text-text-faint">BOT</span>
                </p>
                <p className="mt-1 text-[12px] text-text-faint">
                  plus every tracked ERC-20 · lapsed{" "}
                  {formatDuration(BigInt(now) - view.deadline)} ago
                </p>
              </div>

              <Button
                variant="danger"
                full
                size="lg"
                icon={<Broadcast size={15} aria-hidden />}
                loading={actions.tx.isBusy}
                onClick={() => setConfirmExecute(true)}
              >
                Execute switch
              </Button>

              <p className="text-[12px] leading-relaxed text-text-faint">
                You pay the gas (about 74,400 units for a native-only rescue) and receive nothing.
                Anyone can do this, which is the point.
              </p>
            </>
          )}

          {/* --- Mode: triggered --- */}
          {view.phase === "TRIGGERED" && (
            <>
              {/* The heartbeat panel already announces the trigger in red; this
                  panel only explains what is still possible here. */}
              <p className="text-[13px] leading-relaxed text-text-dim">
                The switch has already fired. If BOT arrives later (a late deposit, a refund), anyone
                can push it on to the recovery address.
              </p>

              {view.balance > 0n ? (
                <Button
                  variant="secondary"
                  icon={<Broadcast size={14} aria-hidden />}
                  loading={actions.tx.isBusy}
                  onClick={actions.sweepNative}
                  className="self-start"
                >
                  Sweep {formatAmount(view.balance)} BOT to recovery
                </Button>
              ) : (
                <p className="flex items-center gap-2 text-[12px] text-text-faint">
                  <span className="size-1.5 rounded-full bg-text-faint" aria-hidden />
                  Nothing left to sweep: the vault holds 0 BOT.
                </p>
              )}
            </>
          )}

          {view.phase === "UNCONFIGURED" && (
            <Notice tone="warn" title="Vault is not configured">
              This vault was never initialised, so there is no countdown to lapse and nothing can
              be executed.
            </Notice>
          )}
        </PanelBody>
      </Panel>

      <ConfirmDialog
        open={confirmExecute}
        onClose={() => setConfirmExecute(false)}
        onConfirm={() => {
          setConfirmExecute(false);
          actions.executeDeadManSwitch();
        }}
        title="Execute the dead-man's switch"
        confirmLabel="Execute"
        consequence={
          <>
            {view.balance > 0n ? (
              <>
                <span className="tnum text-text">{formatAmount(view.balance)} BOT</span> plus any
                tracked ERC-20 balances
              </>
            ) : (
              "Any tracked ERC-20 balances"
            )}{" "}
            will be transferred to the recovery address below, and the vault will be marked
            triggered, freezing owner withdrawals until it is re-armed. You pay the gas and receive
            nothing.
          </>
        }
      >
        <div className="rounded border border-line bg-ink-800 px-3.5 py-3">
          <span className="label">Destination</span>
          <div className="mt-2">
            <AddressDisplay
              address={view.recovery}
              chainId={chainId}
              label="recovery address"
              full
            />
          </div>
        </div>
      </ConfirmDialog>
    </>
  );
}

/**
 * Compact warning shown at the top of a vault the app could not verify against
 * the factory registry. A look-alike contract can implement the same ABI and
 * behave differently, so this is a real risk rather than a formality.
 */
export function RegistryWarning({
  isRegistered,
  canVerify,
}: {
  isRegistered: boolean | undefined;
  canVerify: boolean;
}) {
  if (isRegistered === true) return null;

  if (!canVerify) {
    return (
      <Notice tone="info" title="Cannot verify this vault">
        No factory is configured for this network, so Nostrom cannot confirm that this address is a
        genuine vault. It reads like one, but verify the contract source on the explorer before
        depositing.
      </Notice>
    );
  }

  if (isRegistered === false) {
    return (
      <Notice tone="warn" title="Not from the configured factory">
        <div className="flex items-start gap-2">
          <Warning size={14} className="mt-0.5 shrink-0 text-warn" aria-hidden />
          <span>
            This contract exposes the Nostrom vault interface but was not created by the factory this
            app knows about. It may be a standalone deployment, or a look-alike built to collect
            deposits. Do not deposit until you have read its source on the block explorer.
          </span>
        </div>
      </Notice>
    );
  }

  return null;
}
