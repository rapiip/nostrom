import { clsx } from "clsx";
import { NavLink, Outlet, Link } from "react-router-dom";
import { GithubLogo, Crosshair, Plus, Pulse, Vault } from "@phosphor-icons/react";
import { LINKS } from "@/config/contracts";
import { useWallet } from "@/hooks/useWallet";
import { Logo } from "@/components/landing/Logo";
import { ConnectButton } from "@/components/web3/ConnectButton";
import { BuiltOnBotChain } from "@/components/web3/BuiltOnBotChain";
import { Notice } from "@/components/ui/Panel";

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

  return (
    <div className="flex min-h-dvh flex-col bg-ink-950">
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
              title="Back to the Nostrom overview"
            >
              <Logo className="h-4 w-auto text-signal" />
              <span className="hidden text-[15px] font-medium tracking-[-0.01em] text-text sm:inline">
                Nostrom
              </span>
            </Link>

            <span className="h-5 w-px bg-line-strong" aria-hidden />

            <nav aria-label="Console" className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    clsx(
                      "inline-flex min-h-[38px] shrink-0 cursor-pointer items-center gap-1.5 rounded px-2.5 text-[13px] no-underline transition-all duration-150",
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
              <a
                href={LINKS.github}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Source on GitHub"
                className="hidden size-9 cursor-pointer items-center justify-center rounded text-text-dim transition-colors duration-150 hover:bg-ink-850 hover:text-text sm:inline-flex"
              >
                <GithubLogo size={16} aria-hidden />
              </a>
              <ConnectButton size="sm" />
            </div>
          </div>
        </div>
      </header>

      {/* Global banners. Testnet is stated plainly so nobody mistakes a test
          vault for a real one, and a missing factory is a configuration fact
          rather than a page-level error. */}
      {wallet.status === "connected" && (
        <div className="mx-auto w-full max-w-[1240px] px-5 pt-5 sm:px-8">
          <div className="flex flex-col gap-3">
            {wallet.chainId === 968 && (
              <Notice tone="info">
                Connected to <span className="text-text">BOT Chain Testnet</span>.
              </Notice>
            )}
            {wallet.isFactoryMissing && (
              <Notice tone="warn" title="No factory configured for this network">
                Vault discovery and creation are unavailable. Monitoring and execution still work
                from a vault address (use <span className="text-text">Look up</span>).
              </Notice>
            )}
          </div>
        </div>
      )}

      <main id="app-main" className="mx-auto w-full max-w-[1240px] flex-1 px-5 py-8 sm:px-8 sm:py-10">
        <Outlet />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-5 py-6 sm:px-8">
          <p className="text-[12px] text-text-faint">
            Nostrom · Autonomous dead man's switch on BOT Chain.
          </p>
          <div className="flex items-center gap-4">
            <BuiltOnBotChain />
            <Link
              to="/"
              className="inline-flex min-h-[28px] cursor-pointer items-center text-[12px] text-text-dim no-underline transition-colors duration-150 hover:text-text"
            >
              Protocol overview
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
