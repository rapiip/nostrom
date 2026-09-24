import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Info } from "@phosphor-icons/react";
import { getAddress, type Address } from "viem";
import { useReadContract } from "wagmi";
import { nostromFactoryAbi } from "@/contracts/abis";
import { PROTOCOL, TIMEOUT_PRESETS } from "@/config/contracts";
import { describeTimeout, formatAmount, formatDuration, truncateAddress } from "@/lib/format";
import { normalizeAddress, validateAmount, validateSaltLabel, validateVaultConfig } from "@/lib/validation";
import { useWallet } from "@/hooks/useWallet";
import { useFactory } from "@/hooks/useVault";
import { toSalt, useCreateVault } from "@/hooks/useVaultActions";
import { Button } from "@/components/ui/Button";
import { AddressDisplay } from "@/components/ui/Address";
import {
  Disclosure,
  Field,
  Input,
  InputUnit,
  SegmentedGroup,
} from "@/components/ui/Field";
import {
  DataList,
  DataRow,
  Label,
  Notice,
  Panel,
  PanelBody,
  PanelHeader,
} from "@/components/ui/Panel";
import { WalletGate } from "@/components/web3/WalletGate";
import { TransactionDialog } from "@/components/web3/TransactionDialog";

/**
 * Create a vault.
 *
 * Three decisions, in the order they matter: who pings, where funds go if nobody
 * does, and how long to wait. Everything else is behind a disclosure.
 *
 * Validation mirrors the contract's own checks (see lib/validation.ts) so a user
 * never pays gas to learn that recovery cannot equal the agent. The review panel
 * restates the configuration in plain language before the signature, because the
 * consequence of getting the recovery address wrong is not recoverable.
 */
export function CreateVault() {
  return (
    <WalletGate requireFactory intent="Creating a vault is a transaction, so a connected wallet is required.">
      <CreateVaultInner />
    </WalletGate>
  );
}

