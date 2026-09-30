import type { ReactNode } from "react";
import { Plugs, Warning, WifiSlash } from "@phosphor-icons/react";
import { defaultChain, supportedChains } from "@/config/chains";
import { LINKS } from "@/config/contracts";
import { useWallet } from "@/hooks/useWallet";
import { Button, ButtonLink, ButtonRouterLink } from "@/components/ui/Button";
import { EmptyState, Notice, Panel } from "@/components/ui/Panel";
import { ConnectButton } from "./ConnectButton";

/**
 * Gate that renders `children` only once the wallet is usable, and explains the
 * blocker precisely otherwise.
 *
 * Each case gets its own copy and its own remedy, because "please connect your
 * wallet" is unhelpful when the real problem is that the wallet is on Ethereum
 * mainnet, or that no factory is deployed on the chain the user picked.
 *
 * `requireFactory` distinguishes screens that need the registry (vault list,
 * create, keeper scan) from screens that work from a bare vault address.
 */
export function WalletGate({
  children,
  requireFactory = false,
  /** Shown above the gate to explain what the user is being asked to unlock. */
  intent,
}: {
  children: ReactNode;
  requireFactory?: boolean;
  intent?: string;
}) {
  const wallet = useWallet();

  if (wallet.status === "no-wallet") {
    return (
      <Panel>
        <EmptyState
          icon={<Plugs size={28} aria-hidden />}
          title="No wallet found in this browser"
          description="Signing heartbeats and managing vaults needs a browser wallet such as MetaMask or Rabby. Install one, then reload. You can still watch any vault by address without one."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink
                href="https://metamask.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                variant="primary"
              >
                Install MetaMask
              </ButtonLink>
              <ButtonRouterLink to="/app/lookup">Watch a vault</ButtonRouterLink>
              <Button variant="ghost" onClick={() => window.location.reload()}>
                Reload
              </Button>
            </div>
          }
        />
      </Panel>
    );
  }

  if (wallet.status === "disconnected" || wallet.status === "connecting") {
    return (
      <Panel>
        <EmptyState
          icon={<HeartbeatGlyph />}
          title="Connect a wallet to continue"
          description={
            intent ??
            "Your vaults are indexed on-chain by the account that created them, so Nostrom needs to know which account you are before it can show anything."
          }
          action={<ConnectButton size="lg" />}
        />
      </Panel>
    );
  }

  if (wallet.status === "wrong-network") {
    return (
      <Panel>
        <EmptyState
          icon={<WifiSlash size={28} aria-hidden />}
          title="Unsupported network"
          description={`Your wallet is on chain ${wallet.chainId}, which Nostrom does not run on. Switch to BOT Chain to continue; your wallet will ask before changing anything.`}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {supportedChains.map((chain) => (
                <Button
                  key={chain.id}
                  variant={chain.id === defaultChain.id ? "primary" : "secondary"}
                  loading={wallet.isSwitching}
                  onClick={() => wallet.switchToChain(chain.id)}
                >
                  Switch to {chain.name}
                </Button>
              ))}
            </div>
          }
        />
        {wallet.switchError && wallet.switchError.kind !== "rejected" && (
          <div className="px-5 pb-5">
            <Notice tone="danger" title={wallet.switchError.title}>
              {wallet.switchError.detail}
              <p className="mt-2 text-text-faint">
                If your wallet does not know BOT Chain yet, it should offer to add it. The chain
                parameters are in the{" "}
                <a
                  href={LINKS.botchainDocs}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cursor-pointer text-signal underline underline-offset-2"
                >
                  BOT Chain quick guide
                </a>
                .
              </p>
            </Notice>
          </div>
        )}
      </Panel>
    );
  }

  if (requireFactory && wallet.isFactoryMissing) {
    return <FactoryMissingNotice chainId={wallet.chainId} chainName={wallet.chainName} />;
  }

  return <>{children}</>;
}

/**
 * The registry is unavailable on this chain.
 *
 * This is an honest configuration state, not an error: the repository has no
 * committed deployment addresses, so a fresh checkout genuinely has no factory
 * until someone deploys one. The direct-address path still works, and is
 * offered here rather than leaving the user stuck.
 */
export function FactoryMissingNotice({
  chainId,
  chainName,
}: {
  chainId: number;
  chainName: string | undefined;
}) {
  return (
    <Panel>
      <EmptyState
        icon={<Warning size={28} aria-hidden />}
        title="No factory on this network"
        description={
          <>
            Nostrom has no factory configured for {chainName ?? `chain ${chainId}`}, so it cannot
            list or create vaults here. Switch networks from the wallet menu, or open an existing
            vault directly by its address.
          </>
        }
        action={
          <div className="flex flex-col items-center gap-3">
            <ButtonRouterLink to="/app/lookup" variant="primary">
              Open a vault by address
            </ButtonRouterLink>
            <p className="max-w-sm text-[12px] leading-relaxed text-text-faint">
              Watching a vault, sending heartbeats and firing the switch all work from an address
              alone.
            </p>
          </div>
        }
      />
    </Panel>
  );
}

/** Wordless heartbeat glyph used in empty states. Reinforces the protocol motif. */
function HeartbeatGlyph() {
  return (
    <svg width="56" height="24" viewBox="0 0 56 24" aria-hidden className="text-signal-dim">
      <path
        d="M0 12h12l3-7 5 14 4-9 3 5h4l2-3 3 3h17"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
