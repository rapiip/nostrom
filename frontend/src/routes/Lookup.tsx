import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isAddress, type Address } from "viem";
import {
  AddressBook,
  ArrowRight,
  ClockCounterClockwise,
  DownloadSimple,
  MagnifyingGlass,
  Trash,
  UploadSimple,
  Vault as VaultIcon,
  Wallet as WalletIcon,
  X,
} from "@phosphor-icons/react";
import { validateAddressField } from "@/lib/validation";
import { formatRelative, truncateAddress } from "@/lib/format";
import { forgetVault, RECENT_VAULTS_MAX, useRecentVaults } from "@/lib/recentVaults";
import {
  exportAddressBook,
  importAddressBook,
  removeAddressName,
  useAddressBook,
  useNameResolver,
  type AddressName,
} from "@/lib/addressBook";
import { useClock } from "@/hooks/useClock";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useWallet } from "@/hooks/useWallet";
import { Button } from "@/components/ui/Button";
import { AddressDisplay } from "@/components/ui/Address";
import { AddressNameButton } from "@/components/ui/AddressName";
import { Field, Input } from "@/components/ui/Field";
import { Notice, Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { useToast } from "@/components/ui/Toast";

/**
 * Open a vault by address, or by the name you gave it.
 *
 * This is the escape hatch that keeps the console useful without the registry:
 * a standalone Nostrom.sol deployment, a vault on a chain with no factory, or
 * somebody else's vault you want to watch as a keeper. Monitoring and execution
 * need only an address.
 *
 * The input doubles as a search over the local address book: typing a name
 * filters saved vaults, typing 0x… validates an address. Nobody should have to
 * keep a text file of hex strings to find "the staging agent's vault".
 */
export function Lookup() {
  useDocumentTitle("Open a vault");
  const navigate = useNavigate();
  const wallet = useWallet();
  const [value, setValue] = useState("");
  const book = useAddressBook(wallet.chainId);

  const trimmed = value.trim();
  const looksLikeAddress = /^0x/i.test(trimmed);
  const result = trimmed && looksLikeAddress ? validateAddressField(trimmed, "Vault address") : { ok: false };

  // Name search: only vaults, because opening an agent wallet as a vault
  // lands on "no vault at this address".
  const matches = useMemo(() => {
    if (!trimmed || looksLikeAddress) return [];
    const q = trimmed.toLowerCase();
    return book
      .filter((e) => e.kind === "vault")
      .filter((e) => e.name.toLowerCase().includes(q) || e.note?.toLowerCase().includes(q))
      .slice(0, 6);
  }, [book, trimmed, looksLikeAddress]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isAddress(trimmed)) {
      void navigate(`/app/vault/${trimmed}`);
    } else if (matches.length > 0) {
      // Enter on a name opens the best match, like a command palette.
      void navigate(`/app/vault/${matches[0]!.address}`);
    }
  };

  const hasVaultNames = book.some((e) => e.kind === "vault");

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-medium tracking-[-0.02em] text-text">Open a vault</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-text-dim">
          Paste a vault address, or type the name you gave it. Watching is public, so no wallet is
          needed.
        </p>
      </div>

      <Panel>
        <PanelHeader title="Find a vault" />
        <PanelBody>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field
              label={hasVaultNames ? "Address or name" : "Address"}
              result={trimmed && looksLikeAddress ? result : undefined}
              revealErrors={trimmed.length >= 42}
              hint={
                hasVaultNames
                  ? "A 0x… address, or part of a name you saved."
                  : "Starts with 0x and is 42 characters long. Copy it from the explorer, your agent's config or the vault list."
              }
            >
              {(a11y) => (
                <Input
                  {...a11y}
                  mono={looksLikeAddress || !trimmed}
                  value={value}
                  // Addresses copied from explorers and chat often carry
                  // surrounding whitespace or a trailing newline.
                  onChange={(e) => setValue(e.target.value)}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData("text").trim();
                    if (pasted) {
                      e.preventDefault();
                      setValue(pasted);
                    }
                  }}
                  placeholder={hasVaultNames ? "0x… or a name" : "0x…"}
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoFocus
                  enterKeyHint="go"
                  role={matches.length > 0 ? "combobox" : undefined}
                  aria-expanded={matches.length > 0 ? true : undefined}
                  aria-controls={matches.length > 0 ? "name-matches" : undefined}
                  aria-autocomplete={hasVaultNames ? "list" : undefined}
                />
              )}
            </Field>

            {trimmed && !looksLikeAddress && (
              <div>
                {matches.length > 0 ? (
                  <ul
                    id="name-matches"
                    aria-label="Saved vaults matching your search"
                    className="overflow-hidden rounded border border-line"
                  >
                    {matches.map((m, i) => (
                      <li key={m.address} className="border-b border-line last:border-b-0">
                        <Link
                          to={`/app/vault/${m.address}`}
                          className="group flex min-h-[48px] items-center gap-3 px-3.5 py-2 no-underline transition-colors duration-150 hover:bg-ink-850"
                        >
                          <VaultIcon size={15} className="shrink-0 text-text-faint" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-text">
                              <Highlight text={m.name} query={trimmed} />
                            </span>
                            <span className="tnum block truncate text-[11px] text-text-faint">
                              {truncateAddress(m.address, 6)}
                              {m.note && <> · {m.note}</>}
                            </span>
                          </span>
                          {i === 0 && (
                            <kbd className="hidden rounded border border-line-strong px-1.5 py-0.5 font-mono text-[10.5px] text-text-faint sm:inline">
                              Enter
                            </kbd>
                          )}
                          <ArrowRight
                            size={12}
                            aria-hidden
                            className="shrink-0 text-text-faint transition-transform duration-200 group-hover:translate-x-0.5"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12px] text-text-faint" role="status">
                    {hasVaultNames
                      ? `No saved vault is named “${trimmed}”.`
                      : "You have not named any vaults yet. Paste an address instead."}
                  </p>
                )}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              disabled={!(result.ok || matches.length > 0)}
              icon={<MagnifyingGlass size={14} aria-hidden />}
              className="self-start"
            >
              Open vault
            </Button>
          </form>
        </PanelBody>
      </Panel>

      <RecentVaults chainId={wallet.chainId} chainName={wallet.chainName} />

      <SavedNames chainId={wallet.chainId} chainName={wallet.chainName} entries={book} />

      <Notice tone="info" title="How vaults are verified">
        Every address is checked against the factory registry. A vault deployed some other way can
        still be watched and executed here, but it is clearly marked as unverified so a look-alike
        contract cannot pass as the real thing.
      </Notice>
    </div>
  );
}

/** Bold the matched part of a name. Text only; never HTML. */
function Highlight({ text, query }: { text: string; query: string }) {
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[2px] bg-signal/15 text-signal">{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}

/* ===========================================================================
   Recently opened
   =========================================================================== */

function RecentVaults({ chainId, chainName }: { chainId: number; chainName: string | undefined }) {
  const recent = useRecentVaults(chainId).slice(0, RECENT_VAULTS_MAX);
  const nameOf = useNameResolver(chainId);
  const now = useClock();

  if (recent.length === 0) return null;

  return (
    <Panel>
      <PanelHeader
        title={
          <span className="inline-flex items-center gap-2">
            <ClockCounterClockwise size={15} className="text-text-faint" aria-hidden />
            Recently opened
          </span>
        }
        description={chainName ?? `Chain ${chainId}`}
      />
      <ul className="flex flex-col">
        {recent.map((v) => {
          const saved = nameOf(v.address);
          return (
            <li key={v.address} className="flex items-center gap-1 border-b border-line pr-2 last:border-b-0">
              <Link
                to={`/app/vault/${v.address}`}
                className="group flex min-h-[52px] min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 px-4 py-2 no-underline transition-colors duration-150 hover:bg-ink-850 sm:px-5"
              >
                <span className="min-w-0">
                  {saved ? (
                    <>
                      <span className="block truncate text-[13px] font-medium text-text">
                        {saved.name}
                      </span>
                      <span className="tnum block truncate text-[11px] text-text-faint" title={v.address}>
                        {truncateAddress(v.address, 6)}
                      </span>
                    </>
                  ) : (
                    <span className="tnum block truncate text-[13px] text-text" title={v.address}>
                      {truncateAddress(v.address, 8)}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-[11px] text-text-faint">
                  {formatRelative(Math.floor(v.openedAt / 1000), now)}
                  <ArrowRight
                    size={12}
                    aria-hidden
                    className="transition-transform duration-200 group-hover:translate-x-0.5"
                  />
                </span>
              </Link>
              <AddressNameButton
                chainId={chainId}
                address={v.address}
                kind="vault"
                role="vault"
                label="vault"
                className="size-11"
              />
              <button
                type="button"
                onClick={() => forgetVault(v.chainId, v.address)}
                aria-label={`Remove ${saved?.name ?? truncateAddress(v.address, 6)} from recent vaults`}
                title="Remove from list"
                className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded text-text-faint transition-colors duration-150 hover:bg-ink-800 hover:text-text"
              >
                <X size={13} aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ===========================================================================
   Saved names (the address book)
   =========================================================================== */

function SavedNames({
  chainId,
  chainName,
  entries,
}: {
  chainId: number;
  chainName: string | undefined;
  entries: AddressName[];
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const download = () => {
    const blob = new Blob([exportAddressBook()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nostrom-names-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const upload = async (file: File) => {
    // A name file is a few KB; anything far larger is not one.
    if (file.size > 512 * 1024) {
      toast({ id: "names-import", tone: "danger", title: "File too large", description: "That is not a Nostrom names file." });
      return;
    }
    try {
      const { added, updated, skipped } = importAddressBook(await file.text());
      toast({
        id: "names-import",
        tone: added + updated > 0 ? "signal" : "info",
        title: added + updated > 0 ? `Imported ${added + updated} name${added + updated === 1 ? "" : "s"}` : "Nothing new to import",
        description:
          [added && `${added} new`, updated && `${updated} updated`, skipped && `${skipped} skipped`]
            .filter(Boolean)
            .join(" · ") || "Every name in the file is already here.",
      });
    } catch {
      toast({
        id: "names-import",
        tone: "danger",
        title: "Could not read that file",
        description: "Choose a file exported from Nostrom (Export names).",
      });
    }
  };

  return (
    <Panel>
      <PanelHeader
        title={
          <span className="inline-flex items-center gap-2">
            <AddressBook size={15} className="text-text-faint" aria-hidden />
            Saved names
          </span>
        }
        description={
          entries.length > 0
            ? `${entries.length} on ${chainName ?? `chain ${chainId}`}. Export them to keep a backup or move them to another device.`
            : "Give vaults and wallets a name so you know which agent is which."
        }
      />

      {entries.length === 0 ? (
        <PanelBody>
          <p className="text-[13px] leading-relaxed text-text-dim">
            Use the <span className="text-text">tag</span> icon next to any vault, agent or recovery
            address to name it. Names then show up here, in your vault list, and in the activity log.
          </p>
        </PanelBody>
      ) : (
        <ul className="flex flex-col">
          {entries.map((e) => (
            <li
              key={e.address}
              className="flex items-center gap-3 border-b border-line py-2.5 pr-2 pl-4 last:border-b-0 sm:pl-5"
            >
              {e.kind === "vault" ? (
                <VaultIcon size={15} className="shrink-0 text-text-faint" aria-label="Vault" />
              ) : (
                <WalletIcon size={15} className="shrink-0 text-text-faint" aria-label="Wallet" />
              )}
              <div className="min-w-0 flex-1">
                {e.kind === "vault" ? (
                  <Link
                    to={`/app/vault/${e.address}`}
                    className="block truncate text-[13px] font-medium text-text underline decoration-line-strong underline-offset-2 hover:decoration-text-faint"
                  >
                    {e.name}
                  </Link>
                ) : (
                  <span className="block truncate text-[13px] font-medium text-text">{e.name}</span>
                )}
                <div className="flex min-w-0 items-center gap-1">
                  <AddressDisplay
                    address={e.address}
                    chainId={chainId}
                    label={`${e.name} address`}
                    showName={false}
                    showExplorer={false}
                    tone="dim"
                  />
                  {e.note && <span className="truncate text-[11px] text-text-faint">· {e.note}</span>}
                </div>
              </div>
              <AddressNameButton chainId={chainId} address={e.address} kind={e.kind} label={e.name} className="size-11" />
              <button
                type="button"
                onClick={() => {
                  removeAddressName(chainId, e.address as Address);
                  toast({
                    id: "name-removed",
                    tone: "info",
                    title: `Removed “${e.name}”`,
                    action: {
                      label: "Undo",
                      onClick: () => importAddressBook(JSON.stringify([e])),
                    },
                  });
                }}
                aria-label={`Delete the name ${e.name}`}
                title="Delete name"
                className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded text-text-faint transition-colors duration-150 hover:bg-ink-800 hover:text-danger"
              >
                <Trash size={13} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 sm:px-5">
        <Button
          variant="secondary"
          size="sm"
          icon={<DownloadSimple size={13} aria-hidden />}
          onClick={download}
          disabled={entries.length === 0}
        >
          Export names
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<UploadSimple size={13} aria-hidden />}
          onClick={() => fileRef.current?.click()}
        >
          Import
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(ev) => {
            const f = ev.target.files?.[0];
            ev.target.value = "";
            if (f) void upload(f);
          }}
        />
      </div>
    </Panel>
  );
}
