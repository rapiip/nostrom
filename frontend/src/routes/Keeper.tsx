import { ArrowRight, Broadcast, Crosshair } from "@phosphor-icons/react";
import type { Address } from "viem";
import { formatAmount, formatCount, formatDuration, truncateAddress } from "@/lib/format";
import type { VaultView } from "@/lib/vaultState";
import { shortErrorText } from "@/lib/errors";
import { useClock } from "@/hooks/useClock";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { KEEPER_MAX_PAGES, KEEPER_PAGE_SIZE, useExecutableVaults } from "@/hooks/useVault";
import { useVaultActions } from "@/hooks/useVaultActions";
import { useWallet } from "@/hooks/useWallet";
import { Button, ButtonRouterLink } from "@/components/ui/Button";
import { AddressDisplay } from "@/components/ui/Address";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Freshness } from "@/components/ui/Freshness";
import {
  EmptyState,
  Label,
  Notice,
  Panel,
  PanelBody,
  PanelHeader,
  SkeletonRows,
  Stat,
} from "@/components/ui/Panel";
import { TransactionDialog, TxInlineStatus } from "@/components/web3/TransactionDialog";
import { WalletGate } from "@/components/web3/WalletGate";
import { useState } from "react";

/**
 * Keeper scan.
 *
 * The whole reason execution is permissionless is that somebody unrelated to the
 * owner can act, so the console gives that person a first-class screen rather than
 * assuming every visitor is an owner.
 *
 * `getExecutableVaults(offset, limit)` does the scan on-chain (one call instead
 * of iterating every vault) and wraps each check in try/catch so a pathological
 * vault cannot break the page.
 */
export function Keeper() {
  useDocumentTitle("Keeper scan");
  return (
    <WalletGate
      requireFactory
      intent="The keeper scan queries the factory registry, and firing a switch is a transaction."
    >
      <KeeperInner />
    </WalletGate>
  );
}

function KeeperInner() {
  const wallet = useWallet();
  const {
    vaults,
    scanned,
    totalVaults,
    isTruncated,
    failedPages,
    isLoading,
    isError,
    error,
    isFetching,
    updatedAt,
    refetch,
  } = useExecutableVaults();

  const [target, setTarget] = useState<VaultView | null>(null);
  const [executing, setExecuting] = useState<Address | null>(null);

  const actions = useVaultActions(executing ?? undefined, () => {
    refetch();
    setExecuting(null);
  });

  const rescuable = vaults.reduce((sum, v) => sum + v.balance, 0n);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.02em] text-text">Keeper scan</h1>
          <p className="mt-1.5 max-w-[68ch] text-[13px] leading-relaxed text-text-dim">
            Every vault whose heartbeat has lapsed, ready for anyone to execute. The funds always go
            to that vault's own recovery address, never to you.{" "}
            {/* Stated before the list, not only inside the confirm dialog. Someone
                scanning for work should learn there is no bounty here before they
                spend attention on it — a permissionless call with no reward is
                unusual enough that silence would read as an omission. */}
            You pay the gas and receive nothing: there is no bounty and no caller reward.
          </p>
        </div>
        <Freshness
          updatedAt={updatedAt}
          isFetching={isFetching}
          onRefresh={refetch}
          label="Rescan"
          staleAfter={60}
        />
      </div>

      {/* Coverage is a correctness fact for a keeper, not a detail: an empty
          list only means "nothing to do" if the whole registry was examined. */}
      {isTruncated && totalVaults !== undefined && (
        <Notice tone="warn" title="Partial scan">
          The registry holds <span className="tnum text-text">{formatCount(totalVaults)}</span>{" "}
          vaults; this page examines the first{" "}
          <span className="tnum text-text">
            {formatCount(KEEPER_PAGE_SIZE * BigInt(KEEPER_MAX_PAGES))}
          </span>{" "}
          on each refresh. Run <span className="tnum text-text">node scripts/keeper.js</span> for a
          full sweep.
        </Notice>
      )}
      {failedPages > 0 && (
        <Notice tone="warn" title="Some of the registry could not be scanned">
          {failedPages} page{failedPages === 1 ? "" : "s"} of{" "}
          {formatCount(KEEPER_PAGE_SIZE)} vaults failed to read and will be retried on the next
          refresh. Results below may be incomplete.
        </Notice>
      )}

      <Panel>
        <PanelBody className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
          <Stat
            label="Executable now"
            value={isLoading ? "…" : String(vaults.length)}
            tone={vaults.length > 0 ? "danger" : "dim"}
          />
          <Stat
            label="Rescuable"
            value={isLoading ? "…" : formatAmount(rescuable)}
            unit="BOT"
            hint="Native balance only"
          />
          <Stat
            label="Vaults scanned"
            value={scanned !== undefined ? formatCount(scanned) : "…"}
            hint={
              scanned !== undefined && totalVaults !== undefined && scanned >= totalVaults
                ? "Entire registry"
                : undefined
            }
          />
          <Stat
            label="Registry size"
            value={totalVaults !== undefined ? formatCount(totalVaults) : "…"}
            hint="Total vaults ever created"
          />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Executable vaults"
          description="Largest rescue first. Scanned on-chain and refreshed every 15 seconds."
        />

        {isLoading ? (
          <SkeletonRows rows={2} />
        ) : isError ? (
          <PanelBody>
            <Notice tone="danger" title="Scan failed">
              {shortErrorText(error)}
              <div className="mt-3">
                <Button variant="secondary" size="sm" onClick={refetch}>
                  Retry
                </Button>
              </div>
            </Notice>
          </PanelBody>
        ) : vaults.length === 0 ? (
          totalVaults === 0n ? (
            <EmptyState
              icon={<Crosshair size={28} aria-hidden />}
              title="The registry is empty"
              description="No vault has been created through this factory yet, so there is nothing to watch. The scan refreshes automatically."
            />
          ) : (
            <EmptyState
              icon={<Crosshair size={28} aria-hidden />}
              title={isTruncated || failedPages > 0 ? "Nothing executable in the scanned range" : "Every agent is alive"}
              description={
                isTruncated || failedPages > 0
                  ? "No lapsed heartbeat among the vaults examined. See the notice above for what was not covered."
                  : "No vault in the registry has a lapsed heartbeat. This is the healthy state; nothing to do. The scan refreshes automatically."
              }
            />
          )
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 border-b border-line px-5 py-2.5 md:grid">
              <Label>Vault</Label>
              <Label>Lapsed</Label>
              <Label>Rescuable</Label>
              <span className="sr-only">Actions</span>
            </div>
            <ul>
              {vaults.map((v) => (
                <KeeperRow
                  key={v.address}
                  view={v}
                  chainId={wallet.chainId}
                  onExecute={() => {
                    setExecuting(v.address);
                    setTarget(v);
                  }}
                  busy={actions.tx.isBusy && executing === v.address}
                  status={
                    executing === v.address && actions.tx.phase !== "idle" ? (
                      <TxInlineStatus tx={actions.tx} chainId={wallet.chainId} />
                    ) : null
                  }
                />
              ))}
            </ul>
          </>
        )}
      </Panel>

      <Notice tone="info" title="Run a keeper unattended">
        This page only scans while it is open. For continuous coverage, run the bundled watchtower
        from the repository: <span className="tnum text-text">node scripts/keeper.js</span> polls
        the registry and fires any lapsed switch, <span className="tnum text-text">--dry-run</span>{" "}
        reports without sending, and <span className="tnum text-text">--once</span> performs a
        single pass.
      </Notice>

      <ConfirmDialog
        open={target !== null}
        onClose={() => {
          setTarget(null);
          setExecuting(null);
        }}
        onConfirm={() => {
          setTarget(null);
          actions.executeDeadManSwitch();
        }}
        title="Execute this vault's switch"
        confirmLabel="Execute"
        consequence={
          target ? (
            <>
              <span className="tnum text-text">{formatAmount(target.balance)} BOT</span> plus any
              tracked ERC-20 balances will be transferred to this vault's recovery address. You pay
              the gas and receive nothing. The destination is fixed by the contract and cannot be
              changed by the caller.
            </>
          ) : null
        }
      >
        {target && (
          <div className="flex flex-col gap-3">
            <div className="rounded border border-line bg-ink-800 px-3.5 py-3">
              <Label>Vault</Label>
              <div className="mt-2">
                <AddressDisplay
                  address={target.address}
                  chainId={wallet.chainId}
                  label="vault address"
                  full
                />
              </div>
            </div>
            <div className="rounded border border-line bg-ink-800 px-3.5 py-3">
              <Label>Destination (recovery address)</Label>
              <div className="mt-2">
                <AddressDisplay
                  address={target.recovery}
                  chainId={wallet.chainId}
                  label="recovery address"
                  full
                />
              </div>
            </div>
          </div>
        )}
      </ConfirmDialog>

      {/*
        Firing a switch moves someone else's treasury and cannot be undone, so it
        gets the same full receipt treatment as every other write in the app:
        block number, gas used, hash and explorer link. The inline row status
        above stays as the at-a-glance indicator for the list.
      */}
      <TransactionDialog tx={actions.tx} chainId={wallet.chainId} onClose={() => setExecuting(null)} />
    </div>
  );
}

