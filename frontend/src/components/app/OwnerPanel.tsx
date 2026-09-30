import { useState } from "react";
import { ArrowLineDown, ArrowLineUp, Gear, Lock } from "@phosphor-icons/react";
import { PROTOCOL, TIMEOUT_PRESETS } from "@/config/contracts";
import { describeTimeout, formatAmount, formatAmountExact, formatDuration } from "@/lib/format";
import {
  normalizeAddress,
  validateAddressField,
  validateAmount,
  validateTimeout,
  type FieldResult,
} from "@/lib/validation";
import type { VaultActions } from "@/hooks/useVaultActions";
import type { VaultCapabilities, VaultView } from "@/lib/vaultState";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Disclosure, Field, Input, InputUnit, SegmentedGroup } from "@/components/ui/Field";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";

/**
 * Owner controls.
 *
 * Grouped by consequence rather than by contract section:
 *   funding       deposit (anyone) and withdrawal (owner)
 *   configuration timeout, recovery, agent rotation, ownership
 *
 * Every fund-moving or authority-transferring action goes through a
 * confirmation step that states the consequence in plain language BEFORE
 * anything reaches the wallet.
 *
 * Once the switch has fired, the "frozen" state is stated once, quietly, per
 * panel. The loud version, with the re-arm action, lives in the heartbeat panel
 * at the top of the page; repeating it as a red box in every panel turned one
 * fact into four alarms.
 */

