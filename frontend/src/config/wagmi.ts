import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { botchainMainnet, botchainTestnet, hardhatLocal, supportedChains } from "./chains";

/**
 * wagmi configuration.
 *
 * Only the `injected` connector is used. That is a deliberate choice, not an
 * omission: BOT Chain is a custom EVM chain, and injected wallets (MetaMask,
 * Rabby, OKX, Brave) can be asked to add it via wallet_addEthereumChain.
 * WalletConnect would need a project ID and a relay round-trip for a chain most
 * mobile wallets do not know about, so it is left out rather than shipped
 * broken. Adding it later is a one-line change here plus its peer dependency.
 */

const transports = {
  [botchainMainnet.id]: http(),
  [botchainTestnet.id]: http(),
  [hardhatLocal.id]: http(),
} as const;

export const wagmiConfig = createConfig({
  chains: supportedChains,
  connectors: [
    injected({
      shimDisconnect: true,
    }),
  ],
  transports,
  // Reads are polled rather than pushed: BOT Chain RPC websocket support is not
  // documented in the quick guide, so http + interval polling is the safe
  // baseline. Countdowns tick locally from block timestamps, so a 12s poll is
  // plenty for balances and protocol state.
  pollingInterval: 12_000,
  ssr: false,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
