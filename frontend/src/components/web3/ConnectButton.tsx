import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";
import { CaretDown, Plugs, PlugsConnected, SignOut, Wallet } from "@phosphor-icons/react";
import { supportedChains } from "@/config/chains";
import { formatAmount, truncateAddress } from "@/lib/format";
import { useWallet } from "@/hooks/useWallet";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/Address";

/**
 * Connect / account control.
 *
 * Handles five states explicitly rather than collapsing them:
 *   no wallet installed, disconnected, connecting, wrong network, connected.
 *
 * Intentionally not a third-party modal: a generic wallet-picker sheet is the
 * most recognisable "crypto website" tell there is, and with a single injected
 * connector a picker would have exactly one row in it.
 */
export function ConnectButton({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const wallet = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the account menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  if (wallet.status === "no-wallet") {
    return (
      <Button
        variant="secondary"
        size={size}
        icon={<Plugs size={14} aria-hidden />}
        onClick={() => window.open("https://metamask.io/download/", "_blank", "noopener")}
        title="No EVM wallet detected in this browser"
      >
        Install a wallet
      </Button>
    );
  }

  if (wallet.status === "disconnected" || wallet.status === "connecting") {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <Button
          variant="primary"
          size={size}
          loading={wallet.status === "connecting"}
          icon={wallet.status === "connecting" ? undefined : <Wallet size={14} aria-hidden />}
          onClick={wallet.connect}
        >
          {wallet.status === "connecting" ? "Connecting…" : "Connect wallet"}
        </Button>
        {wallet.connectError && wallet.connectError.kind !== "rejected" && (
          <p role="alert" className="max-w-[240px] text-right text-[11px] text-danger">
            {wallet.connectError.title}
          </p>
        )}
      </div>
    );
  }

  if (wallet.status === "wrong-network") {
    return (
      <Button
        variant="danger"
        size={size}
        loading={wallet.isSwitching}
        onClick={wallet.switchToDefault}
      >
        Wrong network — switch
      </Button>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        className={clsx(
          "flex cursor-pointer items-center gap-2.5 rounded border border-line-strong bg-ink-850 px-3",
          "min-h-[44px] transition-colors duration-150 hover:border-text-faint hover:bg-ink-750",
        )}
      >
        <span className="pulse-dot text-signal" aria-hidden />
        <span className="flex flex-col items-start leading-none">
          <span className="tnum text-[13px] text-text">{truncateAddress(wallet.address)}</span>
          <span className="mt-1 text-[10px] text-text-faint">{wallet.chainName}</span>
        </span>
        <CaretDown
          size={12}
          className={clsx("text-text-faint transition-transform duration-200", menuOpen && "rotate-180")}
          aria-hidden
        />
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-md border border-line-strong bg-ink-900 shadow-2xl shadow-ink-950"
        >
          <div className="border-b border-line px-4 py-3.5">
            <span className="label">Connected account</span>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="tnum truncate text-[13px] text-text" title={wallet.address}>
                {wallet.address}
              </span>
              <CopyButton value={wallet.address ?? ""} label="wallet address" />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="label">Balance</span>
              <span className="tnum text-[13px] text-text">
                {wallet.isBalanceLoading ? "…" : formatAmount(wallet.balance)}{" "}
                <span className="text-text-faint">{wallet.balanceSymbol}</span>
              </span>
            </div>
          </div>

          <div className="border-b border-line px-4 py-3">
            <span className="label">Network</span>
            <div className="mt-2 flex flex-col gap-1">
              {supportedChains.map((chain) => {
                const active = chain.id === wallet.chainId;
                return (
                  <button
                    key={chain.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      wallet.switchToChain(chain.id);
                      setMenuOpen(false);
                    }}
                    disabled={active}
                    className={clsx(
                      "flex items-center justify-between rounded px-2 py-2 text-left text-[13px] transition-colors duration-150",
                      active
                        ? "cursor-default bg-ink-800 text-text"
                        : "cursor-pointer text-text-dim hover:bg-ink-800 hover:text-text",
                    )}
                  >
                    <span>{chain.name}</span>
                    {active ? (
                      <PlugsConnected size={13} className="text-signal" aria-hidden />
                    ) : (
                      <span className="tnum text-[11px] text-text-faint">{chain.id}</span>
                    )}
                  </button>
                );
              })}
            </div>
            {wallet.switchError && wallet.switchError.kind !== "rejected" && (
              <p role="alert" className="mt-2 text-[11px] text-danger">
                {wallet.switchError.title}
              </p>
            )}
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              wallet.disconnect();
              setMenuOpen(false);
            }}
            className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left text-[13px] text-text-dim transition-colors duration-150 hover:bg-ink-800 hover:text-danger"
          >
            <SignOut size={14} aria-hidden />
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
