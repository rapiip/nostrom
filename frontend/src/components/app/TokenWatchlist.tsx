import { useState } from "react";
import { Coins, Plus, Trash } from "@phosphor-icons/react";
import type { Address } from "viem";
import { PROTOCOL } from "@/config/contracts";
import { formatAmount } from "@/lib/format";
import { normalizeAddress, validateAddressField } from "@/lib/validation";
import { useTrackedTokenDetails } from "@/hooks/useVault";
import type { VaultActions } from "@/hooks/useVaultActions";
import type { VaultCapabilities, VaultView } from "@/lib/vaultState";
import { Button } from "@/components/ui/Button";
import { AddressDisplay } from "@/components/ui/Address";
import { Field, Input } from "@/components/ui/Field";
import { EmptyState, Label, Notice, Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";

/**
 * ERC-20 sweep watchlist.
 *
 * The EVM gives no way to enumerate a contract's token holdings, so tokens must
 * be registered explicitly to be rescued. That constraint is the reason this
 * panel exists, and it is stated up front — otherwise "why do I have to add my
 * tokens?" is a reasonable and unanswered question.
 *
 * Token metadata is read in one batch. A token whose balanceOf reverts is shown
 * as unreadable rather than hidden, because that is exactly the kind of token the
 * sweep is hardened against and the owner should know it is on the list.
 */
export function TokenWatchlist({
  view,
  capabilities,
  actions,
  trackedTokens,
  chainId,
}: {
  view: VaultView;
  capabilities: VaultCapabilities;
  actions: VaultActions;
  trackedTokens: readonly Address[];
  chainId: number | undefined;
}) {
  const [newToken, setNewToken] = useState("");
  const details = useTrackedTokenDetails(view.address, trackedTokens);

  const addResult = newToken ? validateAddressField(newToken, "Token address") : { ok: false };
  const alreadyTracked =
    normalizeAddress(newToken) !== null &&
    trackedTokens.some((t) => t.toLowerCase() === newToken.trim().toLowerCase());
  const atLimit = trackedTokens.length >= PROTOCOL.MAX_TRACKED_TOKENS;

  return (
    <Panel>
      <PanelHeader
        title="ERC-20 watchlist"
        description={`Tokens swept to the recovery address when the switch fires. Native BOT is always rescued and needs no registration. ${trackedTokens.length} of ${PROTOCOL.MAX_TRACKED_TOKENS} slots used.`}
      />

      {trackedTokens.length === 0 ? (
        <EmptyState
          icon={<Coins size={24} aria-hidden />}
          title="No tokens tracked"
          description="The EVM cannot enumerate a contract's token holdings, so any ERC-20 you want rescued has to be registered here. Native BOT is unaffected — it is always swept."
        />
      ) : (
        <div>
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 border-b border-line px-4 py-2.5 sm:grid sm:px-5">
            <Label>Token</Label>
            <Label>Vault balance</Label>
            <span className="sr-only">Actions</span>
          </div>

          <ul>
            {details.map((token) => (
              <li
                key={token.address}
                className="grid gap-3 border-b border-line px-4 py-3.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center sm:px-5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-text">{token.symbol}</span>
                    {!token.readable && (
                      <span
                        className="rounded border border-warn-dim px-1.5 py-0.5 text-[10px] text-warn"
                        title="balanceOf did not return a readable value. The sweep isolates each token, so this one will be skipped rather than blocking the rescue."
                      >
                        unreadable
                      </span>
                    )}
                  </div>
                  <AddressDisplay
                    address={token.address}
                    chainId={chainId}
                    label="token address"
                    tone="dim"
                    className="mt-1"
                  />
                </div>

                <div>
                  <span className="sm:hidden">
                    <Label>Vault balance</Label>
                  </span>
                  <p className="tnum mt-1 text-[13px] text-text sm:mt-0">
                    {token.readable
                      ? formatAmount(token.balance, { decimals: token.decimals })
                      : "—"}
                  </p>
                </div>

                {capabilities.canManageTokens && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash size={13} aria-hidden />}
                    onClick={() => actions.removeTrackedToken(token.address)}
                    aria-label={`Remove ${token.symbol} from the watchlist`}
                    className="justify-self-start sm:justify-self-end"
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* --- Owner: add --- */}
      {capabilities.canManageTokens && (
        <PanelBody className="border-t border-line">
          {atLimit ? (
            <Notice tone="warn" title="Watchlist full">
              A vault can track at most {PROTOCOL.MAX_TRACKED_TOKENS} ERC-20s, so the rescue
              transaction always fits inside the block gas limit. Remove one to add another.
            </Notice>
          ) : (
            <Field
              label="Add a token"
              result={
                alreadyTracked
                  ? { ok: false, error: "This token is already on the watchlist." }
                  : newToken
                    ? addResult
                    : undefined
              }
              hint="The contract accepts any address. A non-standard or non-ERC-20 token is swept in isolation and skipped on failure, so it cannot brick the rescue."
            >
              {(a11y) => (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    {...a11y}
                    mono
                    value={newToken}
                    onChange={(e) => setNewToken(e.target.value)}
                    placeholder="0x…"
                    spellCheck={false}
                    className="flex-1"
                    invalid={Boolean(newToken) && (!addResult.ok || alreadyTracked)}
                  />
                  <Button
                    variant="secondary"
                    icon={<Plus size={13} aria-hidden />}
                    disabled={!addResult.ok || alreadyTracked}
                    onClick={() => {
                      actions.addTrackedToken(normalizeAddress(newToken)!);
                      setNewToken("");
                    }}
                  >
                    Track token
                  </Button>
                </div>
              )}
            </Field>
          )}
        </PanelBody>
      )}

      {/* --- Post-trigger sweeps, open to anyone --- */}
      {capabilities.canSweep && trackedTokens.length > 0 && (
        <PanelBody className="border-t border-line">
          <h3 className="text-[13px] font-medium text-text">Sweep remaining balances</h3>
          <p className="mt-1 max-w-[64ch] text-[12px] leading-relaxed text-text-dim">
            Permissionless, post-trigger, and the destination is fixed to the recovery address. Works
            for tokens that were never on the watchlist too.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {details
              .filter((t) => (t.balance ?? 0n) > 0n)
              .map((t) => (
                <Button
                  key={t.address}
                  variant="secondary"
                  size="sm"
                  loading={actions.tx.isBusy}
                  onClick={() => actions.sweepToken(t.address, t.symbol)}
                >
                  Sweep {formatAmount(t.balance, { decimals: t.decimals })} {t.symbol}
                </Button>
              ))}
            {details.every((t) => (t.balance ?? 0n) === 0n) && (
              <p className="text-[12px] text-text-faint">
                All tracked token balances are zero — nothing left to sweep.
              </p>
            )}
          </div>
        </PanelBody>
      )}
    </Panel>
  );
}
