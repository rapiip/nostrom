import { useState } from "react";
import { Broadcast, Warning } from "@phosphor-icons/react";
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
          description="executeDeadManSwitch() has no access control. That is deliberate: if recovery required the owner to act, the vault would fail in exactly the scenario it exists for."
        />

        <PanelBody className="flex flex-col gap-5">
          {/* Destination is fixed: the single most important fact here. */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 rounded border border-line bg-ink-800 px-3.5 py-3">
            <div>
              <span className="label">Fixed destination</span>
              <p className="mt-1.5 text-[12px] leading-relaxed text-text-dim">
                The caller cannot redirect the funds. They always go to the stored recovery address.
              </p>
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
            <>
              <Notice tone="info">
                Not executable yet. The agent has{" "}
                <span className="tnum text-text">
                  {formatDuration(view.liveSecondsRemaining)}
                </span>{" "}
                of grace left. The dead-man's switch activates automatically once the grace period
                has fully expired.
              </Notice>
              <Button variant="danger" disabled full>
                Execute dead-man's switch
              </Button>
              {/* Name the on-chain error, not just the disabled state.
                  `executeDeadManSwitch()` reverts with AgentStillAlive while the
                  deadline is in the future, so a reader who wonders why the
                  control is inert — or who is about to call the contract
                  directly — learns the actual reason rather than a euphemism.
                  A copy pass once reduced this to "disabled while the heartbeat
                  is active", which dropped the citation; verify-flows asserts the
                  error name is present precisely so that cannot recur. */}
              <p className="text-[12px] leading-relaxed text-text-faint">
                Disabled because the heartbeat is current. Calling it now would revert with{" "}
                <span className="tnum text-text-dim">AgentStillAlive</span>.
              </p>
            </>
          )}

          {/* --- Mode: executable --- */}
          {capabilities.canExecute && (
            <>
              <Notice tone="danger" title="Ready to execute">
                The heartbeat lapsed {formatDuration(BigInt(now) - view.deadline)} ago.{" "}
                {view.balance > 0n ? (
                  <>
                    <span className="tnum text-text">{formatAmount(view.balance)} BOT</span> plus any
                    tracked ERC-20 balances will move to the recovery address.
                  </>
                ) : (
                  "The vault holds no native BOT, but tracked ERC-20s will still be swept and the vault will be marked triggered."
                )}
              </Notice>

              <Button
                variant="danger"
                full
                size="lg"
                icon={<Broadcast size={15} aria-hidden />}
                loading={actions.tx.isBusy}
                onClick={() => setConfirmExecute(true)}
              >
                Execute dead-man's switch
              </Button>

              <p className="text-[12px] leading-relaxed text-text-faint">
                You pay the gas (around 74,400 for a native-only rescue). You receive nothing; the
                funds go to the vault's recovery address. Anyone can run this, which is the point.
              </p>
            </>
          )}

          {/* --- Mode: triggered --- */}
          {view.phase === "TRIGGERED" && (
            <>
              <Notice tone="danger" title="Already executed">
                This vault's switch has fired and the treasury was evacuated. The sweeps below exist
                for anything that arrives afterwards: forced transfers, late refunds, or tokens that
                were never on the watchlist.
              </Notice>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={view.balance === 0n}
                  loading={actions.tx.isBusy}
                  onClick={actions.sweepNative}
                >
                  Sweep {formatAmount(view.balance)} BOT to recovery
                </Button>
              </div>
              {view.balance === 0n && (
                <p className="text-[12px] text-text-faint">
                  No native balance to sweep. All treasury funds have been evacuated.
                </p>
              )}
            </>
          )}

          {view.phase === "UNCONFIGURED" && (
            <Notice tone="warn" title="Vault initialization required">
              This vault is awaiting initial configuration. Fail-safe operations are enabled once
              configuration is complete.
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
      <Notice tone="warn" title="Unverified factory source">
        <div className="flex items-start gap-2">
          <Warning size={14} className="mt-0.5 shrink-0 text-warn" aria-hidden />
          <span>
            This contract matches the Nostrom interface but was not deployed through the official
            factory registry. Always verify the contract on the block explorer before depositing.
          </span>
        </div>
      </Notice>
    );
  }

  return null;
}
