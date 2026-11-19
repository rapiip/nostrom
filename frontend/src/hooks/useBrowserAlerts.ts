import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import { nostromVaultAbi } from "@/contracts/abis";
import { phaseAlert, type PhaseAlert } from "@/lib/alerts";
import { classifyVault, decodeStatusTuple, type VaultPhase } from "@/lib/vaultState";

/**
 * Opt-in operating-system notifications for vault phase changes.
 *
 * Scope, stated plainly in the UI too: there is no server, so this only works
 * while a Nostrom tab stays open (in the background is fine). It exists for the
 * person who leaves the console open in a spare tab, which is exactly when a
 * colour change on screen goes unnoticed.
 *
 * Three things keep it honest:
 *   - Opt-in only. Permission is requested from a click, never on load.
 *   - A transition is re-checked against the chain before notifying. React
 *     Query pauses polling in hidden tabs, so the phase shown is the local
 *     clock ticking against the LAST reading; if the agent pinged in the
 *     meantime that would be a false "heartbeat lapsed". One fresh `status()`
 *     read decides.
 *   - Only when the user is not looking. A visible, focused tab already shows
 *     the change in the page itself.
 *
 * Android Chrome refuses `new Notification()` from a page, so notifications go
 * through a minimal service worker (public/sw.js, no fetch handler, nothing
 * cached) that is registered only when the user turns alerts on.
 */

const KEY = "nostrom:browser-alerts:v1";
const SW_URL = "/sw.js";

export type AlertsStatus = "unsupported" | "denied" | "off" | "on";

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

function supported(): boolean {
  return typeof window !== "undefined" && "Notification" in window && window.isSecureContext;
}

function readPref(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

function writePref(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, "on");
    else localStorage.removeItem(KEY);
  } catch {
    // Storage disabled: the toggle simply will not persist across reloads.
  }
}

function snapshot(): AlertsStatus {
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return Notification.permission === "granted" && readPref() ? "on" : "off";
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  // Permission can change in browser settings while the page is open.
  const refresh = () => fn();
  window.addEventListener("focus", refresh);
  window.addEventListener("storage", refresh);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("focus", refresh);
    window.removeEventListener("storage", refresh);
  };
}

async function registerWorker() {
  try {
    await navigator.serviceWorker?.register(SW_URL, { scope: "/" });
  } catch {
    // Desktop browsers can still show page notifications without it.
  }
}

export function useBrowserAlerts() {
  const status = useSyncExternalStore(subscribe, snapshot, () => "unsupported" as AlertsStatus);

  // A returning visitor who enabled alerts earlier needs the worker again
  // (it may have been cleared with site data).
  useEffect(() => {
    if (status === "on") void registerWorker();
  }, [status]);

  const enable = useCallback(async () => {
    if (!supported()) return;
    const permission =
      Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission === "granted") {
      writePref(true);
      await registerWorker();
    }
    emit();
  }, []);

  const disable = useCallback(() => {
    writePref(false);
    emit();
  }, []);

  return { status, enable, disable };
}

async function show(alert: PhaseAlert, tag: string, url: string) {
  const options: NotificationOptions = {
    body: alert.body,
    tag,
    icon: "/icon-192.png",
    data: { url },
    requireInteraction: alert.urgency === "danger",
  };
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(alert.title, options);
      return;
    }
  } catch {
    // Fall through to a page notification.
  }
  try {
    const n = new Notification(alert.title, options);
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // Some platforms only allow worker notifications; nothing more to do.
  }
}

export interface WatchedVault {
  address: Address;
  phase: VaultPhase;
  /** Saved name, or a truncated address. */
  label: string;
}

/** Watch vaults and raise a system notification for transitions that matter. */
export function useDeadlineNotifications(vaults: readonly WatchedVault[], chainId: number | undefined) {
  const { status } = useBrowserAlerts();
  const client = usePublicClient();
  const previous = useRef(new Map<string, VaultPhase>());

  useEffect(() => {
    for (const vault of vaults) {
      const key = `${chainId}:${vault.address.toLowerCase()}`;
      const before = previous.current.get(key);
      // Recorded even while alerts are off, so turning them on never
      // announces a state that was already on screen.
      previous.current.set(key, vault.phase);

      if (status !== "on" || !client) continue;
      if (!phaseAlert(before, vault.phase, vault.label)) continue;
      if (document.visibilityState === "visible" && document.hasFocus()) continue;

      void (async () => {
        let confirmed: VaultPhase;
        try {
          const raw = await client.readContract({
            address: vault.address,
            abi: nostromVaultAbi,
            functionName: "status",
          });
          confirmed = classifyVault(
            decodeStatusTuple(raw as Parameters<typeof decodeStatusTuple>[0]),
            Date.now() / 1000,
          ).phase;
        } catch {
          // Unverifiable: stay quiet rather than risk a false alarm. The page
          // itself still shows the state once the user looks.
          return;
        }
        const alert = phaseAlert(before, confirmed, vault.label);
        if (!alert) return;
        await show(
          alert,
          `nostrom-${key}`,
          `${window.location.origin}/app/vault/${vault.address}`,
        );
      })();
    }
  }, [vaults, status, client, chainId]);
}
