import { useState } from "react";
import { ArrowLineDown, ArrowLineUp, Gear, ShieldCheck } from "@phosphor-icons/react";
import { PROTOCOL, TIMEOUT_PRESETS } from "@/config/contracts";
import { describeTimeout, formatAmount, formatAmountExact, formatDuration } from "@/lib/format";
import { normalizeAddress, validateAddressField, validateAmount, validateTimeout } from "@/lib/validation";
import type { VaultActions } from "@/hooks/useVaultActions";
import type { VaultCapabilities, VaultView } from "@/lib/vaultState";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Disclosure, Field, Input, InputUnit, SegmentedGroup } from "@/components/ui/Field";
import { Notice, Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";

/**
 * Owner controls.
 *
 * Grouped by consequence rather than by contract section:
 *   funding      deposit (anyone) and withdrawals (owner)
 *   configuration timeout, recovery, agent rotation
 *   handover     ownership transfer
 *
 * Every fund-moving or authority-transferring action goes through a confirmation
 * step that states the consequence in plain language BEFORE anything reaches the
 * wallet. The contract's `whenNotTriggered` guard is mirrored by disabling the
 * whole panel once the switch has fired, with an explanation rather than silence.
 */
export function OwnerPanel({
  view,
  capabilities,
  actions,
  walletBalance,
}: {
  view: VaultView;
  capabilities: VaultCapabilities;
  actions: VaultActions;
  walletBalance: bigint | undefined;
}) {
  const [depositValue, setDepositValue] = useState("");
  const [withdrawValue, setWithdrawValue] = useState("");
  const [timeoutPreset, setTimeoutPreset] = useState(String(view.timeoutPeriod));
  const [newRecovery, setNewRecovery] = useState("");
  const [newAgent, setNewAgent] = useState("");
  const [newOwner, setNewOwner] = useState("");

  const [confirm, setConfirm] = useState<null | {
    title: string;
    consequence: React.ReactNode;
    label: string;
    run: () => void;
  }>(null);

  const depositResult = validateAmount(depositValue, { max: walletBalance, label: "Deposit" });
  const withdrawResult = validateAmount(withdrawValue, {
    max: view.balance,
    required: true,
    label: "Withdrawal",
  });

  const timeoutSeconds = BigInt(timeoutPreset || "0");
  const timeoutResult = validateTimeout(timeoutSeconds);
  const timeoutChanged = timeoutSeconds !== view.timeoutPeriod;

  const recoveryResult = newRecovery ? validateAddressField(newRecovery, "Recovery address") : { ok: false };
  const recoveryIsAgent = normalizeAddress(newRecovery)?.toLowerCase() === view.agent.toLowerCase();
  const agentResult = newAgent ? validateAddressField(newAgent, "Agent address") : { ok: false };
  const ownerResult = newOwner ? validateAddressField(newOwner, "New owner") : { ok: false };

  const ask = (c: NonNullable<typeof confirm>) => setConfirm(c);
  const runConfirmed = () => {
    confirm?.run();
    setConfirm(null);
  };

  /* ---------------------------------------------------------------------- */

  return (
    <>
      {/* ===================== Funding ===================== */}
      <Panel>
        <PanelHeader
          title="Funding"
          description="Deposits are open to anyone. Withdrawals are owner-only and are frozen once the switch fires."
        />
        <PanelBody className="flex flex-col gap-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="label">Vault balance</span>
            <span
              className="tnum text-[20px] font-medium text-text"
              title={`${formatAmountExact(view.balance)} BOT`}
            >
              {formatAmount(view.balance)} <span className="text-[13px] text-text-faint">BOT</span>
            </span>
          </div>

          {/* Deposit: permissionless, so shown to everyone. */}
          {capabilities.canDeposit && (
            <Field
              label="Deposit BOT"
              result={depositResult}
              hint={
                walletBalance !== undefined
                  ? `Your wallet holds ${formatAmount(walletBalance)} BOT. Uses deposit() rather than a bare transfer, because a factory vault is a proxy and a 2300-gas stipend transfer would fail.`
                  : undefined
              }
            >
              {(a11y) => (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    {...a11y}
                    mono
                    inputMode="decimal"
                    value={depositValue}
                    onChange={(e) => setDepositValue(e.target.value)}
                    placeholder="0.0"
                    className="flex-1"
                    invalid={depositResult.ok === false}
                    suffix={<InputUnit>BOT</InputUnit>}
                  />
                  <Button
                    variant="secondary"
                    icon={<ArrowLineDown size={14} aria-hidden />}
                    disabled={!depositResult.ok || (depositResult.wei ?? 0n) === 0n}
                    onClick={() => {
                      actions.deposit(depositResult.wei!);
                      setDepositValue("");
                    }}
                  >
                    Deposit
                  </Button>
                </div>
              )}
            </Field>
          )}

          {/* Withdraw: owner, not triggered. */}
          {capabilities.canWithdraw ? (
            <Field
              label="Withdraw to owner"
              result={withdrawValue ? withdrawResult : undefined}
              hint="Moves BOT out of the vault without firing the switch. The countdown is unaffected."
              aside={
                view.balance > 0n && (
                  <button
                    type="button"
                    onClick={() => setWithdrawValue(formatAmountExact(view.balance))}
                    className="cursor-pointer text-[12px] text-signal underline decoration-signal/30 underline-offset-2 hover:decoration-signal"
                  >
                    Max
                  </button>
                )
              }
            >
              {(a11y) => (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    {...a11y}
                    mono
                    inputMode="decimal"
                    value={withdrawValue}
                    onChange={(e) => setWithdrawValue(e.target.value)}
                    placeholder="0.0"
                    className="flex-1"
                    invalid={Boolean(withdrawValue) && withdrawResult.ok === false}
                    suffix={<InputUnit>BOT</InputUnit>}
                  />
                  <Button
                    variant="danger"
                    icon={<ArrowLineUp size={14} aria-hidden />}
                    disabled={!withdrawResult.ok || view.balance === 0n}
                    onClick={() =>
                      ask({
                        title: "Withdraw from the vault",
                        label: "Withdraw",
                        consequence: (
                          <>
                            <span className="tnum text-text">
                              {formatAmount(withdrawResult.wei)} BOT
                            </span>{" "}
                            will be sent to you, the owner. The vault will hold{" "}
                            <span className="tnum text-text">
                              {formatAmount(view.balance - (withdrawResult.wei ?? 0n))} BOT
                            </span>{" "}
                            afterwards, and the switch stays armed on whatever remains.
                          </>
                        ),
                        run: () => {
                          actions.withdraw(withdrawResult.wei!);
                          setWithdrawValue("");
                        },
                      })
                    }
                  >
                    Withdraw
                  </Button>
                </div>
              )}
            </Field>
          ) : capabilities.isOwner && view.isTriggered ? (
            <Notice tone="danger" title="Withdrawals frozen">
              The switch has fired, so <code className="font-mono text-[12px]">whenNotTriggered</code>{" "}
              blocks owner withdrawals. Re-arm the vault to restore normal operation.
            </Notice>
          ) : null}

          {capabilities.canWithdraw && view.balance > 0n && (
            <Button
              variant="danger"
              size="sm"
              className="self-start"
              onClick={() =>
                ask({
                  title: "Drain the entire vault",
                  label: "Withdraw everything",
                  consequence: (
                    <>
                      All <span className="tnum text-text">{formatAmount(view.balance)} BOT</span>{" "}
                      will be sent to you. The vault will be empty but still armed; tracked ERC-20s
                      are not affected and must be withdrawn separately.
                    </>
                  ),
                  run: actions.withdrawAll,
                })
              }
            >
              Withdraw everything
            </Button>
          )}
        </PanelBody>
      </Panel>

      {/* ===================== Configuration ===================== */}
      {capabilities.isOwner && (
        <Panel>
          <PanelHeader
            title="Configuration"
            description={
              capabilities.canConfigure
                ? "Changes take effect immediately. All three are owner-only and blocked once the switch fires."
                : undefined
            }
          />
          <PanelBody className="flex flex-col gap-6">
            {!capabilities.canConfigure && view.isTriggered && (
              <Notice tone="danger" title="Configuration frozen">
                The switch has fired. Re-arm the vault before changing its settings.
              </Notice>
            )}

            {capabilities.canConfigure && (
              <>
                {/* --- Timeout --- */}
                <div>
                  <h3 className="text-[13px] font-medium text-text">Timeout period</h3>
                  <p className="mt-1 text-[12px] leading-relaxed text-text-dim">
                    Currently {describeTimeout(view.timeoutPeriod)}. Recommended agent ping interval
                    is{" "}
                    <span className="tnum text-text">
                      {formatDuration(view.timeoutPeriod / PROTOCOL.RECOMMENDED_PING_DIVISOR)}
                    </span>
                    .
                  </p>
                  <SegmentedGroup
                    label="New timeout"
                    value={timeoutPreset}
                    onChange={setTimeoutPreset}
                    className="mt-4"
                    options={TIMEOUT_PRESETS.map((p) => ({
                      value: String(p.seconds),
                      label: p.label,
                      note: p.note,
                    }))}
                  />
                  {timeoutChanged && timeoutResult.ok && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-4"
                      icon={<Gear size={13} aria-hidden />}
                      onClick={() =>
                        ask({
                          title: "Change the timeout period",
                          label: "Update timeout",
                          consequence: (
                            <>
                              The grace window becomes{" "}
                              <span className="text-text">{describeTimeout(timeoutSeconds)}</span>,
                              measured from the last heartbeat. Your agent's ping interval should be
                              at most{" "}
                              <span className="tnum text-text">
                                {formatDuration(timeoutSeconds / PROTOCOL.RECOMMENDED_PING_DIVISOR)}
                              </span>
                              {timeoutSeconds < view.timeoutPeriod && (
                                <>
                                  {" "}
                                  , which is <span className="text-warn">shorter</span> than the
                                  current setting, so the switch may become executable sooner than
                                  you expect
                                </>
                              )}
                              .
                            </>
                          ),
                          run: () => actions.updateTimeout(timeoutSeconds),
                        })
                      }
                    >
                      Update to {describeTimeout(timeoutSeconds)}
                    </Button>
                  )}
                  {timeoutChanged && !timeoutResult.ok && (
                    <p className="mt-3 text-[12px] text-danger">{timeoutResult.error}</p>
                  )}
                </div>

                {/* --- Recovery address --- */}
                <Disclosure summary="Change the recovery address">
                  <Field
                    label="New recovery address"
                    result={
                      recoveryIsAgent
                        ? {
                            ok: false,
                            error:
                              "Cannot equal the agent address. The contract rejects this so the hot key can never be the rescue destination.",
                          }
                        : newRecovery
                          ? recoveryResult
                          : undefined
                    }
                    hint={`Currently ${view.recovery}. This is where everything goes if the switch fires.`}
                  >
                    {(a11y) => (
                      <div className="flex flex-col gap-2">
                        <Input
                          {...a11y}
                          mono
                          value={newRecovery}
                          onChange={(e) => setNewRecovery(e.target.value)}
                          placeholder="0x…"
                          spellCheck={false}
                          invalid={Boolean(newRecovery) && (!recoveryResult.ok || recoveryIsAgent)}
                        />
                        <Button
                          variant="danger"
                          size="sm"
                          className="self-start"
                          disabled={!recoveryResult.ok || recoveryIsAgent}
                          onClick={() =>
                            ask({
                              title: "Change the recovery address",
                              label: "Update recovery",
                              consequence: (
                                <>
                                  If the switch fires, the entire treasury goes to{" "}
                                  <span className="tnum break-all text-text">{newRecovery}</span>{" "}
                                  instead of the current address. Verify it character by character:
                                  a mistake here is unrecoverable.
                                </>
                              ),
                              run: () => {
                                actions.updateRecovery(normalizeAddress(newRecovery)!);
                                setNewRecovery("");
                              },
                            })
                          }
                        >
                          Update recovery address
                        </Button>
                      </div>
                    )}
                  </Field>
                </Disclosure>

                {/* --- Agent rotation --- */}
                <Disclosure summary="Rotate the agent key">
                  <Field
                    label="New agent address"
                    result={newAgent ? agentResult : undefined}
                    hint={`Currently ${view.agent}. Rotating also resets the countdown, so a rotation cannot strand you mid-window.`}
                  >
                    {(a11y) => (
                      <div className="flex flex-col gap-2">
                        <Input
                          {...a11y}
                          mono
                          value={newAgent}
                          onChange={(e) => setNewAgent(e.target.value)}
                          placeholder="0x…"
                          spellCheck={false}
                          invalid={Boolean(newAgent) && !agentResult.ok}
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          className="self-start"
                          disabled={!agentResult.ok}
                          onClick={() =>
                            ask({
                              title: "Rotate the agent key",
                              label: "Rotate key",
                              consequence: (
                                <>
                                  Only{" "}
                                  <span className="tnum break-all text-text">{newAgent}</span> will
                                  be able to send heartbeats. The current agent key stops working
                                  immediately; make sure the new key is deployed and running, or the
                                  countdown will run out.
                                </>
                              ),
                              run: () => {
                                actions.updateAgent(normalizeAddress(newAgent)!);
                                setNewAgent("");
                              },
                            })
                          }
                        >
                          Rotate agent key
                        </Button>
                      </div>
                    )}
                  </Field>
                </Disclosure>
              </>
            )}

            {/* --- Ownership transfer: allowed even post-trigger --- */}
            <Disclosure summary="Transfer ownership">
              <Field
                label="New owner address"
                result={newOwner ? ownerResult : undefined}
                hint="The new owner gains full control: withdrawals, configuration and re-arming. You lose all of it."
              >
                {(a11y) => (
                  <div className="flex flex-col gap-2">
                    <Input
                      {...a11y}
                      mono
                      value={newOwner}
                      onChange={(e) => setNewOwner(e.target.value)}
                      placeholder="0x…"
                      spellCheck={false}
                      invalid={Boolean(newOwner) && !ownerResult.ok}
                    />
                    <Button
                      variant="danger"
                      size="sm"
                      className="self-start"
                      disabled={!ownerResult.ok}
                      onClick={() =>
                        ask({
                          title: "Transfer ownership",
                          label: "Transfer ownership",
                          consequence: (
                            <>
                              <span className="tnum break-all text-text">{newOwner}</span> becomes
                              the owner of this vault and can withdraw the balance at will. You will
                              no longer be able to withdraw, reconfigure or re-arm it. This cannot be
                              undone from your side.
                            </>
                          ),
                          run: () => {
                            actions.transferOwnership(normalizeAddress(newOwner)!);
                            setNewOwner("");
                          },
                        })
                      }
                    >
                      Transfer ownership
                    </Button>
                  </div>
                )}
              </Field>
            </Disclosure>

            {/* --- Re-arm: owner, post-trigger only --- */}
            {capabilities.canRearm && (
              <div className="border-t border-line pt-5">
                <h3 className="text-[13px] font-medium text-text">Return to service</h3>
                <p className="mt-1 max-w-[62ch] text-[12px] leading-relaxed text-text-dim">
                  Funds have already left for the recovery address. Re-arming only clears the frozen
                  flag and restarts the clock, so the vault can be reused with a fresh agent instead
                  of creating a new one.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-4"
                  icon={<ShieldCheck size={13} aria-hidden />}
                  onClick={() =>
                    ask({
                      title: "Re-arm this vault",
                      label: "Re-arm",
                      consequence: (
                        <>
                          The vault returns to normal operation and the countdown restarts from now,
                          giving {describeTimeout(view.timeoutPeriod)} of grace. It does{" "}
                          <span className="text-text">not</span> bring back the evacuated funds.
                          Confirm your agent is healthy first.
                        </>
                      ),
                      run: actions.rearm,
                    })
                  }
                >
                  Re-arm vault
                </Button>
              </div>
            )}
          </PanelBody>
        </Panel>
      )}

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirmed}
        title={confirm?.title ?? ""}
        consequence={confirm?.consequence}
        confirmLabel={confirm?.label ?? "Confirm"}
      />
    </>
  );
}
