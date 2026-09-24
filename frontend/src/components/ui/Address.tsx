import { clsx } from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowSquareOut, Check, Copy } from "@phosphor-icons/react";
import { explorerAddressUrl, explorerTxUrl } from "@/config/chains";
import { truncateAddress, truncateHash } from "@/lib/format";

/**
 * Copy-to-clipboard button.
 *
 * The icon swaps to a check for 1.4s on success. The swap is accompanied by a
 * polite live-region announcement, because a purely visual confirmation is
 * invisible to a screen reader.
 */
export function CopyButton({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timeout.current), []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timeout.current);
      timeout.current = setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard can be blocked by permissions policy; failing silently here is
      // acceptable because the full value is always visible in the title.
    }
  }, [value]);

  return (
    <>
      <button
        type="button"
        onClick={copy}
        title={`Copy ${label}`}
        aria-label={`Copy ${label}`}
        className={clsx(
          "inline-flex size-7 cursor-pointer items-center justify-center rounded",
          "text-text-faint transition-colors duration-150 hover:bg-ink-800 hover:text-text",
          className,
        )}
      >
        {copied ? (
          <Check size={13} weight="bold" className="text-signal" aria-hidden />
        ) : (
          <Copy size={13} aria-hidden />
        )}
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? `${label} copied to clipboard` : ""}
      </span>
    </>
  );
}

/**
 * On-chain address: truncated monospace value, copy action, explorer link.
 *
 * The explorer link is omitted rather than broken when the chain is unknown —
 * a dead link on a fund-moving screen is worse than no link.
 */
export function AddressDisplay({
  address,
  chainId,
  label = "address",
  chars = 4,
  full = false,
  showCopy = true,
  showExplorer = true,
  className,
  tone = "default",
}: {
  address: string | undefined;
  chainId: number | undefined;
  label?: string;
  chars?: number;
  /** Render the whole 42-character value; wraps on narrow screens. */
  full?: boolean;
  showCopy?: boolean;
  showExplorer?: boolean;
  className?: string;
  tone?: "default" | "dim";
}) {
  if (!address) {
    return <span className={clsx("tnum text-text-faint", className)}>—</span>;
  }

  const href = showExplorer ? explorerAddressUrl(chainId, address) : null;

  return (
    <span className={clsx("inline-flex items-center gap-1.5", className)}>
      <span
        className={clsx(
          "tnum text-[13px]",
          full && "break-all",
          tone === "dim" ? "text-text-dim" : "text-text",
        )}
        title={address}
      >
        {full ? address : truncateAddress(address, chars)}
      </span>
      {showCopy && <CopyButton value={address} label={label} />}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={`View ${label} on the block explorer`}
          aria-label={`View ${label} on the block explorer`}
          className="inline-flex size-7 cursor-pointer items-center justify-center rounded text-text-faint transition-colors duration-150 hover:bg-ink-800 hover:text-text"
        >
          <ArrowSquareOut size={13} aria-hidden />
        </a>
      )}
    </span>
  );
}

/** Transaction hash with explorer link. */
export function TxHashDisplay({
  hash,
  chainId,
  className,
}: {
  hash: string | undefined;
  chainId: number | undefined;
  className?: string;
}) {
  if (!hash) return null;
  const href = explorerTxUrl(chainId, hash);

  return (
    <span className={clsx("inline-flex items-center gap-1.5", className)}>
      <span className="tnum text-[13px] text-text" title={hash}>
        {truncateHash(hash)}
      </span>
      <CopyButton value={hash} label="transaction hash" />
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex cursor-pointer items-center gap-1 rounded text-[12px] text-signal underline decoration-signal/30 underline-offset-2 transition-colors duration-150 hover:decoration-signal"
        >
          Explorer
          <ArrowSquareOut size={11} aria-hidden />
        </a>
      )}
    </span>
  );
}
