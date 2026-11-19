import { clsx } from "clsx";
import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { isAddress, getAddress, type Address } from "viem";
import { ArrowLeft, MagnifyingGlass } from "@phosphor-icons/react";
import { formatAmount, formatAmountExact, formatTimestamp, sameAddress, truncateAddress } from "@/lib/format";
import { describeRole, PHASE_META } from "@/lib/vaultState";
import { shortErrorText } from "@/lib/errors";
import { rememberVault } from "@/lib/recentVaults";
import { useAddressName } from "@/lib/addressBook";
import { useVault, useIsRegisteredVault, useVaultRecord } from "@/hooks/useVault";
import { useVaultActions } from "@/hooks/useVaultActions";
import { useVaultChangeToasts } from "@/hooks/useVaultChangeToasts";
import { useDeadlineNotifications, type WatchedVault } from "@/hooks/useBrowserAlerts";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useWallet } from "@/hooks/useWallet";
import { Button, ButtonRouterLink } from "@/components/ui/Button";
import { AddressDisplay } from "@/components/ui/Address";
import { AddressNameButton } from "@/components/ui/AddressName";
import { Freshness } from "@/components/ui/Freshness";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  DataList,
  DataRow,
  EmptyState,
  Notice,
  Panel,
  PanelBody,
  PanelHeader,
  Skeleton,
} from "@/components/ui/Panel";
import { TransactionDialog } from "@/components/web3/TransactionDialog";
import { ConnectButton } from "@/components/web3/ConnectButton";
import { HeartbeatPanel } from "@/components/app/HeartbeatPanel";
import { OwnerPanel } from "@/components/app/OwnerPanel";
import { ExecutionPanel, RegistryWarning } from "@/components/app/ExecutionPanel";
import { TokenWatchlist } from "@/components/app/TokenWatchlist";
import { ActivityPanel } from "@/components/app/ActivityPanel";
import { ReminderPanel } from "@/components/app/ReminderPanel";

/**
 * Vault detail.
 *
 * Deliberately readable without a wallet: monitoring a vault is a public act, and
 * a keeper or a counterparty should be able to inspect one before connecting
 * anything. Write surfaces appear as the connected account's capabilities allow,
 * derived from the contract's own modifiers, so nothing on screen is an action
 * that is certain to revert.
 *
 * Layout puts the heartbeat first at full width (it is the answer to the only
 * urgent question), then splits into participants/configuration on the left and
 * execution on the right.
 */
