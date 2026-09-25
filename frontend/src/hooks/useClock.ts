import { useEffect, useState } from "react";

/**
 * A shared ticking clock in wall-clock seconds.
 *
 * Countdowns must advance smoothly between RPC polls, so they are driven from
 * this rather than from a per-component interval. One timer for the whole tree
 * keeps re-renders predictable, and every countdown on screen stays in lockstep.
 *
 * The chain's own `secondsRemaining` is still read on each poll and is what the
 * contract will act on; this is the interpolation in between. Validator clock
 * drift against the browser is a few seconds, which is irrelevant against
 * timeouts measured in hours, which is the same assumption the contracts make, kept true
 * by MIN_TIMEOUT_PERIOD.
 */

let subscribers = new Set<(t: number) => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function start() {
  if (timer !== undefined) return;
  timer = setInterval(() => {
    const t = nowSeconds();
    for (const fn of subscribers) fn(t);
  }, 1000);
}

function stop() {
  if (timer === undefined) return;
  clearInterval(timer);
  timer = undefined;
}

export function useClock(): number {
  const [t, setT] = useState(nowSeconds);

  useEffect(() => {
    subscribers.add(setT);
    start();

    // Browsers throttle intervals in background tabs, so the last tick can be
    // badly stale when a tab is restored. Re-sync on visibility rather than in
    // the effect body, since useState(nowSeconds) already gives a fresh value on mount.
    const onVisible = () => {
      if (document.visibilityState === "visible") setT(nowSeconds());
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      subscribers.delete(setT);
      document.removeEventListener("visibilitychange", onVisible);
      if (subscribers.size === 0) stop();
    };
  }, []);

  return t;
}

/** Test/HMR escape hatch. */
export function __resetClock() {
  stop();
  subscribers = new Set();
}