/** A full address has been typed or pasted: reveal its error without a blur. */
const complete = (v: string) => v.trim().length >= 42;

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
  const [customSeconds, setCustomSeconds] = useState("");
  const [newRecovery, setNewRecovery] = useState("");
  const [newAgent, setNewAgent] = useState("");
  const [newOwner, setNewOwner] = useState("");

  const [confirm, setConfirm] = useState<null | {
    title: string;
    consequence: React.ReactNode;
    label: string;
    tone?: "danger" | "primary";
    run: () => void;
  }>(null);

  const depositResult = validateAmount(depositValue, { max: walletBalance, label: "Deposit" });
  const withdrawResult = validateAmount(withdrawValue, {
    max: view.balance,
    required: true,
    label: "Withdrawal",
  });
  // Withdrawing exactly the balance goes through withdrawAllByOwner(), which
  // reads the balance at execution time. A fixed amount would revert if a
  // deposit or a gas refund changed the balance between click and mining.
  const withdrawsEverything =
    withdrawResult.ok && withdrawResult.wei !== undefined && withdrawResult.wei === view.balance;

  const timeoutSeconds = BigInt((customSeconds || timeoutPreset) || "0");
  const timeoutResult = validateTimeout(timeoutSeconds);
  const timeoutChanged = timeoutSeconds !== view.timeoutPeriod;
  const isPreset = TIMEOUT_PRESETS.some((p) => p.seconds === view.timeoutPeriod);

  const recoveryIsAgent = normalizeAddress(newRecovery)?.toLowerCase() === view.agent.toLowerCase();
  const recoveryResult: FieldResult | undefined = !newRecovery
    ? undefined
    : recoveryIsAgent
      ? {
          ok: false,
          error:
            "This is the agent address. The contract refuses it, so the hot key can never be the rescue destination.",
        }
      : validateAddressField(newRecovery, "Recovery address");
  const agentResult = newAgent ? validateAddressField(newAgent, "Agent address") : undefined;
  const ownerResult = newOwner ? validateAddressField(newOwner, "New owner") : undefined;

  const ask = (c: NonNullable<typeof confirm>) => setConfirm(c);
  const runConfirmed = () => {
    confirm?.run();
    setConfirm(null);
  };

  const frozen = capabilities.isOwner && view.isTriggered;

  /* ---------------------------------------------------------------------- */

  return (
    <>
      {/* ===================== Funding ===================== */}
      <Panel id="funding">
        <PanelHeader
          title="Funding"
          description={
            capabilities.isOwner
              ? "Anyone can deposit. Only you can withdraw, and only while the switch has not fired."
              : "Anyone can add BOT to this vault. Only its owner can take it out."
          }
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
              revealErrors={Boolean(depositValue)}
              hint={
                view.isTriggered ? (
                  <span className="text-warn">
                    The switch has fired: anything deposited now can be swept to the recovery address
                    by anyone.
                  </span>
                ) : walletBalance !== undefined ? (
                  `Your wallet holds ${formatAmount(walletBalance)} BOT.`
                ) : undefined
              }
              aside={
                walletBalance !== undefined && walletBalance > 0n ? (
                  <button
                    type="button"
                    onClick={() => setDepositValue(formatAmountExact(walletBalance))}
                    className="min-h-[28px] cursor-pointer text-[12px] text-text-dim underline decoration-line-strong underline-offset-2 hover:text-text"
                    title="Fills your whole balance. Leave some BOT for gas."
                  >
                    Wallet max
                  </button>
                ) : undefined
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
                    suffix={<InputUnit>BOT</InputUnit>}
                  />
                  <Button
                    variant="secondary"
                    icon={<ArrowLineDown size={14} aria-hidden />}
                    disabled={!depositResult.ok || (depositResult.wei ?? 0n) === 0n}
                    loading={actions.tx.isBusy}
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
          {capabilities.canWithdraw && (
            <Field
              label="Withdraw to your wallet"
              result={withdrawValue ? withdrawResult : undefined}
              revealErrors={Boolean(withdrawValue)}
              hint={
                withdrawsEverything
                  ? "Empties the vault. It stays armed, so a later deposit is protected again."
                  : "The countdown is unaffected, and the switch stays armed on whatever remains."
              }
              aside={
                view.balance > 0n && (
                  <button
                    type="button"
                    onClick={() => setWithdrawValue(formatAmountExact(view.balance))}
                    className="min-h-[28px] cursor-pointer text-[12px] text-signal underline decoration-signal/30 underline-offset-2 hover:decoration-signal"
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
                    placeholder={view.balance > 0n ? "0.0" : "Vault is empty"}
                    disabled={view.balance === 0n}
                    className="flex-1"
                    suffix={<InputUnit>BOT</InputUnit>}
                  />
                  <Button
                    variant="danger"
                    icon={<ArrowLineUp size={14} aria-hidden />}
                    disabled={!withdrawResult.ok || view.balance === 0n}
                    loading={actions.tx.isBusy}
                    onClick={() =>
                      ask({
                        title: withdrawsEverything ? "Withdraw the whole balance" : "Withdraw from the vault",
                        label: withdrawsEverything ? "Withdraw everything" : "Withdraw",
                        consequence: withdrawsEverything ? (
                          <>
                            All <span className="tnum text-text">{formatAmount(view.balance)} BOT</span>{" "}
                            will be sent to you. The vault will be empty but still armed. Tracked
                            ERC-20s are not affected and are withdrawn separately.
                          </>
                        ) : (
                          <>
                            <span className="tnum text-text">
                              {formatAmount(withdrawResult.wei)} BOT
                            </span>{" "}
                            will be sent to you. The vault keeps{" "}
                            <span className="tnum text-text">
                              {formatAmount(view.balance - (withdrawResult.wei ?? 0n))} BOT
                            </span>
                            , still protected by the switch.
                          </>
                        ),
                        run: () => {
                          if (withdrawsEverything) actions.withdrawAll();
                          else actions.withdraw(withdrawResult.wei!);
                          setWithdrawValue("");
                        },
                      })
                    }
                  >
                    {withdrawsEverything ? "Withdraw all" : "Withdraw"}
                  </Button>
                </div>
              )}
            </Field>
          )}

          {frozen && <FrozenLine>Withdrawals are locked until you re-arm the vault.</FrozenLine>}
        </PanelBody>
      </Panel>

      {/* ===================== Configuration ===================== */}
      {capabilities.isOwner && (
        <Panel>
          <PanelHeader
            title="Configuration"
            description={
              capabilities.canConfigure
                ? "Changes take effect as soon as the transaction confirms."
                : undefined
            }
          />
          <PanelBody className="flex flex-col gap-5">
            {frozen && (
              <FrozenLine>
                Timeout, recovery and agent settings are locked until you re-arm. Ownership can
                still be transferred.
              </FrozenLine>
            )}

            {capabilities.canConfigure && (
              <>
                {/* --- Timeout --- */}
                <div>
                  <h3 className="text-[13px] font-medium text-text">Timeout period</h3>
                  <p className="mt-1 text-[12px] leading-relaxed text-text-dim">
                    Currently <span className="text-text">{describeTimeout(view.timeoutPeriod)}</span>
                    . Your agent should check in at least every{" "}
                    <span className="tnum text-text">
                      {formatDuration(view.timeoutPeriod / PROTOCOL.RECOMMENDED_PING_DIVISOR)}
                    </span>
                    .
                  </p>
                  <SegmentedGroup
                    label="New timeout"
                    value={customSeconds ? "" : timeoutPreset}
                    onChange={(v) => {
                      setTimeoutPreset(v);
                      setCustomSeconds("");
                    }}
                    className="mt-4"
                    options={TIMEOUT_PRESETS.map((p) => ({
                      value: String(p.seconds),
                      label: p.label,
                      note: p.seconds === view.timeoutPeriod ? "Current setting" : p.note,
                    }))}
                  />

                  {/* Presets cannot express every value the contract accepts; a
                      vault created with 90s had no way back to 90s here. */}
                  <Disclosure
                    summary={
                      isPreset
                        ? "Set an exact number of seconds"
                        : `Set an exact number of seconds (currently ${view.timeoutPeriod.toString()}s)`
                    }
                    className="mt-3"
                  >
                    <Field
                      label="Timeout in seconds"
                      result={customSeconds ? timeoutResult : undefined}
                      revealErrors={Boolean(customSeconds)}
                      hint={`Between ${PROTOCOL.MIN_TIMEOUT_SECONDS} seconds and 365 days (${PROTOCOL.MAX_TIMEOUT_SECONDS} seconds).`}
                    >
                      {(a11y) => (
                        <Input
                          {...a11y}
                          mono
                          inputMode="numeric"
                          value={customSeconds}
                          onChange={(e) => setCustomSeconds(e.target.value.replace(/[^\d]/g, ""))}
                          placeholder={view.timeoutPeriod.toString()}
                          suffix={<InputUnit>sec</InputUnit>}
                        />
                      )}
                    </Field>
                  </Disclosure>

                  {timeoutChanged && timeoutResult.ok && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-4"
                      icon={<Gear size={13} aria-hidden />}
                      loading={actions.tx.isBusy}
                      onClick={() =>
                        ask({
                          title: "Change the timeout period",
                          label: "Update timeout",
                          tone: timeoutSeconds < view.timeoutPeriod ? "danger" : "primary",
                          consequence: (
                            <>
                              The grace window becomes{" "}
                              <span className="text-text">{describeTimeout(timeoutSeconds)}</span>,
                              measured from the last heartbeat. Make sure your agent checks in at
                              least every{" "}
                              <span className="tnum text-text">
                                {formatDuration(timeoutSeconds / PROTOCOL.RECOMMENDED_PING_DIVISOR)}
                              </span>
                              .
                              {timeoutSeconds < view.timeoutPeriod && (
                                <span className="mt-2 block text-warn">
                                  This is shorter than now, so the switch can become executable
                                  sooner than your agent expects.
                                </span>
                              )}
                            </>
                          ),
                          run: () => {
                            actions.updateTimeout(timeoutSeconds);
                            setCustomSeconds("");
                          },
                        })
                      }
                    >
                      Update to {describeTimeout(timeoutSeconds)}
                    </Button>
                  )}
                </div>

                {/* --- Recovery address --- */}
                <Disclosure summary="Change the recovery address">
                  <Field
                    label="New recovery address"
                    result={recoveryResult}
                    revealErrors={complete(newRecovery)}
                    hint={
                      <>
                        Currently <span className="tnum break-all text-text-dim">{view.recovery}</span>.
                        Everything goes here if the switch fires.
                      </>
                    }
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
                          autoComplete="off"
                        />
                        <Button
                          variant="danger"
                          size="sm"
                          className="self-start"
                          disabled={!recoveryResult?.ok}
                          loading={actions.tx.isBusy}
                          onClick={() =>
                            ask({
                              title: "Change the recovery address",
                              label: "Update recovery",
                              consequence: (
                                <>
                                  If the switch fires, the entire treasury goes to{" "}
                                  <span className="tnum break-all text-text">{newRecovery.trim()}</span>{" "}
                                  instead of the current address. Check it character by character: a
                                  mistake here cannot be undone after a rescue.
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
                    result={agentResult}
                    revealErrors={complete(newAgent)}
                    hint={
                      <>
                        Currently <span className="tnum break-all text-text-dim">{view.agent}</span>.
                        Rotating also resets the countdown to full.
                      </>
                    }
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
                          autoComplete="off"
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          className="self-start"
                          disabled={!agentResult?.ok}
                          loading={actions.tx.isBusy}
                          onClick={() =>
                            ask({
                              title: "Rotate the agent key",
                              label: "Rotate key",
                              tone: "primary",
                              consequence: (
                                <>
                                  Only <span className="tnum break-all text-text">{newAgent.trim()}</span>{" "}
                                  will be able to send heartbeats. The current key stops working
                                  immediately, so make sure the new one is already running in your
                                  agent, or the countdown will run out.
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
                result={ownerResult}
                revealErrors={complete(newOwner)}
                hint="The new owner gets full control: withdrawals, configuration and re-arming. You keep none of it. A multisig is a good choice here."
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
                      autoComplete="off"
                    />
                    <Button
                      variant="danger"
                      size="sm"
                      className="self-start"
                      disabled={!ownerResult?.ok}
                      loading={actions.tx.isBusy}
                      onClick={() =>
                        ask({
                          title: "Transfer ownership",
                          label: "Transfer ownership",
                          consequence: (
                            <>
                              <span className="tnum break-all text-text">{newOwner.trim()}</span>{" "}
                              becomes the owner of this vault and can withdraw the balance at will.
                              You will no longer be able to withdraw, reconfigure or re-arm it. This
                              cannot be undone from your side.
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
        tone={confirm?.tone ?? "danger"}
      />
    </>
  );
}

/** Quiet, single-line statement that a control group is locked. */
function FrozenLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded border border-line bg-ink-800 px-3 py-2.5 text-[12px] leading-relaxed text-text-dim">
      <Lock size={13} className="mt-0.5 shrink-0 text-text-faint" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
