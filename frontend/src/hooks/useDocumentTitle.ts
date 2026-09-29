import { useEffect } from "react";

const BASE = "Nostrom";

/**
 * Per-route document title.
 *
 * With several vault tabs open, identical titles make them indistinguishable,
 * and for a monitoring tool the tab strip is often the only thing visible. A
 * title is an external system, so an effect is the right place to write it.
 * The previous title is restored on unmount so nested routes compose cleanly.
 */
export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} · ${BASE}`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
