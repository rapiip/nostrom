import { useEffect, useRef } from "react";
import type { VaultPhase, VaultView } from "@/lib/vaultState";
import { formatAmount, truncateAddress } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";

/**
 * Announce changes to a vault that happen while the user is watching it but
 * that they did not cause from this tab.
 *
 * A monitoring screen is often left open in a background tab. The countdown
 * crossing into EXPIRING or EXECUTABLE, or an agent's heartbeat arriving, is
 * precisely what the user is waiting for, and a colour change in a panel they
 * are not looking at is easy to miss. The first reading after mount is taken
 * as the baseline and never announced.
 *
 * `suppress` is set while this tab's own transaction is in flight or has just
 * settled: the transaction dialog already reports that outcome in full.
 */
export function useVaultChangeToasts(view: VaultView | undefined, opts: { suppress: boolean }) {
  const { toast } = useToast();
  const baseline = useRef<{ address: string; phase: VaultPhase; pingCount: bigint; balance: bigint } | null>(null);
  const suppress = opts.suppress;

  useEffect(() => {
    if (!view) return;
    const prev = baseline.current;
    baseline.current = {
      address: view.address,
      phase: view.phase,
      pingCount: view.pingCount,
      balance: view.balance,
    };
    // First reading, or navigated to a different vault: nothing to compare.
    if (!prev || prev.address !== view.address || suppress) return;

    const who = truncateAddress(view.address, 4);

    if (prev.phase !== view.phase) {
      switch (view.phase) {
        case "EXPIRING":
          toast({
            id: `phase-${view.address}`,
            tone: "warn",
            title: "Grace period running low",
            description: `Vault ${who} has under 20% of its window left. One heartbeat resets it.`,
          });
          return;
        case "EXECUTABLE":
          toast({
            id: `phase-${view.address}`,
            tone: "danger",
            title: "Heartbeat lapsed",
            description: `Vault ${who} is now executable. Anyone can evacuate it to the recovery address.`,
            duration: 12_000,
          });
          return;
        case "TRIGGERED":
          toast({
            id: `phase-${view.address}`,
            tone: "danger",
            title: "Switch fired",
            description: `Vault ${who} was executed and its treasury sent to the recovery address.`,
            duration: 12_000,
          });
          return;
        case "ALIVE":
          if (prev.phase === "EXPIRING" || prev.phase === "EXECUTABLE" || prev.phase === "TRIGGERED") {
            toast({
              id: `phase-${view.address}`,
              tone: "signal",
              title: prev.phase === "TRIGGERED" ? "Vault re-armed" : "Heartbeat received",
              description: `Vault ${who} is alive again. The countdown has been reset.`,
            });
          }
          return;
        default:
          return;
      }
    }

    if (view.pingCount > prev.pingCount) {
      toast({
        id: `ping-${view.address}`,
        tone: "signal",
        title: "Heartbeat received",
        description: `The agent checked in on vault ${who}. Countdown reset.`,
        duration: 3500,
      });
      return;
    }

    if (view.balance !== prev.balance && !view.isTriggered) {
      const up = view.balance > prev.balance;
      toast({
        id: `balance-${view.address}`,
        tone: up ? "info" : "warn",
        title: up ? "Vault balance increased" : "Vault balance decreased",
        description: `Now ${formatAmount(view.balance)} BOT (was ${formatAmount(prev.balance)}).`,
      });
    }
  }, [view, suppress, toast]);
}