export function VaultDetail() {
  const { address: raw } = useParams<{ address: string }>();
  const wallet = useWallet();

  const parsed: Address | undefined = raw && isAddress(raw) ? getAddress(raw) : undefined;

  const { view, capabilities, trackedTokens, isLoading, isError, error, isNotAVault, isFetching, updatedAt, refetch } =
    useVault(parsed);
  const { isRegistered, canVerify } = useIsRegisteredVault(parsed);
  const record = useVaultRecord(parsed);

  const actions = useVaultActions(parsed, () => refetch());
  const vaultName = useAddressName(wallet.chainId, parsed);

  // Title carries the phase so a background tab reads "Executable · Treasury"
  // (or "Executable · 0x12…" when unnamed) in the tab strip without being
  // opened.
  const tabLabel = vaultName?.name ?? (parsed ? truncateAddress(parsed, 4) : "Vault");
  useDocumentTitle(view ? `${PHASE_META[view.phase].label} · ${tabLabel}` : tabLabel);

  // Remember genuinely resolved vaults only, so a typo never lands in the list.
  const resolvedAddress = view?.address;
  useEffect(() => {
    if (resolvedAddress) rememberVault(wallet.chainId, resolvedAddress);
  }, [resolvedAddress, wallet.chainId]);

  useVaultChangeToasts(view, { suppress: actions.tx.phase !== "idle" });

  const watched = useMemo<WatchedVault[]>(
    () => (view ? [{ address: view.address, phase: view.phase, label: tabLabel }] : []),
    [view, tabLabel],
  );
  useDeadlineNotifications(watched, wallet.chainId);

  /* --- Invalid address ------------------------------------------------- */
  if (!parsed) {
    return (
      <Panel>
        <EmptyState
          icon={<MagnifyingGlass size={26} aria-hidden />}
          title="Not a valid address"
          description={
            <>
              <span className="tnum break-all">{raw}</span> is not a valid EVM address. Check for a
              truncated copy-paste or a wrong checksum.
            </>
          }
          action={
            <ButtonRouterLink to="/app/lookup" variant="primary">
              Look up a vault
            </ButtonRouterLink>
          }
        />
      </Panel>
    );
  }

  /* --- Loading --------------------------------------------------------- */
  if (isLoading) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <span className="sr-only">Loading vault state…</span>
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-56 w-full" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }

  /* --- Not a vault ----------------------------------------------------- */
  if (isNotAVault || !view || !capabilities) {
    return (
      <div className="flex flex-col gap-5">
        <BackLink />
        <Panel>
          <EmptyState
            icon={<MagnifyingGlass size={26} aria-hidden />}
            title="No Nostrom vault at this address"
            description={
              <>
                Nothing at <span className="tnum break-all">{parsed}</span> answers like a Nostrom
                vault on {wallet.chainName ?? `chain ${wallet.chainId}`}. The address may be wrong,
                or the vault may live on another network: check which one your wallet is using.
              </>
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="secondary" onClick={refetch}>
                  Retry
                </Button>
                <ButtonRouterLink to="/app/lookup">Try another address</ButtonRouterLink>
              </div>
            }
          />
        </Panel>
        {isError && (
          <Notice tone="danger" title="Read error">
            {shortErrorText(error)}
          </Notice>
        )}
      </div>
    );
  }

  /* --- Vault ----------------------------------------------------------- */
  const participants = (
    <Panel>
      <PanelHeader title="Participants" description="Three roles, with deliberately unequal power." />
      <PanelBody>
        <DataList>
          <DataRow label="Owner" hint={capabilities.isOwner ? "You · full control while healthy" : "Full control while healthy"}>
            <AddressDisplay address={view.owner} chainId={wallet.chainId} label="owner address" chars={6} nameable={{ kind: "account", role: "owner" }} />
          </DataRow>
          <DataRow label="Agent" hint={capabilities.isAgent ? "You · can only send heartbeats" : "Can only send heartbeats"}>
            <AddressDisplay address={view.agent} chainId={wallet.chainId} label="agent address" chars={6} nameable={{ kind: "account", role: "agent" }} />
          </DataRow>
          <DataRow label="Recovery" hint={capabilities.isRecovery ? "You · receives everything on failure" : "Receives everything on failure"}>
            <AddressDisplay address={view.recovery} chainId={wallet.chainId} label="recovery address" chars={6} nameable={{ kind: "account", role: "recovery" }} />
          </DataRow>
          {record.creator && !sameAddress(record.creator, view.owner) && (
            // Only worth a row when it differs: after a handover the creator
            // still indexes the vault, which explains why it shows up in (or
            // is missing from) someone's list.
            <DataRow label="Created by" hint="Indexes the vault in the registry; ownership has since moved">
              <AddressDisplay address={record.creator} chainId={wallet.chainId} label="creator address" chars={6} nameable={{ kind: "account", role: "owner" }} />
            </DataRow>
          )}
        </DataList>
      </PanelBody>
    </Panel>
  );

  const execution = (
    <ExecutionPanel view={view} capabilities={capabilities} actions={actions} chainId={wallet.chainId} />
  );

  const watchlist = (
    <TokenWatchlist
      view={view}
      capabilities={capabilities}
      actions={actions}
      trackedTokens={trackedTokens}
      chainId={wallet.chainId}
    />
  );

  const reminders = (
    <ReminderPanel
      view={view}
      label={tabLabel}
      chainName={wallet.chainName ?? `chain ${wallet.chainId}`}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <BackLink />

      {/* --- Identity header ---
          A named vault leads with its name; the address stays directly below
          it, so the name can never hide which contract this is. */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1
              className={clsx(
                "min-w-0 text-[20px] font-medium tracking-[-0.01em] break-words text-text",
                !vaultName && "tnum",
              )}
              title={vaultName?.note}
            >
              <span className="sr-only">Vault </span>
              {vaultName ? vaultName.name : truncateAddress(view.address, 6)}
            </h1>
            <StatusBadge phase={view.phase} />
            <AddressNameButton
              chainId={wallet.chainId}
              address={view.address}
              kind="vault"
              role="vault"
              label="vault"
              withText
            />
          </div>
          {vaultName?.note && (
            <p className="mt-1.5 max-w-[70ch] text-[13px] leading-relaxed text-text-dim">
              {vaultName.note}
            </p>
          )}
          {/* Full address from sm up, where it fits on one line. On a phone
              the 42 characters broke mid-hash onto a second line, which reads
              as two different values; the truncated title plus copy and
              explorer actions carry the same information there. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {/* Wrappers own the breakpoint: AddressDisplay's own inline-flex
                would otherwise win over `hidden` by stylesheet order. The name
                is already the heading, so it is not repeated here. */}
            <span className="hidden sm:block">
              <AddressDisplay
                address={view.address}
                chainId={wallet.chainId}
                label="vault address"
                full
                tone="dim"
                showName={false}
              />
            </span>
            <span className="sm:hidden">
              <AddressDisplay
                address={view.address}
                chainId={wallet.chainId}
                label="vault address"
                chars={10}
                tone="dim"
                showName={false}
              />
            </span>
          </div>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px] text-text-faint">
            <span>
              Holds{" "}
              <span className="tnum text-[13px] font-medium text-text" title={`${formatAmountExact(view.balance)} BOT`}>
                {formatAmount(view.balance)} BOT
              </span>
            </span>
            <span aria-hidden>·</span>
            <span>
              Your role: <span className="text-text-dim">{describeRole(capabilities)}</span>
            </span>
            {record.createdAt !== undefined && (
              <>
                <span aria-hidden>·</span>
                <span>created {formatTimestamp(record.createdAt)}</span>
              </>
            )}
          </p>
        </div>

        <Freshness updatedAt={updatedAt} isFetching={isFetching} onRefresh={refetch} staleAfter={45} />
      </div>

      <RegistryWarning isRegistered={isRegistered} canVerify={canVerify} />

      {wallet.status === "wrong-network" ? (
        <Notice
          tone="warn"
          title="Wrong network"
          action={
            <Button variant="secondary" size="sm" loading={wallet.isSwitching} onClick={wallet.switchToDefault}>
              Switch network
            </Button>
          }
        >
          Your wallet is on chain {wallet.chainId}, which Nostrom does not support. The state below
          was read from {wallet.chainName ?? "the app's default network"}; switch networks before
          acting on it.
        </Notice>
      ) : wallet.status !== "connected" ? (
        <Notice
          tone="info"
          title="Read-only view"
          action={wallet.status === "no-wallet" ? undefined : <ConnectButton size="sm" />}
        >
          Anyone can watch a vault, so nothing here needs a wallet. Connect one to send a
          heartbeat, manage the vault, or fire the switch.
        </Notice>
      ) : null}

      {/* --- Heartbeat, full width --- */}
      <HeartbeatPanel
        view={view}
        capabilities={capabilities}
        onPing={actions.ping}
        onRearm={capabilities.canRearm ? actions.rearm : undefined}
        isPinging={actions.tx.isBusy}
        chainId={wallet.chainId}
      />

      {/* --- Two columns ---
          Balanced by role. For the owner, the right column is their control
          surface (funding + configuration) and everything read-only sits on
          the left; stacking all of it on the left, as before, left the right
          column ending halfway down with a screen-high void beside it. For
          everyone else the owner surface is absent or deposit-only, so the
          public facts are split across both columns instead. */}
      {capabilities.isOwner && wallet.status === "connected" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            {participants}
            {execution}
            {watchlist}
            {reminders}
          </div>
          <div className="flex flex-col gap-6">
            <OwnerPanel
              view={view}
              capabilities={capabilities}
              actions={actions}
              walletBalance={wallet.balance}
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            {participants}
            {wallet.status === "connected" && (
              <OwnerPanel
                view={view}
                capabilities={capabilities}
                actions={actions}
                walletBalance={wallet.balance}
              />
            )}
          </div>
          <div className="flex flex-col gap-6">
            {execution}
            {watchlist}
            {reminders}
          </div>
        </div>
      )}

      {/* Full width: event descriptions are sentences, and a half-width column
          would wrap every one of them onto three lines. */}
      <ActivityPanel
        vault={view.address}
        chainId={wallet.chainId}
        roles={{ owner: view.owner, agent: view.agent, recovery: view.recovery }}
      />

      <TransactionDialog tx={actions.tx} chainId={wallet.chainId} />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/app"
      className="-ml-1 inline-flex min-h-[36px] w-fit cursor-pointer items-center gap-1.5 rounded px-1 text-[13px] text-text-dim no-underline transition-colors duration-150 hover:text-text"
    >
      <ArrowLeft size={13} aria-hidden />
      All vaults
    </Link>
  );
}
