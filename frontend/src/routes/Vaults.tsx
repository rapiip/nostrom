import { Link } from "react-router-dom";
import { ArrowClockwise, ArrowRight, Plus, Vault as VaultIcon, Warning } from "@phosphor-icons/react";
import { formatAmount, formatAmountExact, describeTimeout, sameAddress } from "@/lib/format";
import { PHASE_META, type VaultView } from "@/lib/vaultState";
import { useMyVaults } from "@/hooks/useVault";
import { useWallet } from "@/hooks/useWallet";
import { shortErrorText } from "@/lib/errors";
import { Button } from "@/components/ui/Button";
import { AddressDisplay } from "@/components/ui/Address";
import { GraceInline } from "@/components/ui/GraceTrack";
import { StatusBadge } from "@/components/ui/StatusBadge";
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
import { WalletGate } from "@/components/web3/WalletGate";

/**
 * Vault list: the console's home.
 *
 * Reads the caller's vaults from the registry, then all of their live state in a
 * single batched `getVaultsSnapshot` call. Rows are a real table on wide screens
 * (so balances and countdowns align into scannable columns) and stack into
 * labelled blocks below `md`, rather than being forced into a horizontal scroll.
 */
export function Vaults() {
  return (
    <WalletGate
      requireFactory
      intent="Nostrom indexes vaults by the account that created them, so it needs to know which account you are before it can list anything."
    >
      <VaultsInner />
    </WalletGate>
  );
}

function VaultsInner() {
  const wallet = useWallet();
  const { vaults, isLoading, isError, error, isEmpty, refetch } = useMyVaults();

  const totals = vaults.reduce(
    (acc, v) => {
      acc.balance += v.balance;
      if (v.phase === "ALIVE") acc.alive += 1;
      if (v.phase === "EXPIRING") acc.expiring += 1;
      if (v.phase === "EXECUTABLE") acc.executable += 1;
      if (v.phase === "TRIGGERED") acc.triggered += 1;
      return acc;
    },
    { balance: 0n, alive: 0, expiring: 0, executable: 0, triggered: 0 },
  );

  const needsAttention = vaults.filter(
    (v) => v.phase === "EXECUTABLE" || v.phase === "EXPIRING",
  );

  return (
    <div className="flex flex-col gap-6">
      {/* --- Header --- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.02em] text-text">Your vaults</h1>
          <p className="mt-1.5 max-w-[62ch] text-[13px] leading-relaxed text-text-dim">
            Overview of vaults deployed by{" "}
            <span className="tnum text-text">{wallet.address?.slice(0, 10)}…</span>. Monitor real-time
            health, treasury balances, and active operational status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<ArrowClockwise size={13} aria-hidden />}
            onClick={refetch}
          >
            Refresh
          </Button>
          <Link
            to="/app/new"
            className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded border border-signal bg-signal px-3.5 text-[13px] font-medium text-ink-950 no-underline shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all duration-150 hover:bg-signal/90 hover:shadow-[0_0_16px_-3px_rgba(125,211,160,0.3)] active:scale-[0.985]"
          >
            <Plus size={13} aria-hidden />
            New vault
          </Link>
        </div>
      </div>

      {/* --- Anything that needs acting on, first --- */}
      {needsAttention.length > 0 && (
        <Notice
          tone={totals.executable > 0 ? "danger" : "warn"}
          title={
            totals.executable > 0
              ? `${totals.executable} vault${totals.executable === 1 ? "" : "s"} can be rescued right now`
              : `${totals.expiring} vault${totals.expiring === 1 ? "" : "s"} running low on grace`
          }
        >
          {totals.executable > 0
            ? "The heartbeat has lapsed. Anyone can evacuate the treasury to the recovery address: send a heartbeat or withdraw immediately if this is unexpected."
            : "A heartbeat is overdue. One ping resets the countdown."}
        </Notice>
      )}

      {/* --- Portfolio summary. Four figures, not four cards. --- */}
      {!isEmpty && !isLoading && (
        <Panel>
          <PanelBody className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
            <Stat
              label="Total secured"
              value={formatAmount(totals.balance)}
              unit="BOT"
              title={`${formatAmountExact(totals.balance)} BOT`}
            />
            <Stat label="Vaults" value={String(vaults.length)} hint="Created by this account" />
            <Stat
              label="Alive"
              value={String(totals.alive)}
              tone={totals.alive > 0 ? "signal" : "dim"}
              hint="Heartbeat current"
            />
            <Stat
              label="At risk"
              value={String(totals.expiring + totals.executable)}
              tone={
                totals.executable > 0 ? "danger" : totals.expiring > 0 ? "warn" : "dim"
              }
              hint="Expiring or lapsed"
            />
          </PanelBody>
        </Panel>
      )}

      {/* --- The list --- */}
      <Panel>
        <PanelHeader
          title="Vaults"
          description={
            vaults.length > 0
              ? "State is read from the chain in one batched call and refreshed every 12 seconds."
              : undefined
          }
        />

        {isLoading ? (
          <SkeletonRows rows={3} />
        ) : isError ? (
          <PanelBody>
            <Notice tone="danger" title="Could not read the registry">
              {shortErrorText(error)}
              <div className="mt-3">
                <Button variant="secondary" size="sm" onClick={refetch}>
                  Retry
                </Button>
              </div>
            </Notice>
          </PanelBody>
        ) : isEmpty ? (
          <EmptyState
            icon={<VaultIcon size={28} aria-hidden />}
            title="No vaults yet"
            description="Create one to give an agent a treasury it cannot strand. You choose the agent key, the cold wallet that receives funds if it goes dark, and how much silence to tolerate."
            action={
              <Link
                to="/app/new"
                className="inline-flex min-h-[48px] cursor-pointer items-center gap-2 rounded border border-signal bg-signal px-5 text-[14px] font-medium text-ink-950 no-underline shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all duration-150 hover:bg-signal/90 hover:shadow-[0_0_20px_-3px_rgba(125,211,160,0.35)] active:scale-[0.985]"
              >
                <Plus size={14} aria-hidden />
                Create your first vault
              </Link>
            }
          />
        ) : (
          <>
            {/* Column headers, wide screens only. */}
            <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_auto] gap-4 border-b border-line px-5 py-2.5 md:grid">
              <Label>Vault</Label>
              <Label>Status</Label>
              <Label>Grace remaining</Label>
              <Label>Balance</Label>
              <span className="sr-only">Actions</span>
            </div>

            <ul className="flex flex-col">
              {vaults.map((v) => (
                <VaultRow key={v.address} view={v} account={wallet.address} chainId={wallet.chainId} />
              ))}
            </ul>
          </>
        )}
      </Panel>
    </div>
  );
}

