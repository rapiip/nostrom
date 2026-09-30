import { clsx } from "clsx";
import { useId, useState } from "react";
import type { Address } from "viem";
import { PencilSimple, Tag } from "@phosphor-icons/react";
import {
  NAME_MAX,
  NOTE_MAX,
  cleanText,
  removeAddressName,
  setAddressName,
  useAddressName,
  type AddressKind,
} from "@/lib/addressBook";
import { truncateAddress } from "@/lib/format";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Input } from "./Field";
import { useToast } from "./Toast";

/**
 * Naming UI for the local address book (lib/addressBook.ts).
 *
 *   <AddressNameButton>   tag icon that opens the editor; shows a pencil once named
 *   <NameAddressDialog>   the editor itself: name, optional note, remove
 *
 * Names are stored locally (see lib/addressBook.ts); the UI does not
 * currently call that out.
 */

const SUGGESTIONS: Record<string, string[]> = {
  vault: ["Treasury", "Trading agent", "Ops budget", "Test vault"],
  agent: ["Agent · prod", "Agent · staging", "Heartbeat key"],
  recovery: ["Cold wallet", "Ledger", "Multisig"],
  owner: ["My wallet", "Multisig", "Team wallet"],
};

export function NameAddressDialog({
  open,
  onClose,
  chainId,
  address,
  kind,
  role,
}: {
  open: boolean;
  onClose: () => void;
  chainId: number;
  address: Address;
  kind: AddressKind;
  /** Picks the suggestion chips and the wording. */
  role?: "vault" | "agent" | "recovery" | "owner" | "token";
}) {
  // The editor body is keyed on `open` so every opening starts from the saved
  // value rather than from whatever was typed and abandoned last time.
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={role === "vault" ? "Name this vault" : "Name this address"}
      size="sm"
    >
      {open && (
        <NameForm
          chainId={chainId}
          address={address}
          kind={kind}
          role={role}
          onDone={onClose}
        />
      )}
    </Dialog>
  );
}

function NameForm({
  chainId,
  address,
  kind,
  role,
  onDone,
}: {
  chainId: number;
  address: Address;
  kind: AddressKind;
  role?: string;
  onDone: () => void;
}) {
  const saved = useAddressName(chainId, address);
  const [name, setName] = useState(saved?.name ?? "");
  const [note, setNote] = useState(saved?.note ?? "");
  const nameId = useId();
  const noteId = useId();
  const { toast } = useToast();

  const clean = cleanText(name, NAME_MAX);
  const suggestions = (role && SUGGESTIONS[role]) || [];

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!clean) return;
    setAddressName(chainId, address, clean, { note, kind });
    toast({ id: "name-saved", tone: "signal", title: `Saved as “${clean}”` });
    onDone();
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <p className="tnum rounded border border-line bg-ink-800 px-3 py-2 text-[12px] break-all text-text-dim">
        {address}
      </p>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <label htmlFor={nameId} className="text-[13px] font-medium text-text">
            Name
          </label>
          <span className="tnum text-[11px] text-text-faint" aria-hidden>
            {name.length}/{NAME_MAX}
          </span>
        </div>
        <Input
          id={nameId}
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
          placeholder={suggestions[0] ?? "e.g. Trading agent"}
          maxLength={NAME_MAX}
          autoComplete="off"
          data-autofocus
        />
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Suggestions">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setName(s)}
                className="min-h-[32px] cursor-pointer rounded-full border border-line-strong bg-ink-850 px-3 text-[12px] text-text-dim transition-colors duration-150 hover:border-text-faint hover:text-text"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={noteId} className="text-[13px] font-medium text-text">
          Note <span className="font-normal text-text-faint">(optional)</span>
        </label>
        <Input
          id={noteId}
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
          placeholder="Which server, which strategy, who to call…"
          maxLength={NOTE_MAX}
          autoComplete="off"
        />
      </div>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        {saved ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              removeAddressName(chainId, address);
              toast({ id: "name-saved", tone: "info", title: "Name removed" });
              onDone();
            }}
          >
            Remove name
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!clean}>
            Save name
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * Icon button that opens the editor. A tag when unnamed ("add a name"), a
 * pencil once named ("rename"), so the state is visible at a glance.
 */
export function AddressNameButton({
  chainId,
  address,
  kind,
  role,
  label = "address",
  className,
  withText = false,
}: {
  chainId: number | undefined;
  address: Address | undefined;
  kind: AddressKind;
  role?: "vault" | "agent" | "recovery" | "owner" | "token";
  /** Used in the accessible name, e.g. "agent address". */
  label?: string;
  className?: string;
  /** Show "Add name" / "Rename" text next to the icon. */
  withText?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const saved = useAddressName(chainId, address);
  if (chainId === undefined || !address) return null;

  const verb = saved ? "Rename" : "Add a name to";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={saved ? `Rename “${saved.name}”` : `Name this ${label}`}
        aria-label={`${verb} ${label} ${truncateAddress(address, 4)}`}
        className={clsx(
          "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded text-text-faint transition-colors duration-150 hover:bg-ink-800 hover:text-text",
          withText ? "min-h-[32px] px-2 text-[12px]" : "size-8",
          className,
        )}
      >
        {saved ? <PencilSimple size={13} aria-hidden /> : <Tag size={13} aria-hidden />}
        {withText && <span>{saved ? "Rename" : "Add name"}</span>}
      </button>
      <NameAddressDialog
        open={open}
        onClose={() => setOpen(false)}
        chainId={chainId}
        address={address}
        kind={kind}
        role={role}
      />
    </>
  );
}
