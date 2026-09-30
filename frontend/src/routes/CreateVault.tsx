import { clsx } from "clsx";
import { useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check } from "@phosphor-icons/react";
import { getAddress, parseEventLogs, type Address, type Hash } from "viem";
import { usePublicClient, useReadContract } from "wagmi";
import { nostromFactoryAbi } from "@/contracts/abis";
import { PROTOCOL, TIMEOUT_PRESETS } from "@/config/contracts";
import { describeTimeout, formatAmount, formatDuration, sameAddress, truncateAddress } from "@/lib/format";
import { normalizeAddress, validateAmount, validateSaltLabel, validateVaultConfig } from "@/lib/validation";
import { rememberVault } from "@/lib/recentVaults";
import { NAME_MAX, setAddressName, useAddressName } from "@/lib/addressBook";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useWallet } from "@/hooks/useWallet";
import { useFactory } from "@/hooks/useVault";
import { toSalt, useCreateVault } from "@/hooks/useVaultActions";
import { Button, ButtonRouterLink, Spinner } from "@/components/ui/Button";
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
import { GetBotLink } from "@/components/web3/FundWallet";

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
  useDocumentTitle("Create a vault");
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
  const [resolvingVault, setResolvingVault] = useState(false);
  const [vaultName, setVaultName] = useState("");
  const [agentName, setAgentName] = useState("");
  const publicClient = usePublicClient();

  // Read at confirmation time, which may be many renders after submit.
  const namesRef = useRef({ vault: "", agent: "", agentAddress: "" });
  namesRef.current = { vault: vaultName, agent: agentName, agentAddress: agent };

  const agentSaved = useAddressName(wallet.chainId, normalizeAddress(agent) ?? undefined);
  const recoverySaved = useAddressName(wallet.chainId, normalizeAddress(recovery) ?? undefined);

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

  const formValid = validation.ok && depositResult.ok && saltResult.ok;
  const canSubmit = formValid && Boolean(factory) && !wallet.isFactoryMissing;

  // Set on the first submit attempt: from then on every field shows its error,
  // not only the ones the user has already left.
  const [attempted, setAttempted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

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

  /**
   * Resolve the new vault from the receipt's VaultCreated event.
   *
   * Only a confirmed receipt reaches this callback, so nothing is claimed
   * before the chain has said so. The event is matched on creator as well, in
   * case a future router batches several creations into one transaction.
   * The CREATE2 path already knows its address, but the log is still preferred
   * as the authority when present.
   */
  const resolveCreatedVault = async (hash: Hash) => {
    if (!publicClient) return;
    setResolvingVault(true);
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash });
      const events = parseEventLogs({
        abi: nostromFactoryAbi,
        eventName: "VaultCreated",
        logs: receipt.logs,
      });
      const mine = events.find((e) => sameAddress(e.args.creator, wallet.address)) ?? events[0];
      if (mine) {
        const vault = getAddress(mine.args.vault);
        setCreatedVault(vault);
        rememberVault(wallet.chainId, vault);
        // Names are saved only now, against the address the chain reported,
        // so a failed or reverted creation never leaves a dangling name.
        const n = namesRef.current;
        if (n.vault.trim()) setAddressName(wallet.chainId, vault, n.vault, { kind: "vault" });
        const agentAddr = normalizeAddress(n.agentAddress);
        if (n.agent.trim() && agentAddr) {
          setAddressName(wallet.chainId, agentAddr, n.agent, { kind: "account" });
        }
      }
    } catch {
      // Fall back to the predicted address (CREATE2) or the vault list.
    } finally {
      setResolvingVault(false);
    }
  };

  const create = useCreateVault(factory, (hash) => {
    void resolveCreatedVault(hash);
  });

  // The CREATE2 path knows its address up front; the standard path learns it
  // from the receipt (see resolveCreatedVault).
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      // The button stays clickable so a click always gets an answer: reveal
      // every error and move focus to the first field that needs attention,
      // rather than leaving a dead grey button and a guessing game.
      setAttempted(true);
      requestAnimationFrame(() => {
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }

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

  // Name the first thing still missing, rather than repeating the full list of
  // requirements no matter how much of the form is already complete.
  const missingHint = !normalizeAddress(agent)
    ? "Add the agent address to continue."
    : !normalizeAddress(recovery)
      ? "Add the recovery address to continue."
      : !validation.ok
        ? "Fix the highlighted field to continue."
        : !depositResult.ok
          ? "Check the deposit amount to continue."
          : !saltResult.ok
            ? "Check the salt label to continue."
            : "The factory for this network is unavailable.";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-medium tracking-[-0.02em] text-text">Create a vault</h1>
        <p className="mt-1.5 max-w-[68ch] text-[13px] leading-relaxed text-text-dim">
          Three decisions: who checks in, where the money goes if they stop, and how long to wait.
          You become the owner of a contract that holds only your funds.
        </p>
      </div>

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
      >
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
                revealErrors={attempted || agent.trim().length >= 42}
                hint={
                  agentSaved ? (
                    <>
                      This is <span className="text-text">{agentSaved.name}</span>. It can only
                      report liveness and cannot move funds.
                    </>
                  ) : (
                    "The wallet your agent signs heartbeats from. It can only report liveness and cannot move funds."
                  )
                }
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
                revealErrors={attempted || recovery.trim().length >= 42}
                hint={
                  recoverySaved ? (
                    <>
                      This is <span className="text-text">{recoverySaved.name}</span>. It receives
                      everything if the heartbeat lapses, and must differ from the agent address.
                    </>
                  ) : (
                    "The cold wallet that receives everything if the heartbeat lapses. It must differ from the agent address. You can change it later while the vault is healthy, but not after the switch has fired."
                  )
                }
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

              {/* Names: optional, local-only, saved once the vault exists. */}
              <div className="rounded border border-line bg-ink-850/60 px-3.5 py-3.5">
                <p className="text-[13px] font-medium text-text">
                  Names <span className="font-normal text-text-faint">(optional)</span>
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <NameInput
                    label="Vault name"
                    value={vaultName}
                    onChange={setVaultName}
                    placeholder="e.g. Trading treasury"
                  />
                  <NameInput
                    label="Agent name"
                    value={agentName}
                    onChange={setAgentName}
                    placeholder={agentSaved ? agentSaved.name : "e.g. Trading agent · prod"}
                    hint={agentSaved && !agentName ? `Already saved as “${agentSaved.name}”` : undefined}
                  />
                </div>
              </div>
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
                  revealErrors={attempted}
                  hint={`Between ${PROTOCOL.MIN_TIMEOUT_SECONDS} and ${PROTOCOL.MAX_TIMEOUT_SECONDS} seconds (30s to 365 days).`}
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
                  Set your agent to check in every{" "}
                  <span className="tnum text-text">{formatDuration(recommendedPing)}</span>, a third
                  of the timeout. That way two missed heartbeats in a row still do not fire the
                  switch.
                </Notice>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Initial deposit"
              description="Optional. A vault with a zero balance is armed but has nothing to protect. You can fund it at any time after creation."
            />
            <PanelBody className="flex flex-col gap-5">
              <Field
                label="Amount"
                result={depositResult}
                revealErrors={attempted}
                hint={
                  wallet.balance !== undefined ? (
                    <>
                      Wallet balance: {formatAmount(wallet.balance)} BOT. Depositing now funds the
                      vault in the same creation transaction.
                      {wallet.balance === 0n && (
                        <>
                          {" "}
                          <GetBotLink chainId={wallet.chainId} />
                        </>
                      )}
                    </>
                  ) : undefined
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
                    is mined, useful for pre-funding it, or recording it in an agent's config ahead
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
                        revealErrors={attempted}
                        hint="Any short text label (or a 32-byte hex value). It is combined with your address, so another account using the same label gets a different vault."
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
                    <span className="flex flex-col items-end">
                      {(agentName.trim() || agentSaved) && (
                        <span className="max-w-[16ch] truncate text-[13px] font-medium">
                          {agentName.trim() || agentSaved?.name}
                        </span>
                      )}
                      <span className="tnum text-[12px] text-text-dim">{truncateAddress(agent, 6)}</span>
                    </span>
                  ) : (
                    <span className="text-text-faint">Not set</span>
                  )}
                </DataRow>
                <DataRow label="Recovery">
                  {normalizeAddress(recovery) ? (
                    <span className="flex flex-col items-end">
                      {recoverySaved && (
                        <span className="max-w-[16ch] truncate text-[13px] font-medium">
                          {recoverySaved.name}
                        </span>
                      )}
                      <span className="tnum text-[12px] text-text-dim">{truncateAddress(recovery, 6)}</span>
                    </span>
                  ) : (
                    <span className="text-text-faint">Not set</span>
                  )}
                </DataRow>
                {vaultName.trim() && (
                  <DataRow label="Name">
                    <span className="max-w-[18ch] truncate text-[13px] font-medium">{vaultName.trim()}</span>
                  </DataRow>
                )}
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
                <DataRow label="Deployment">
                  <span className="text-[13px] text-text-dim">
                    {useSalt ? "Deterministic (CREATE2)" : "Standard"}
                  </span>
                </DataRow>
              </DataList>

              <Button
                type="submit"
                variant="primary"
                full
                className="mt-5"
                disabled={!factory || wallet.isFactoryMissing}
                loading={create.isBusy}
                iconRight={<ArrowRight size={14} aria-hidden />}
              >
                {create.isBusy ? "Creating…" : "Create vault"}
              </Button>

              <p
                className={clsx(
                  "mt-3 flex items-start gap-1.5 text-[12px] leading-relaxed",
                  canSubmit ? "text-text-faint" : attempted ? "text-danger" : "text-text-faint",
                )}
                aria-live="polite"
              >
                {canSubmit ? (
                  <>
                    <Check size={13} className="mt-px shrink-0 text-signal" aria-hidden />
                    Ready. Your wallet will ask you to confirm the transaction.
                  </>
                ) : (
                  missingHint
                )}
              </p>
            </PanelBody>
          </Panel>

          <Notice tone="warn" title="Double-check the recovery address">
            If the switch fires, everything in the vault goes there, and a transfer on-chain cannot
            be reversed. Use a cold wallet you control that is separate from the agent and from
            this browser wallet.
          </Notice>

          {wallet.chainId === 677 && (
            <Notice tone="info" title="You are on BOT Chain mainnet">
              Real BOT is at stake. Start with an amount you are comfortable testing with.
            </Notice>
          )}
        </aside>
      </form>

      <TransactionDialog
        tx={create}
        chainId={wallet.chainId}
        successSlot={
          <div className="flex flex-col gap-3 border-t border-line pt-4">
            {resolvingVault && !createdVault ? (
              <p className="flex items-center gap-2 text-[12px] text-text-dim" aria-live="polite">
                <Spinner className="size-3" />
                Reading the new vault address from the receipt…
              </p>
            ) : createdVault ? (
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
                <ButtonRouterLink
                  to={`/app/vault/${createdVault}`}
                  onClick={() => create.reset()}
                  variant="primary"
                  full
                  iconRight={<ArrowRight size={13} aria-hidden />}
                >
                  Open vault
                </ButtonRouterLink>
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

/** Compact optional text input for a local name. */
function NameInput({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[12px] text-text-dim">
        {label}
      </label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, NAME_MAX))}
        placeholder={placeholder}
        maxLength={NAME_MAX}
        autoComplete="off"
      />
      {hint && <p className="text-[11px] text-text-faint">{hint}</p>}
    </div>
  );
}