function VaultRow({
  view,
  account,
  chainId,
}: {
  view: VaultView;
  account: string | undefined;
  chainId: number;
}) {
  const meta = PHASE_META[view.phase];
  const transferredAway = !sameAddress(view.owner, account);

  return (
    <li className="border-b border-line last:border-b-0">
      <div className="grid gap-4 px-4 py-4 transition-colors duration-150 hover:bg-ink-850 sm:px-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_auto] md:items-center">
        {/* Identity */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <AddressDisplay
              address={view.address}
              chainId={chainId}
              label="vault address"
              chars={6}
              showExplorer={false}
            />
          </div>
          <p className="mt-1 text-[11px] text-text-faint">
            {describeTimeout(view.timeoutPeriod)} timeout · {view.pingCount.toString()} pings
            {transferredAway && (
              <span className="ml-1.5 text-warn" title={`Current owner: ${view.owner}`}>
                · transferred away
              </span>
            )}
          </p>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2">
          <StatusBadge phase={view.phase} size="sm" />
          <span className="md:hidden">
            <Label>{meta.label}</Label>
          </span>
        </div>

        {/* Grace */}
        <div>
          <span className="md:hidden">
            <Label>Grace remaining</Label>
          </span>
          <GraceInline view={view} className="mt-1 md:mt-0" />
        </div>

        {/* Balance */}
        <div>
          <span className="md:hidden">
            <Label>Balance</Label>
          </span>
          <p className="tnum mt-1 text-[13px] text-text md:mt-0" title={`${formatAmountExact(view.balance)} BOT`}>
            {formatAmount(view.balance)} <span className="text-text-faint">BOT</span>
          </p>
          {view.balance === 0n && view.phase !== "TRIGGERED" && (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-warn">
              <Warning size={10} aria-hidden />
              unfunded
            </p>
          )}
        </div>

        {/* Action */}
        <Link
          to={`/app/vault/${view.address}`}
          className="group inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 justify-self-start rounded border border-line-strong bg-ink-850 px-3 text-[13px] text-text no-underline shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-150 hover:border-text-faint hover:bg-ink-750 active:scale-[0.985] md:justify-self-end"
        >
          Manage
          <ArrowRight
            size={12}
            aria-hidden
            className="transition-transform duration-200 group-hover:translate-x-0.5"
          />
        </Link>
      </div>
    </li>
  );
}
