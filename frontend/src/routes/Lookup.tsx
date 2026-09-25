import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { isAddress } from "viem";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { validateAddressField } from "@/lib/validation";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Notice, Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";

/**
 * Open a vault by address.
 *
 * This is the escape hatch that keeps the console useful without the registry:
 * a standalone Nostrom.sol deployment, a vault on a chain with no factory, or
 * somebody else's vault you want to watch as a keeper. Monitoring and execution
 * need only an address.
 */
export function Lookup() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");

  const result = value ? validateAddressField(value, "Vault address") : { ok: false };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAddress(value.trim())) return;
    void navigate(`/app/vault/${value.trim()}`);
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-medium tracking-[-0.02em] text-text">Open a vault</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-text-dim">
          Any Nostrom vault address, whether or not you own it and whether or not it came from the
          factory this app knows about. Read-only unless you hold a key the contract recognises.
        </p>
      </div>

      <Panel>
        <PanelHeader title="Vault address" />
        <PanelBody>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field
              label="Address"
              result={value ? result : undefined}
              hint="Works for a factory clone or a standalone Nostrom.sol deployment — both expose the same status() and ping() interface."
            >
              {(a11y) => (
                <Input
                  {...a11y}
                  mono
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="0x…"
                  spellCheck={false}
                  autoComplete="off"
                  autoFocus
                  invalid={Boolean(value) && !result.ok}
                />
              )}
            </Field>

            <Button
              type="submit"
              variant="primary"
              disabled={!result.ok}
              icon={<MagnifyingGlass size={14} aria-hidden />}
              className="self-start"
            >
              Open vault
            </Button>
          </form>
        </PanelBody>
      </Panel>

      {/* This warning is deliberately a warning, not a reassurance.
          Any contract can implement the same function signatures, so an address
          that merely "looks like" a vault can be a look-alike built to receive
          deposits. `isVault()` is the factory's own check and the repository
          README says to gate a frontend on it — but it can only vouch for vaults
          from the factory this app is configured with. Telling the user that
          unverified addresses are "fully inspectable" while omitting that they
          are also unverified inverts the intent of the check. */}
      <Notice tone="warn" title="Verify before you deposit">
        When a factory is configured, Nostrom checks{" "}
        <code className="font-mono text-[12px]">isVault()</code> and flags any address it cannot
        vouch for. That check cannot cover a vault from another factory or a standalone deployment,
        and any contract can copy this interface — so read the source on the explorer before sending
        funds to a vault you did not create yourself. Monitoring and execution are safe on any
        address; depositing is not.
      </Notice>
    </div>
  );
}
