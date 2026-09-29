import { ArrowSquareOut } from "@phosphor-icons/react";
import { useGasPrice } from "wagmi";
import { botchainMainnet, botchainTestnet } from "@/config/chains";
import { GAS, LINKS } from "@/config/contracts";
import { formatAmount } from "@/lib/format";
import { useWallet } from "@/hooks/useWallet";
import { Notice } from "@/components/ui/Panel";

/**
 * Where to get BOT on a given chain, or null when there is no public source
 * (a local Hardhat node funds its own accounts).
 *
 * Source: "Get Tokens" in the BOT Chain quick guide. Testnet BOT comes from the
 * faucet; mainnet BOT is only sold through the official DEX.
 */
export function botSourceFor(
  chainId: number | undefined,
): { href: string; label: string; short: string } | null {
  if (chainId === botchainTestnet.id) {
    return { href: LINKS.testnetFaucet, label: "Get test BOT from the faucet", short: "Faucet" };
  }
  if (chainId === botchainMainnet.id) {
    return { href: LINKS.mainnetDex, label: "Buy BOT on B DEX", short: "B DEX" };
  }
  return null;
}

/** Inline external link to the faucet / DEX. Renders nothing on other chains. */
export function GetBotLink({
  chainId,
  className = "",
  compact = false,
}: {
  chainId: number | undefined;
  className?: string;
  compact?: boolean;
}) {
  const source = botSourceFor(chainId);
  if (!source) return null;
  return (
    <a
      href={source.href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex cursor-pointer items-center gap-1 text-signal underline decoration-signal/30 underline-offset-2 transition-colors duration-150 hover:decoration-signal ${className}`}
    >
      {compact ? source.short : source.label}
      <ArrowSquareOut size={11} aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/**
 * Shown once, in the console shell, when the connected wallet cannot pay for
 * the most expensive thing the console asks of it (creating a vault). Every
 * write in Nostrom needs gas, so an empty wallet is the first wall a new user
 * hits, and the error the wallet eventually shows ("insufficient funds") does
 * not say where BOT comes from.
 */
export function LowBalanceNotice() {
  const wallet = useWallet();
  const gasPrice = useGasPrice({ query: { enabled: wallet.status === "connected" } });

  if (wallet.status !== "connected" || wallet.balance === undefined) return null;

  const createCost = gasPrice.data !== undefined ? GAS.CREATE_VAULT * gasPrice.data : undefined;
  const empty = wallet.balance === 0n;
  const low = !empty && createCost !== undefined && wallet.balance < createCost;
  if (!empty && !low) return null;

  const source = botSourceFor(wallet.chainId);

  return (
    <Notice
      tone="warn"
      title={empty ? "Your wallet has no BOT for gas" : "Your wallet is low on BOT"}
    >
      {empty
        ? "Every transaction on BOT Chain, including creating a vault or sending a heartbeat, is paid for in BOT."
        : `${formatAmount(wallet.balance)} BOT may not cover creating a vault (about ${formatAmount(createCost)} BOT at the current gas price).`}{" "}
      {source ? (
        <GetBotLink chainId={wallet.chainId} />
      ) : (
        <span className="text-text-faint">Fund this account from your local node.</span>
      )}
    </Notice>
  );
}
