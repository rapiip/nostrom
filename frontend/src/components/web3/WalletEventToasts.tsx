import { useEffect } from "react";
import { useConfig } from "wagmi";
import { watchConnection } from "wagmi/actions";
import { getChain } from "@/config/chains";
import { truncateAddress } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";

/**
 * Announces wallet-side changes the page did not initiate.
 *
 * Switching account or network happens inside the wallet extension, outside
 * this document. The data on screen re-keys itself silently, so without a note
 * a user can glance back at the console and act on what they believe is a
 * different account's vault. Initial connection and reconnect-on-load are not
 * announced: the user just did those, and the header already reflects them.
 *
 * The subscription is an external system, so an effect is correct; toasts are
 * raised from its callback, never from the effect body.
 */
export function WalletEventToasts() {
  const config = useConfig();
  const { toast } = useToast();

  useEffect(() => {
    return watchConnection(config, {
      onChange(next, prev) {
        if (next.status !== "connected" || prev.status !== "connected") {
          if (prev.status === "connected" && next.status === "disconnected") {
            toast({
              id: "wallet-change",
              tone: "info",
              title: "Wallet disconnected",
              description: "Vault state stays readable; connect again to send transactions.",
            });
          }
          return;
        }

        if (next.address && prev.address && next.address !== prev.address) {
          toast({
            id: "wallet-change",
            tone: "warn",
            title: "Account changed",
            description: `Now acting as ${truncateAddress(next.address, 6)}. Roles and permissions on screen have been re-evaluated for this account.`,
          });
          return;
        }

        if (next.chainId !== prev.chainId) {
          const chain = getChain(next.chainId);
          toast({
            id: "wallet-change",
            tone: chain ? "info" : "warn",
            title: chain ? `Switched to ${chain.name}` : "Unsupported network",
            description: chain
              ? "Vault data is now read from this network."
              : `Your wallet moved to chain ${next.chainId}. Switch back to BOT Chain before acting.`,
          });
        }
      },
    });
  }, [config, toast]);

  return null;
}