function KeeperRow({
  view,
  chainId,
  onExecute,
  busy,
  status,
}: {
  view: VaultView;
  chainId: number;
  onExecute: () => void;
  busy: boolean;
  status: React.ReactNode;
}) {
  const now = useClock();
  const lapsedFor = BigInt(now) - view.deadline;

  return (
    <li className="border-b border-line last:border-b-0">
      <div className="grid gap-3 px-4 py-4 transition-colors duration-150 hover:bg-ink-850 sm:px-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          <AddressDisplay
            address={view.address}
            chainId={chainId}
            label="vault address"
            chars={6}
            showExplorer={false}
          />
          <p className="mt-1 text-[11px] text-text-faint" title={view.recovery}>
            → recovery {truncateAddress(view.recovery, 4)}
          </p>
        </div>

        <div>
          <span className="md:hidden">
            <Label>Lapsed</Label>
          </span>
          <p className="tnum mt-1 text-[13px] text-danger md:mt-0">
            {formatDuration(lapsedFor > 0n ? lapsedFor : 0n)} ago
          </p>
        </div>

        <div>
          <span className="md:hidden">
            <Label>Rescuable</Label>
          </span>
          <p className="tnum mt-1 text-[13px] text-text md:mt-0">
            {formatAmount(view.balance)} <span className="text-text-faint">BOT</span>
          </p>
        </div>

        <div className="flex flex-col items-start gap-1.5 md:items-end">
          <div className="flex items-center gap-2">
            <ButtonRouterLink
              to={`/app/vault/${view.address}`}
              size="sm"
              iconRight={<ArrowRight size={11} aria-hidden />}
            >
              Inspect
            </ButtonRouterLink>
            <Button
              variant="danger"
              size="sm"
              icon={<Broadcast size={13} aria-hidden />}
              loading={busy}
              onClick={onExecute}
            >
              Execute
            </Button>
          </div>
          {status}
        </div>
      </div>
    </li>
  );
}
