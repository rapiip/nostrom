import { Link, useParams } from "react-router-dom";
import { isAddress, getAddress, type Address } from "viem";
import { ArrowClockwise, ArrowLeft, MagnifyingGlass } from "@phosphor-icons/react";
import { formatAmountExact, formatTimestamp, truncateAddress } from "@/lib/format";
import { describeRole } from "@/lib/vaultState";
import { shortErrorText } from "@/lib/errors";
import { useVault, useIsRegisteredVault, useVaultRecord } from "@/hooks/useVault";
import { useVaultActions } from "@/hooks/useVaultActions";
import { useWallet } from "@/hooks/useWallet";
import { Button } from "@/components/ui/Button";
import { AddressDisplay } from "@/components/ui/Address";
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
import { HeartbeatPanel } from "@/components/app/HeartbeatPanel";
import { OwnerPanel } from "@/components/app/OwnerPanel";
import { ExecutionPanel, RegistryWarning } from "@/components/app/ExecutionPanel";
import { TokenWatchlist } from "@/components/app/TokenWatchlist";

/**
 * Vault detail.
 *
 * Deliberately readable without a wallet: monitoring a vault is a public act, and
 * a keeper or a counterparty should be able to inspect one before connecting
 * anything. Write surfaces appear as the connected account's capabilities allow —
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

  const { view, capabilities, trackedTokens, isLoading, isError, error, isNotAVault, refetch } =
    useVault(parsed);
  const { isRegistered, canVerify } = useIsRegisteredVault(parsed);
  const record = useVaultRecord(parsed);

  const actions = useVaultActions(parsed, () => refetch());

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
            <Link
              to="/app/lookup"
              className="inline-flex min-h-[44px] cursor-pointer items-center rounded border border-signal bg-signal px-4 text-[13px] font-medium text-ink-950 no-underline transition-colors hover:bg-signal/90"
            >
              Look up a vault
            </Link>
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
                The call to <code className="font-mono">status()</code> failed, so either nothing is
                deployed at <span className="tnum break-all">{parsed}</span> on{" "}
                {wallet.chainName ?? `chain ${wallet.chainId}`}, or the contract there is not a
                Nostrom vault. If you expected a vault, check you are on the right network.
              </>
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="secondary" onClick={refetch}>
                  Retry
                </Button>
                <Link
                  to="/app/lookup"
                  className="inline-flex min-h-[44px] cursor-pointer items-center rounded border border-line-strong bg-ink-850 px-4 text-[13px] text-text no-underline transition-colors hover:bg-ink-750"
                >
                  Try another address
                </Link>
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
  return (
    <div className="flex flex-col gap-6">
      <BackLink />

      {/* --- Identity header --- */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="tnum text-[20px] font-medium tracking-[-0.01em] text-text">
              {truncateAddress(view.address, 8)}
            </h1>
            <StatusBadge phase={view.phase} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <AddressDisplay
              address={view.address}
              chainId={wallet.chainId}
              label="vault address"
              full
              tone="dim"
            />
          </div>
          <p className="mt-2 text-[12px] text-text-faint">
            Your role: <span className="text-text-dim">{describeRole(capabilities)}</span>
            {record.createdAt !== undefined && (
              <> · created {formatTimestamp(record.createdAt)}</>
            )}
          </p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowClockwise size={13} aria-hidden />}
          onClick={refetch}
        >
          Refresh
        </Button>
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
          was read from {wallet.chainName ?? "the app's default network"} — switch networks before
          acting on it.
        </Notice>
      ) : wallet.status !== "connected" ? (
        <Notice tone="info" title="Read-only">
          You are viewing this vault without a connected wallet. Monitoring is public — connect to
          send a heartbeat, manage the vault, or execute the switch.
        </Notice>
      ) : null}

      {/* --- Heartbeat, full width --- */}
      <HeartbeatPanel
        view={view}
        capabilities={capabilities}
        onPing={actions.ping}
        isPinging={actions.tx.isBusy}
      />

      {/* --- Two columns --- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Panel>
            <PanelHeader
              title="Participants"
              description="Three roles with deliberately unequal power."
            />
            <PanelBody>
              <DataList>
                <DataRow
                  label="Owner"
                  hint={capabilities.isOwner ? "This is you" : undefined}
                >
                  <AddressDisplay
                    address={view.owner}
                    chainId={wallet.chainId}
                    label="owner address"
                    chars={6}
                  />
                </DataRow>
                <DataRow
                  label="Agent"
                  hint={
                    capabilities.isAgent ? "This is you — can only call ping()" : "Can only call ping()"
                  }
                >
                  <AddressDisplay
                    address={view.agent}
                    chainId={wallet.chainId}
                    label="agent address"
                    chars={6}
                  />
                </DataRow>
                <DataRow
                  label="Recovery"
                  hint={capabilities.isRecovery ? "This is you" : "Receives everything on failure"}
                >
                  <AddressDisplay
                    address={view.recovery}
                    chainId={wallet.chainId}
                    label="recovery address"
                    chars={6}
                  />
                </DataRow>
                <DataRow label="Balance">
                  <span className="tnum" title={`${formatAmountExact(view.balance)} BOT`}>
                    {formatAmountExact(view.balance)}{" "}
                    <span className="text-text-faint">BOT</span>
                  </span>
                </DataRow>
                {record.creator && (
                  <DataRow
                    label="Created by"
                    hint="Registry index, immutable — not the same as current owner"
                  >
                    <AddressDisplay
                      address={record.creator}
                      chainId={wallet.chainId}
                      label="creator address"
                      chars={6}
                    />
                  </DataRow>
                )}
              </DataList>
            </PanelBody>
          </Panel>

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
          <ExecutionPanel
            view={view}
            capabilities={capabilities}
            actions={actions}
            chainId={wallet.chainId}
          />

          <TokenWatchlist
            view={view}
            capabilities={capabilities}
            actions={actions}
            trackedTokens={trackedTokens}
            chainId={wallet.chainId}
          />
        </div>
      </div>

      <TransactionDialog tx={actions.tx} chainId={wallet.chainId} />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/app"
      className="inline-flex min-h-[28px] w-fit cursor-pointer items-center gap-1.5 text-[13px] text-text-dim no-underline transition-colors duration-150 hover:text-text"
    >
      <ArrowLeft size={13} aria-hidden />
      All vaults
    </Link>
  );
}
