import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isAddress } from "viem";
import { ArrowRight, ClockCounterClockwise, MagnifyingGlass, X } from "@phosphor-icons/react";
import { validateAddressField } from "@/lib/validation";
import { formatRelative, truncateAddress } from "@/lib/format";
import { forgetVault, RECENT_VAULTS_MAX, useRecentVaults } from "@/lib/recentVaults";
import { useClock } from "@/hooks/useClock";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useWallet } from "@/hooks/useWallet";
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
  useDocumentTitle("Open a vault");
  const navigate = useNavigate();
  const wallet = useWallet();
  const [value, setValue] = useState("");

  const trimmed = value.trim();
  const result = trimmed ? validateAddressField(trimmed, "Vault address") : { ok: false };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAddress(trimmed)) return;
    void navigate(`/app/vault/${trimmed}`);
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-medium tracking-[-0.02em] text-text">Open a vault</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-text-dim">
          Inspect real-time health, balance, countdown timers, and recovery settings for any deployed
          Nostrom vault contract. No wallet connection is required to watch one.
        </p>
      </div>

      <Panel>
        <PanelHeader title="Vault address" />
        <PanelBody>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field
              label="Address"
              result={trimmed ? result : undefined}
              hint="Enter any active Nostrom vault contract address on BOT Chain to inspect its live state."
            >
              {(a11y) => (
                <Input
                  {...a11y}
                  mono
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
                  placeholder="0x…"
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoFocus
                  enterKeyHint="go"
                  invalid={Boolean(trimmed) && !result.ok}
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

      <RecentVaults chainId={wallet.chainId} chainName={wallet.chainName} />

      <Notice tone="info" title="Registry verification">
        Vault addresses are verified against the official factory registry. Unregistered or custom
        deployments remain fully inspectable and executable, and are clearly marked as unverified.
      </Notice>
    </div>
  );
}

function RecentVaults({ chainId, chainName }: { chainId: number; chainName: string | undefined }) {
  const recent = useRecentVaults(chainId).slice(0, RECENT_VAULTS_MAX);
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
        description={`Stored in this browser only, for ${chainName ?? `chain ${chainId}`}.`}
      />
      <ul className="flex flex-col">
        {recent.map((v) => (
          <li key={v.address} className="flex items-center gap-2 border-b border-line pr-2 last:border-b-0">
            <Link
              to={`/app/vault/${v.address}`}
              className="group flex min-h-[48px] min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 px-4 no-underline transition-colors duration-150 hover:bg-ink-850 sm:px-5"
            >
              <span className="tnum truncate text-[13px] text-text" title={v.address}>
                {truncateAddress(v.address, 8)}
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
            <button
              type="button"
              onClick={() => forgetVault(v.chainId, v.address)}
              aria-label={`Remove ${truncateAddress(v.address, 6)} from recent vaults`}
              title="Remove from list"
              className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded text-text-faint transition-colors duration-150 hover:bg-ink-800 hover:text-text"
            >
              <X size={13} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
