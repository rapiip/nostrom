import { useEffect, useRef } from "react";

/**
 * Scroll reveal via IntersectionObserver.
 *
 * Adds `.in-view` once, then unobserves — a reveal that replays on every scroll
 * pass is a distraction rather than a cue. The CSS in styles/index.css already
 * renders the final state under prefers-reduced-motion, so no branch is needed
 * here beyond the early exit.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(options?: {
  threshold?: number;
  rootMargin?: string;
}) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("in-view");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            observer.unobserve(entry.target);
          }
        }
      },
      {
        threshold: options?.threshold ?? 0.12,
        rootMargin: options?.rootMargin ?? "0px 0px -8% 0px",
      },
    );

    observer.observe(el);
    // Direct children marked .reveal animate individually, which is what makes
    // a staggered list possible without per-item observers.
    for (const child of el.querySelectorAll<HTMLElement>(":scope > .reveal")) {
      observer.observe(child);
    }

    return () => observer.disconnect();
  }, [options?.threshold, options?.rootMargin]);

  return ref;
}