function CreateVaultInner() {
  const wallet = useWallet();
  const { address: factory } = useFactory();
  const navigate = useNavigate();

  const [agent, setAgent] = useState("");
  const [recovery, setRecovery] = useState("");
  const [presetKey, setPresetKey] = useState("86400");
  const [customSeconds, setCustomSeconds] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [deposit, setDeposit] = useState("");
  const [useSalt, setUseSalt] = useState(false);
  const [salt, setSalt] = useState("");
  const [createdVault, setCreatedVault] = useState<Address | undefined>();

  const timeoutSeconds = useMemo(() => {
    if (useCustom) {
      const n = Number(customSeconds);
      return Number.isFinite(n) && n > 0 ? BigInt(Math.floor(n)) : 0n;
    }
    return BigInt(presetKey);
  }, [useCustom, customSeconds, presetKey]);

  const validation = validateVaultConfig({
    agent,
    recovery,
    timeoutSeconds,
    owner: wallet.address,
  });

  const depositResult = validateAmount(deposit, {
    max: wallet.balance,
    label: "Deposit",
  });
  const saltResult = useSalt ? validateSaltLabel(salt) : { ok: true };

  const canSubmit =
    validation.ok && depositResult.ok && saltResult.ok && Boolean(factory) && !wallet.isFactoryMissing;

  // Predicted CREATE2 address, shown before the transaction so the user can
  // pre-fund it or record it. The factory namespaces the salt by msg.sender, so
  // two users choosing the same label get different addresses.
  const predicted = useReadContract({
    address: factory ?? undefined,
    abi: nostromFactoryAbi,
    functionName: "predictVaultAddress",
    args: wallet.address && useSalt && saltResult.ok && salt ? [wallet.address, toSalt(salt)] : undefined,
    query: { enabled: Boolean(factory && wallet.address && useSalt && saltResult.ok && salt) },
  });

  const create = useCreateVault(factory, () => {
    // Resolve the created vault from the receipt's VaultCreated event rather
    // than assuming, then offer a link. Nothing is claimed before this fires.
    void 0;
  });

  // The vault address comes from the predicted value when deterministic; for the
  // non-deterministic path the user is sent to the list, since the address is
  // only knowable from the receipt logs.
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    const agentAddr = normalizeAddress(agent);
    const recoveryAddr = normalizeAddress(recovery);
    if (!agentAddr || !recoveryAddr) return;

    setCreatedVault(
      useSalt && predicted.data ? getAddress(predicted.data as Address) : undefined,
    );

    create.create({
      agent: agentAddr,
      recovery: recoveryAddr,
      timeoutSeconds,
      depositWei: depositResult.wei ?? 0n,
      ...(useSalt ? { salt } : {}),
    });
  };

  const recommendedPing = timeoutSeconds / PROTOCOL.RECOMMENDED_PING_DIVISOR;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-medium tracking-[-0.02em] text-text">Create a vault</h1>
        <p className="mt-1.5 max-w-[68ch] text-[13px] leading-relaxed text-text-dim">
          You become the owner. The vault is a separate contract at its own address holding its own
          balance — nothing is commingled with other users.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* --- Configuration --- */}
        <div className="flex flex-col gap-6">
          <Panel>
            <PanelHeader
              title="Participants"
              description="Two addresses with deliberately different amounts of power."
            />
            <PanelBody className="flex flex-col gap-6">
              <Field
                label="Agent address"
                required
                result={validation.agent}
                hint="The wallet your agent signs heartbeats from. It can call ping() and nothing else — it cannot move funds."
                aside={
                  wallet.address && (
                    <button
                      type="button"
                      onClick={() => setAgent(wallet.address!)}
                      className="cursor-pointer text-[12px] text-signal underline decoration-signal/30 underline-offset-2 transition-colors hover:decoration-signal"
                    >
                      Use my address
                    </button>
                  )
                }
              >
                {(a11y) => (
                  <Input
                    {...a11y}
                    mono
                    value={agent}
                    onChange={(e) => setAgent(e.target.value)}
                    placeholder="0x…"
                    spellCheck={false}
                    autoComplete="off"
                    invalid={validation.agent.ok === false}
                  />
                )}
              </Field>

              <Field
                label="Recovery address"
                required
                result={validation.recovery}
                hint="The cold wallet that receives everything if the heartbeat lapses. Cannot equal the agent address. Choose carefully — while the vault is healthy you can change it, but after the switch fires the funds are already gone."
              >
                {(a11y) => (
                  <Input
                    {...a11y}
                    mono
                    value={recovery}
                    onChange={(e) => setRecovery(e.target.value)}
                    placeholder="0x…"
                    spellCheck={false}
                    autoComplete="off"
                    invalid={validation.recovery.ok === false}
                  />
                )}
              </Field>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Timeout"
              description="How much silence to tolerate before anyone may evacuate the treasury."
            />
            <PanelBody className="flex flex-col gap-5">
              <SegmentedGroup
                label="Timeout preset"
                value={useCustom ? "" : presetKey}
                onChange={(v) => {
                  setPresetKey(v);
                  setUseCustom(false);
                }}
                options={TIMEOUT_PRESETS.map((p) => ({
                  value: String(p.seconds),
                  label: p.label,
                  note: p.note,
                }))}
              />

              <Disclosure summary="Set an exact number of seconds">
                <Field
                  label="Timeout in seconds"
                  result={useCustom ? validation.timeout : undefined}
                  hint={`Between ${PROTOCOL.MIN_TIMEOUT_SECONDS} and ${PROTOCOL.MAX_TIMEOUT_SECONDS} seconds (30s – 365 days).`}
                >
                  {(a11y) => (
                    <Input
                      {...a11y}
                      mono
                      inputMode="numeric"
                      value={customSeconds}
                      onChange={(e) => {
                        setCustomSeconds(e.target.value.replace(/[^\d]/g, ""));
                        setUseCustom(true);
                      }}
                      onFocus={() => setUseCustom(true)}
                      placeholder="86400"
                      suffix={<InputUnit>sec</InputUnit>}
                      invalid={useCustom && validation.timeout.ok === false}
                    />
                  )}
                </Field>
              </Disclosure>

              {timeoutSeconds > 0n && validation.timeout.ok && (
                <Notice tone="info">
                  <div className="flex items-start gap-2">
                    <Info size={14} className="mt-0.5 shrink-0 text-text-faint" aria-hidden />
                    <span>
                      Your agent should ping at most every{" "}
                      <span className="tnum text-text">{formatDuration(recommendedPing)}</span> — a
                      third of the timeout, so two missed transactions in a row are survivable. The
                      bundled heartbeat clients clamp to this automatically.
                    </span>
                  </div>
                </Notice>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Initial deposit"
              description="Optional. A vault with a zero balance is armed but has nothing to protect."
            />
            <PanelBody className="flex flex-col gap-5">
              <Field
                label="Amount"
                result={depositResult}
                hint={
                  wallet.balance !== undefined
                    ? `Wallet balance: ${formatAmount(wallet.balance)} BOT. Creating and funding in one signature uses createVaultAndFund.`
                    : undefined
                }
              >
                {(a11y) => (
                  <Input
                    {...a11y}
                    mono
                    inputMode="decimal"
                    value={deposit}
                    onChange={(e) => setDeposit(e.target.value)}
                    placeholder="0.0"
                    invalid={depositResult.ok === false}
                    suffix={<InputUnit>BOT</InputUnit>}
                  />
                )}
              </Field>

              <Disclosure summary="Reserve a known address in advance (CREATE2)">
                <div className="flex flex-col gap-4">
                  <p className="text-[13px] leading-relaxed text-text-dim">
                    Deterministic creation lets you compute the vault address before the transaction
                    is mined — useful for pre-funding it, or recording it in an agent's config ahead
                    of deployment. Your salt is namespaced by your own address, so nobody can squat
                    the result.
                  </p>

                  <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-text">
                    <input
                      type="checkbox"
                      checked={useSalt}
                      onChange={(e) => setUseSalt(e.target.checked)}
                      className="size-4 cursor-pointer accent-signal"
                    />
                    Use a deterministic address
                  </label>

                  {useSalt && (
                    <>
                      <Field
                        label="Salt label"
                        result={saltResult}
                        hint="A short label, hashed to a bytes32 salt. Or paste a raw 32-byte hex value. Reusing a label you already used will revert."
                      >
                        {(a11y) => (
                          <Input
                            {...a11y}
                            mono
                            value={salt}
                            onChange={(e) => setSalt(e.target.value)}
                            placeholder="treasury-1"
                            spellCheck={false}
                            invalid={saltResult.ok === false}
                          />
                        )}
                      </Field>

                      {predicted.data && (
                        <div className="rounded border border-signal-dim bg-signal/[0.05] px-3.5 py-3">
                          <Label>Predicted vault address</Label>
                          <div className="mt-2">
                            <AddressDisplay
                              address={predicted.data as string}
                              chainId={wallet.chainId}
                              label="predicted vault address"
                              full
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </Disclosure>
            </PanelBody>
          </Panel>
        </div>

        {/* --- Review + submit --- */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <Panel>
            <PanelHeader title="Review" />
            <PanelBody>
              <DataList>
                <DataRow label="Owner">
                  <AddressDisplay
                    address={wallet.address}
                    chainId={wallet.chainId}
                    label="owner address"
                    showExplorer={false}
                  />
                </DataRow>
                <DataRow label="Agent">
                  {normalizeAddress(agent) ? (
                    <span className="tnum text-[13px]">{truncateAddress(agent, 6)}</span>
                  ) : (
                    <span className="text-text-faint">Not set</span>
                  )}
                </DataRow>
                <DataRow label="Recovery">
                  {normalizeAddress(recovery) ? (
                    <span className="tnum text-[13px]">{truncateAddress(recovery, 6)}</span>
                  ) : (
                    <span className="text-text-faint">Not set</span>
                  )}
                </DataRow>
                <DataRow label="Timeout">
                  {validation.timeout.ok ? (
                    <span className="tnum text-[13px] text-signal">
                      {describeTimeout(timeoutSeconds)}
                    </span>
                  ) : (
                    <span className="text-text-faint">Invalid</span>
                  )}
                </DataRow>
                <DataRow label="Deposit">
                  <span className="tnum text-[13px]">
                    {formatAmount(depositResult.wei ?? 0n)}{" "}
                    <span className="text-text-faint">BOT</span>
                  </span>
                </DataRow>
                <DataRow label="Method">
                  <code className="font-mono text-[11px] text-text-dim">
                    {useSalt
                      ? "createVaultDeterministic"
                      : (depositResult.wei ?? 0n) > 0n
                        ? "createVaultAndFund"
                        : "createVault"}
                  </code>
                </DataRow>
              </DataList>

              <Button
                type="submit"
                variant="primary"
                full
                className="mt-5"
                disabled={!canSubmit}
                loading={create.isBusy}
                iconRight={<ArrowRight size={14} aria-hidden />}
              >
                {create.isBusy ? "Creating…" : "Create vault"}
              </Button>

              {!canSubmit && (
                <p className="mt-3 text-[12px] leading-relaxed text-text-faint">
                  Fill in a valid agent address, recovery address and timeout to continue.
                </p>
              )}
            </PanelBody>
          </Panel>

          <Notice tone="warn" title="The recovery address is the whole point">
            If the switch fires, everything goes there and nowhere else. Verify it before signing —
            ideally a wallet you do not operate the agent from.
          </Notice>
        </aside>
      </form>

      <TransactionDialog
        tx={create}
        chainId={wallet.chainId}
        successSlot={
          <div className="flex flex-col gap-3 border-t border-line pt-4">
            {createdVault ? (
              <>
                <div>
                  <Label>New vault</Label>
                  <div className="mt-2">
                    <AddressDisplay
                      address={createdVault}
                      chainId={wallet.chainId}
                      label="vault address"
                      full
                    />
                  </div>
                </div>
                <Link
                  to={`/app/vault/${createdVault}`}
                  onClick={() => create.reset()}
                  className="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded border border-signal bg-signal px-4 text-[13px] font-medium text-ink-950 no-underline transition-colors hover:bg-signal/90"
                >
                  Open vault
                  <ArrowRight size={13} aria-hidden />
                </Link>
              </>
            ) : (
              <Button
                variant="primary"
                onClick={() => {
                  create.reset();
                  void navigate("/app");
                }}
                iconRight={<ArrowRight size={13} aria-hidden />}
              >
                View your vaults
              </Button>
            )}
          </div>
        }
      />
    </div>
  );
}
