import { useCallback, useEffect, useState } from "react";
import {
  useBalance,
  useChainId,
  useConnect,
  useConnection,
  useConnectionEffect,
  useConnectors,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { defaultChain, getChain, isSupportedChainId, supportedChains } from "@/config/chains";
import { hasFactory } from "@/config/contracts";
import { decodeTxError, type DecodedTxError } from "@/lib/errors";

/**
 * Wallet and network state, collapsed into the cases the UI actually branches on.
 *
 *   no-wallet      no injected provider in the browser at all
 *   disconnected   provider present, not authorised
 *   connecting     request in flight
 *   wrong-network  connected, but on a chain the app does not support
 *   connected      ready
 *
 * Account and chain changes are handled by wagmi's connection listeners; the
 * `useConnectionEffect` hook below exists so the app can react to a user
 * switching accounts in their wallet (React Query caches are keyed by address,
 * so reads refresh on their own — this is for the one-off side effects).
 */

export type WalletStatus =
  | "no-wallet"
  | "disconnected"
  | "connecting"
  | "wrong-network"
  | "connected";

export interface WalletState {
  status: WalletStatus;
  address: `0x${string}` | undefined;
  chainId: number;
  chainName: string | undefined;
  isSupportedChain: boolean;
  /** Connected to a supported chain that has no factory configured. */
  isFactoryMissing: boolean;
  balance: bigint | undefined;
  balanceSymbol: string;
  isBalanceLoading: boolean;
  hasInjectedProvider: boolean;
  connectError: DecodedTxError | undefined;
  switchError: DecodedTxError | undefined;
  isSwitching: boolean;
  connect: () => void;
  disconnect: () => void;
  switchToChain: (chainId: number) => void;
  switchToDefault: () => void;
  /** Most recent account change, for showing a transient notice. */
  lastAccountChange: number | undefined;
}

export function useWallet(): WalletState {
  const connection = useConnection();
  const configChainId = useChainId();
  const connectors = useConnectors();
  const connectMutation = useConnect();
  const disconnectMutation = useDisconnect();
  const switchChain = useSwitchChain();

  /**
   * The chain that matters is the WALLET's, not the config's.
   *
   * `useChainId()` returns the chain wagmi's config considers current, which
   * falls back to `chains[0]` when the wallet is on something unconfigured.
   * Trusting it would mean a user sitting on Ethereum mainnet appears healthily
   * connected to BOT Chain, and their next transaction goes somewhere surprising.
   * `useConnection().chainId` is the connector's real chain, so that wins
   * whenever a connection exists.
   */
  const chainId = connection.isConnected ? (connection.chainId ?? configChainId) : configChainId;

  const [lastAccountChange, setLastAccountChange] = useState<number | undefined>();

  useConnectionEffect({
    onConnect: () => setLastAccountChange(Date.now()),
    onDisconnect: () => setLastAccountChange(undefined),
  });

  const injectedConnector = connectors.find((c) => c.id === "injected") ?? connectors[0];

  // An injected connector is always registered; whether a provider exists is a
  // runtime question. Resolve it once so the UI can offer an install prompt
  // rather than a Connect button that silently does nothing.
  const [hasInjectedProvider, setHasInjectedProvider] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!injectedConnector) {
        if (!cancelled) setHasInjectedProvider(false);
        return;
      }
      try {
        const provider = await injectedConnector.getProvider();
        if (!cancelled) setHasInjectedProvider(Boolean(provider));
      } catch {
        if (!cancelled) setHasInjectedProvider(false);
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [injectedConnector]);

  const isSupportedChain = isSupportedChainId(chainId);
  const chain = getChain(chainId);

  const balanceQuery = useBalance({
    address: connection.address,
    query: { enabled: Boolean(connection.address) && isSupportedChain },
  });

  const status: WalletStatus = (() => {
    if (connectMutation.isPending || connection.isConnecting || connection.isReconnecting) {
      return "connecting";
    }
    if (!connection.isConnected || !connection.address) {
      return hasInjectedProvider ? "disconnected" : "no-wallet";
    }
    return isSupportedChain ? "connected" : "wrong-network";
  })();

  const connect = useCallback(() => {
    if (!injectedConnector) return;
    // Deliberately no `chainId` here. Forcing one would drag a user who is
    // already on a supported chain (say BOT Chain mainnet) over to the default
    // (testnet) the moment they connect. Connect on whatever chain the wallet is
    // on; if that chain is unsupported, the network gate offers the switch.
    connectMutation.mutate({ connector: injectedConnector });
  }, [connectMutation, injectedConnector]);

  const disconnect = useCallback(() => {
    disconnectMutation.mutate({});
  }, [disconnectMutation]);

  const switchToChain = useCallback(
    (target: number) => {
      switchChain.mutate({ chainId: target as (typeof supportedChains)[number]["id"] });
    },
    [switchChain],
  );

  return {
    status,
    address: connection.address,
    chainId,
    chainName: chain?.name,
    isSupportedChain,
    isFactoryMissing: isSupportedChain && !hasFactory(chainId),
    balance: balanceQuery.data?.value,
    balanceSymbol: balanceQuery.data?.symbol ?? "BOT",
    isBalanceLoading: balanceQuery.isLoading,
    hasInjectedProvider,
    connectError: connectMutation.error ? decodeTxError(connectMutation.error) : undefined,
    switchError: switchChain.error ? decodeTxError(switchChain.error) : undefined,
    isSwitching: switchChain.isPending,
    connect,
    disconnect,
    switchToChain,
    switchToDefault: () => switchToChain(defaultChain.id),
    lastAccountChange,
  };
}
