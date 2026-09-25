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
          factory this app knows about.
        </p>
      </div>

      <Panel>
        <PanelHeader title="Vault address" />
        <PanelBody>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field
              label="Address"
              result={value ? result : undefined}
              hint="Works for a factory clone or a standalone Nostrom.sol deployment (both expose the same status() and ping() interface)."
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

      <Notice tone="info" title="Verify before you deposit">
        Any contract can implement the same interface. When a factory is configured, Nostrom checks{" "}
        <code className="font-mono text-[12px]">isVault()</code> and flags an address it cannot
        verify, but read the source on the explorer before sending funds to a vault you did not
        create.
      </Notice>
    </div>
  );
}
