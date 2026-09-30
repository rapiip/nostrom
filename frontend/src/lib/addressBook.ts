import { useSyncExternalStore } from "react";
import { getAddress, isAddress, type Address } from "viem";

/**
 * Local address book: human names for addresses, per chain, in localStorage.
 *
 * A vault, its agent key and its recovery wallet are three 42-character hex
 * strings, and after a few of each nobody remembers which agent 0x7099… was.
 * A name ("Trading agent · prod") is attached to an address on one chain and
 * shown next to it everywhere it appears.
 *
 * Design rules:
 *   - Private by construction. Names never leave this browser: no backend, no
 *     chain write, nothing in the URL. Export/import is the only way to move
 *     them, and it is explicit.
 *   - Per chain. The same address on another chain is, for a contract, an
 *     unrelated contract; carrying a vault's name across would mislabel it.
 *   - A name is shown BESIDE the address, never instead of it. A stale or
 *     mistaken label must not be able to hide which address is really there.
 *   - Rendered as React text only, so a name can never inject markup.
 *
 * Storage failures (private mode, quota, disabled storage) degrade to "no
 * names", never to an error.
 */

const KEY = "nostrom:address-book:v1";
export const NAME_MAX = 40;
export const NOTE_MAX = 140;
/** Guards import against pathological files. */
const MAX_ENTRIES = 1000;

export type AddressKind = "vault" | "account";

export interface AddressName {
  chainId: number;
  address: Address;
  name: string;
  note?: string;
  /**
   * What the address is. Lookup only suggests vaults: opening an agent wallet
   * as if it were a vault just lands on "no vault at this address".
   */
  kind: AddressKind;
  /** Milliseconds since epoch. */
  updatedAt: number;
}

type Book = Record<string, AddressName>;

const keyOf = (chainId: number, address: string) => `${chainId}:${address.toLowerCase()}`;

/** Trim, collapse whitespace, strip control characters, cap length. */
export function cleanText(value: string, max: number): string {
  return (
    value
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max)
  );
}

function isEntry(v: unknown): v is AddressName {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.chainId === "number" &&
    Number.isInteger(e.chainId) &&
    typeof e.address === "string" &&
    isAddress(e.address) &&
    typeof e.name === "string" &&
    e.name.trim().length > 0 &&
    (e.note === undefined || typeof e.note === "string") &&
    (e.kind === undefined || e.kind === "vault" || e.kind === "account") &&
    typeof e.updatedAt === "number"
  );
}

function normalise(e: AddressName): AddressName {
  const note = e.note ? cleanText(e.note, NOTE_MAX) : "";
  return {
    chainId: e.chainId,
    address: getAddress(e.address),
    name: cleanText(e.name, NAME_MAX),
    ...(note ? { note } : {}),
    kind: e.kind === "vault" ? "vault" : "account",
    updatedAt: e.updatedAt,
  };
}

/* ===========================================================================
   Store
   =========================================================================== */

const listeners = new Set<() => void>();
let cache: { raw: string | null; value: Book } = { raw: null, value: {} };

function read(): Book {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return cache.value;
  }
  // useSyncExternalStore needs a referentially stable snapshot between
  // changes, so parse only when the stored string changed.
  if (raw === cache.raw) return cache.value;
  const value: Book = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      for (const item of parsed.slice(0, MAX_ENTRIES)) {
        if (!isEntry(item)) continue;
        const e = normalise(item);
        if (e.name) value[keyOf(e.chainId, e.address)] = e;
      }
    }
  } catch {
    // Corrupt value: behave as empty rather than throwing on every render.
  }
  cache = { raw, value };
  return value;
}

function write(book: Book) {
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.values(book)));
  } catch {
    // Storage unavailable; names simply do not persist.
  }
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  // Keep other tabs in sync.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) fn();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

const EMPTY_BOOK: Book = {};
const useBook = () => useSyncExternalStore(subscribe, read, () => EMPTY_BOOK);

/* ===========================================================================
   Hooks
   =========================================================================== */

/** The saved name for one address on one chain, if any. Re-renders on change. */
export function useAddressName(
  chainId: number | undefined,
  address: string | undefined,
): AddressName | undefined {
  const book = useBook();
  if (chainId === undefined || !address) return undefined;
  return book[keyOf(chainId, address)];
}

/**
 * A lookup function for many addresses at once (lists, event logs). The
 * function identity changes whenever the book changes, so memoised consumers
 * recompute.
 */
export function useNameResolver(chainId: number | undefined) {
  const book = useBook();
  return (address: string | undefined) =>
    chainId === undefined || !address ? undefined : book[keyOf(chainId, address)];
}

/** Every saved name on a chain, most recently edited first. */
export function useAddressBook(chainId: number | undefined): AddressName[] {
  const book = useBook();
  if (chainId === undefined) return [];
  return Object.values(book)
    .filter((e) => e.chainId === chainId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/* ===========================================================================
   Mutations
   =========================================================================== */

/**
 * Save (or, with an empty name, remove) the name for an address. `kind` is
 * sticky: once an address is known to be a vault, renaming it from a context
 * that only knows "address" does not downgrade it.
 */
export function setAddressName(
  chainId: number,
  address: Address,
  name: string,
  opts: { note?: string; kind?: AddressKind } = {},
) {
  const cleanName = cleanText(name, NAME_MAX);
  const book = { ...read() };
  const k = keyOf(chainId, address);
  if (!cleanName) {
    delete book[k];
  } else {
    const cleanNote = opts.note ? cleanText(opts.note, NOTE_MAX) : "";
    const kind: AddressKind =
      opts.kind === "vault" || book[k]?.kind === "vault" ? "vault" : "account";
    book[k] = {
      chainId,
      address: getAddress(address),
      name: cleanName,
      ...(cleanNote ? { note: cleanNote } : {}),
      kind,
      updatedAt: Date.now(),
    };
  }
  write(book);
}

export function removeAddressName(chainId: number, address: Address) {
  const book = { ...read() };
  delete book[keyOf(chainId, address)];
  write(book);
}

/* ===========================================================================
   Export / import
   =========================================================================== */

const FORMAT = "nostrom-address-book";

/** Serialised book for download. Every chain, not only the current one. */
export function exportAddressBook(): string {
  return JSON.stringify(
    { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), entries: Object.values(read()) },
    null,
    2,
  );
}

/**
 * Merge an exported file into the local book. For an address present in both,
 * the more recently edited name wins, so importing an older backup never
 * overwrites a newer rename.
 */
export function importAddressBook(json: string): { added: number; updated: number; skipped: number } {
  const parsed: unknown = JSON.parse(json);
  const list: unknown =
    typeof parsed === "object" && parsed !== null && "entries" in parsed
      ? (parsed as { entries: unknown }).entries
      : parsed;
  if (!Array.isArray(list)) throw new Error("This file is not a Nostrom address book.");

  const book = { ...read() };
  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const item of list.slice(0, MAX_ENTRIES)) {
    if (!isEntry(item)) {
      skipped += 1;
      continue;
    }
    const e = normalise(item);
    if (!e.name) {
      skipped += 1;
      continue;
    }
    const k = keyOf(e.chainId, e.address);
    const existing = book[k];
    if (!existing) {
      book[k] = e;
      added += 1;
    } else if (e.updatedAt > existing.updatedAt && (e.name !== existing.name || e.note !== existing.note)) {
      book[k] = e;
      updated += 1;
    }
  }
  write(book);
  return { added, updated, skipped };
}
