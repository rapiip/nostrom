import { clsx } from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowSquareOut, Check, Copy } from "@phosphor-icons/react";
import type { Address } from "viem";
import { explorerAddressUrl, explorerTxUrl } from "@/config/chains";
import { useAddressName, type AddressKind } from "@/lib/addressBook";
import { truncateAddress, truncateHash } from "@/lib/format";
import { AddressNameButton } from "./AddressName";
import { useToast } from "./Toast";

/**
 * Clipboard write with a fallback for non-secure contexts (plain-http preview
 * hosts, some embedded webviews) where navigator.clipboard is undefined.
 */
export async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

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
  const { toast } = useToast();

  useEffect(() => () => clearTimeout(timeout.current), []);

  const copy = useCallback(async () => {
    const ok = await writeClipboard(value);
    if (ok) {
      setCopied(true);
      clearTimeout(timeout.current);
      timeout.current = setTimeout(() => setCopied(false), 1400);
      return;
    }
    // Previously this failed silently. For an address the user is about to
    // paste into a wallet, a silent failure means they paste whatever was on
    // the clipboard before, so say so explicitly.
    toast({
      id: "copy-failed",
      tone: "warn",
      title: "Could not copy",
      description: `The browser blocked clipboard access. Select the ${label} manually; the full value is shown on hover.`,
    });
  }, [value, label, toast]);

  return (
    <>
      <button
        type="button"
        onClick={copy}
        title={`Copy ${label}`}
        aria-label={`Copy ${label}`}
        className={clsx(
          "inline-flex size-8 cursor-pointer items-center justify-center rounded",
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
 * On-chain address: saved name (if any), truncated monospace value, copy
 * action, explorer link, and optionally a "name this" action.
 *
 * A saved name is shown BESIDE the address, never in place of it: the hex
 * stays visible so a wrong or stale label cannot hide which address is really
 * there. The explorer link is omitted rather than broken when the chain is
 * unknown: a dead link on a fund-moving screen is worse than no link.
 */
export function AddressDisplay({
  address,
  chainId,
  label = "address",
  chars = 4,
  full = false,
  showCopy = true,
  showExplorer = true,
  showName = true,
  nameable,
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
  /** Show the locally saved name next to the address. */
  showName?: boolean;
  /** Offer the "add a name / rename" action. */
  nameable?: { kind: AddressKind; role?: "vault" | "agent" | "recovery" | "owner" | "token" };
  className?: string;
  tone?: "default" | "dim";
}) {
  const saved = useAddressName(chainId, address);

  if (!address) {
    return <span className={clsx("tnum text-text-faint", className)}>-</span>;
  }

  const href = showExplorer ? explorerAddressUrl(chainId, address) : null;
  const named = showName && saved;

  return (
    <span className={clsx("inline-flex min-w-0 items-center gap-1.5", className)}>
      {named && (
        <span
          className="max-w-[16ch] truncate text-[13px] font-medium text-text sm:max-w-[22ch]"
          title={saved.note ? `${saved.name} · ${saved.note}` : saved.name}
        >
          {saved.name}
        </span>
      )}
      <span
        className={clsx(
          "tnum",
          named ? "text-[12px] text-text-faint" : "text-[13px]",
          full && "break-all",
          !named && (tone === "dim" ? "text-text-dim" : "text-text"),
        )}
        title={address}
      >
        {full ? address : truncateAddress(address, named ? Math.min(chars, 4) : chars)}
      </span>
      {showCopy && <CopyButton value={address} label={label} />}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={`View ${label} on the block explorer`}
          aria-label={`View ${label} on the block explorer`}
          className="inline-flex size-8 cursor-pointer items-center justify-center rounded text-text-faint transition-colors duration-150 hover:bg-ink-800 hover:text-text"
        >
          <ArrowSquareOut size={13} aria-hidden />
        </a>
      )}
      {nameable && (
        <AddressNameButton
          chainId={chainId}
          address={address as Address}
          kind={nameable.kind}
          role={nameable.role}
          label={label}
        />
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
