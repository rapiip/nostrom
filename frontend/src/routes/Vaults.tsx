import { Link } from "react-router-dom";
import { ArrowRight, Plus, Vault as VaultIcon, Warning } from "@phosphor-icons/react";
import {
  formatAmount,
  formatAmountExact,
  formatCount,
  describeTimeout,
  sameAddress,
  truncateAddress,
} from "@/lib/format";
import { PHASE_META, type VaultPhase, type VaultView } from "@/lib/vaultState";
import { useMyVaults } from "@/hooks/useVault";
import { useAddressName } from "@/lib/addressBook";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useWallet } from "@/hooks/useWallet";
import { shortErrorText } from "@/lib/errors";
import { Button, ButtonRouterLink, buttonClass } from "@/components/ui/Button";
import { AddressDisplay } from "@/components/ui/Address";
import { Freshness } from "@/components/ui/Freshness";
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
  useDocumentTitle("Your vaults");
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
  const { vaults: unsorted, isLoading, isError, error, isEmpty, isFetching, updatedAt, refetch } =
    useMyVaults();

  // Most urgent first, then soonest deadline. Registry order is creation order,
  // which says nothing about which vault needs attention; a lapsed vault at the
  // bottom of a long list is exactly the one that gets missed.
  const vaults = [...unsorted].sort((a, b) => {
    const byPhase = PHASE_RANK[a.phase] - PHASE_RANK[b.phase];
    if (byPhase !== 0) return byPhase;
    return a.liveSecondsRemaining < b.liveSecondsRemaining ? -1 : a.liveSecondsRemaining > b.liveSecondsRemaining ? 1 : 0;
  });

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
            Every vault created by{" "}
            <span className="tnum text-text" title={wallet.address}>
              {truncateAddress(wallet.address, 4)}
            </span>
            , with live countdowns and balances read straight from the chain.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Freshness updatedAt={updatedAt} isFetching={isFetching} onRefresh={refetch} />
          <ButtonRouterLink to="/app/new" variant="primary" icon={<Plus size={14} aria-hidden />}>
            New vault
          </ButtonRouterLink>
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
          action={
            // Sorting puts the most urgent vault first, so this is the one to open.
            <ButtonRouterLink
              to={`/app/vault/${needsAttention[0]!.address}`}
              variant={totals.executable > 0 ? "danger" : "secondary"}
              size="sm"
              iconRight={<ArrowRight size={12} aria-hidden />}
            >
              {needsAttention.length === 1 ? "Open vault" : "Open most urgent"}
            </ButtonRouterLink>
          }
        >
          {totals.executable > 0
            ? "The heartbeat has lapsed, so anyone can move the treasury to its recovery address. If that is unexpected, send a heartbeat or withdraw now."
            : "A heartbeat is overdue. One ping from the agent refills the countdown."}
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
              ? "Most urgent first. Refreshes every 12 seconds; select a row to manage it."
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
            description="Give an agent a treasury it cannot strand. You choose the key it checks in with, the cold wallet that receives everything if it goes dark, and how much silence to tolerate. Takes one transaction."
            action={
              <ButtonRouterLink
                to="/app/new"
                variant="primary"
                size="lg"
                icon={<Plus size={14} aria-hidden />}
              >
                Create your first vault
              </ButtonRouterLink>
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
  const transferredAway = !sameAddress(view.owner, account);
  const saved = useAddressName(chainId, view.address);

  return (
    <li className="border-b border-line last:border-b-0">
      {/* The whole row is one link: a full-bleed overlay that carries the
          accessible name, so there is one tab stop and one announcement per
          vault. The copy button sits above it (z-10) and stays independently
          clickable. (Stretching a Manage button's ::after instead broke on
          press: its active:scale transform made the button the containing
          block, the overlay shrank under the pointer and the click was lost.) */}
      {/* Below md the row is a compact card: identity + status on top, countdown
          and balance side by side, and a chevron as the keyboard/SR link. The
          old stacked layout labelled every value on its own line and made five
          vaults about four screens tall on a phone. */}
      <div className="group/row relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-3 px-4 py-4 transition-colors duration-150 hover:bg-ink-850 sm:px-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_auto] md:items-center md:gap-4">
        <Link
          to={`/app/vault/${view.address}`}
          className="absolute inset-0 z-[1] rounded-none focus-visible:outline-offset-[-2px]"
          aria-label={`Manage vault ${saved ? `${saved.name}, ` : ""}${truncateAddress(view.address, 4)}: ${PHASE_META[view.phase].label}, ${formatAmount(view.balance)} BOT`}
        />
        {/* Identity */}
        <div className="min-w-0">
          <div className="relative z-10 flex w-fit items-center gap-2">
            <AddressDisplay
              address={view.address}
              chainId={chainId}
              label="vault address"
              chars={6}
              showExplorer={false}
              nameable={{ kind: "vault", role: "vault" }}
            />
          </div>
          <p className="mt-1 text-[11px] text-text-faint">
            {describeTimeout(view.timeoutPeriod)} timeout · {formatCount(view.pingCount)}{" "}
            {view.pingCount === 1n ? "ping" : "pings"}
            {transferredAway && (
              <span className="ml-1.5 text-warn">· transferred to another owner</span>
            )}
          </p>
        </div>

        {/* Status: top-right on mobile, its own column from md. */}
        <div className="flex items-start justify-end md:items-center md:justify-start">
          <StatusBadge phase={view.phase} size="sm" />
        </div>

        {/* Grace + balance share a line on mobile. */}
        <div className="col-span-2 flex items-end justify-between gap-4 md:contents">
          <div>
            <span className="md:hidden">
              <Label>Grace</Label>
            </span>
            <GraceInline view={view} className="mt-1.5 md:mt-0" />
          </div>

          <div className="text-right md:text-left">
            <span className="md:hidden">
              <Label>Balance</Label>
            </span>
            <p
              className="tnum mt-1.5 text-[13px] text-text md:mt-0"
              title={`${formatAmountExact(view.balance)} BOT`}
            >
              {formatAmount(view.balance)} <span className="text-text-faint">BOT</span>
            </p>
            {view.balance === 0n && view.phase !== "TRIGGERED" && (
              <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-warn">
                <Warning size={10} aria-hidden />
                unfunded
              </p>
            )}
          </div>
        </div>

        {/* Action cue. Presentational: the row's overlay link is the real,
            single link (one tab stop, one screen-reader announcement per
            vault), and clicks on this cue fall through to it. Hidden on a
            phone, where the whole card is obviously the tap target. */}
        <span
          aria-hidden="true"
          className="hidden md:block md:justify-self-end"
        >
          <span className={buttonClass({ className: "pointer-events-none group-hover/row:border-text-faint group-hover/row:bg-ink-750" })}>
            Manage
            <ArrowRight size={12} className="transition-transform duration-200 group-hover/row:translate-x-0.5" />
          </span>
        </span>
      </div>
    </li>
  );
}


/** Sort order for the list: what needs acting on comes first. */
const PHASE_RANK: Record<VaultPhase, number> = {
  EXECUTABLE: 0,
  EXPIRING: 1,
  ALIVE: 2,
  UNCONFIGURED: 3,
  TRIGGERED: 4,
};
