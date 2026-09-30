import { clsx } from "clsx";
import { Suspense } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import { Crosshair, Plus, Pulse, Vault } from "@phosphor-icons/react";
import { useWallet } from "@/hooks/useWallet";
import { Logo } from "@/components/landing/Logo";
import { ConnectButton } from "@/components/web3/ConnectButton";
import { BuiltOnBotChain } from "@/components/web3/BuiltOnBotChain";
import { GetBotLink, LowBalanceNotice } from "@/components/web3/FundWallet";
import { WalletEventToasts } from "@/components/web3/WalletEventToasts";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Notice, Skeleton } from "@/components/ui/Panel";

/**
 * Application shell.
 *
 * Shares the landing page's palette, type and spacing exactly; the app is the
 * same document continued, not a separate product. Navigation is a horizontal
 * rail rather than a sidebar because the console has four destinations, and a
 * sidebar for four links wastes the width that vault tables need.
 *
 * Global network problems are surfaced here, once, instead of being repeated in
 * every page.
 */

const NAV = [
  { to: "/app", label: "Vaults", icon: Vault, end: true },
  { to: "/app/new", label: "Create", icon: Plus, end: false },
  { to: "/app/lookup", label: "Look up", icon: Pulse, end: false },
  { to: "/app/keeper", label: "Keeper", icon: Crosshair, end: false },
] as const;

export function AppShell() {
  const wallet = useWallet();
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-dvh flex-col bg-ink-950">
      <WalletEventToasts />
      <a
        href="#app-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded focus:border focus:border-signal focus:bg-ink-900 focus:px-3 focus:py-2 focus:text-[13px] focus:text-text"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-line bg-ink-950/94 backdrop-blur-sm">
        <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
          <div className="flex h-16 items-center gap-4">
            <Link
              to="/"
              className="flex h-11 shrink-0 items-center gap-2.5 no-underline"
              aria-label="Nostrom overview"
              title="Back to the Nostrom overview"
            >
              <Logo className="h-4 w-auto text-white" />
              <span className="text-[15px] font-medium tracking-[-0.01em] text-text">
                Nostrom
              </span>
            </Link>

            <span className="hidden h-5 w-px bg-line-strong md:block" aria-hidden />

            {/* Inline rail from md up. Below that the four destinations get a
                row of their own: squeezed next to the wallet button they were
                clipped mid-word ("+ Cr") at 375px, and a horizontally scrolling
                strip hid two of four destinations with no cue they existed. */}
            <nav aria-label="Console" className="hidden min-w-0 items-center gap-0.5 md:flex">
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    clsx(
                      "inline-flex min-h-[40px] shrink-0 cursor-pointer items-center gap-1.5 rounded px-2.5 text-[13px] no-underline transition-all duration-150",
                      isActive
                        ? "border border-line-strong/70 bg-ink-850 text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                        : "border border-transparent text-text-dim hover:bg-ink-900 hover:text-text",
                    )
                  }
                >
                  <Icon size={14} aria-hidden />
                  {label}
                </NavLink>
              ))}
            </nav>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <ConnectButton size="sm" />
            </div>
          </div>
        </div>

        <nav
          aria-label="Console"
          className="grid grid-cols-4 border-t border-line md:hidden"
        >
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  "relative flex min-h-[52px] cursor-pointer flex-col items-center justify-center gap-1 text-[11px] no-underline transition-colors duration-150",
                  "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors",
                  isActive
                    ? "text-text after:bg-signal"
                    : "text-text-dim after:bg-transparent hover:text-text",
                )
              }
            >
              <Icon size={17} aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Global banners. Testnet is stated plainly so nobody mistakes a test
          vault for a real one, and a missing factory is a configuration fact
          rather than a page-level error. */}
      {wallet.status === "connected" && (
        <div className="mx-auto w-full max-w-[1240px] px-5 pt-5 sm:px-8">
          <div className="flex flex-col gap-3">
            {wallet.chainId === 968 && (
              <Notice tone="info">
                You are on <span className="text-text">BOT Chain Testnet</span>. Test BOT has no
                value, so nothing here is at risk. Need gas?{" "}
                <GetBotLink chainId={wallet.chainId} compact /> tops you up for free.
              </Notice>
            )}
            <LowBalanceNotice />
            {wallet.isFactoryMissing && (
              <Notice tone="warn" title="No factory configured for this network">
                Vault discovery and creation are unavailable here. You can still monitor a vault,
                send heartbeats and fire the switch by address: use{" "}
                <Link to="/app/lookup" className="text-signal underline decoration-signal/30 underline-offset-2 hover:decoration-signal">
                  Look up
                </Link>
                .
              </Notice>
            )}
          </div>
        </div>
      )}

      <main id="app-main" className="mx-auto w-full max-w-[1240px] flex-1 px-5 py-8 sm:px-8 sm:py-10">
        {/* Route-level containment. Keyed by path so navigating away from a
            broken screen clears the error, and the shell (nav, wallet) stays
            usable either way. The inner Suspense keeps the header in place while
            a lazy route downloads, instead of blanking the whole page. */}
        <ErrorBoundary key={pathname} scope="route">
          <Suspense fallback={<RouteSkeleton />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-5 py-6 sm:px-8">
          <p className="text-[12px] text-text-faint">
            Nostrom · Fail-safe vaults for autonomous agent treasuries.
          </p>
          <div className="flex items-center gap-4">
            <BuiltOnBotChain />
            <Link
              to="/reference"
              className="inline-flex min-h-[36px] cursor-pointer items-center text-[12px] text-text-dim no-underline transition-colors duration-150 hover:text-text"
            >
              Reference
            </Link>
            <Link
              to="/"
              className="inline-flex min-h-[36px] cursor-pointer items-center text-[12px] text-text-dim no-underline transition-colors duration-150 hover:text-text"
            >
              Overview
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}


/** Placeholder shaped like a console page header plus a panel. */
function RouteSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3.5 w-80 max-w-full" />
      </div>
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
