import { clsx } from "clsx";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { supportedChains } from "@/config/chains";
import { factoryAddress, LINKS, PROTOCOL } from "@/config/contracts";
import { formatCount, formatDuration, truncateAddress } from "@/lib/format";
import { useFactoryInfo } from "@/hooks/useVault";
import { useReveal } from "@/hooks/useReveal";
import { AddressDisplay } from "@/components/ui/Address";
import { Section } from "./Section";

/**
 * Protocol information.
 *
 * Deployment status is reported truthfully per network: a chain with no
 * configured factory says so rather than showing a placeholder address. When a
 * factory IS configured for the chain the app is pointed at, the registry size
 * and implementation address are read live from it — this is the one section
 * where the landing page talks to the chain, and it is worth the round-trip
 * because "is this actually deployed" is the first question a reader has.
 *
 * Gas figures are the measured values from scripts/measure-gas.js, labelled as
 * measurements rather than promises.
 */

const GAS = [
  { op: "Deploy NostromFactory", gas: "~2,994,000", payer: "you, once" },
  { op: "createVault", gas: "~343,000", payer: "each user" },
  { op: "createVaultAndFund", gas: "~338,000", payer: "each user" },
  { op: "ping()", gas: "~37,600", payer: "the agent, every heartbeat" },
  { op: "deposit()", gas: "~25,700", payer: "each user" },
  { op: "executeDeadManSwitch()", gas: "~74,400", payer: "any keeper" },
];

export function ProtocolInfo() {
  const ref = useReveal<HTMLDivElement>();
  const { implementation, totalVaults, isLoading } = useFactoryInfo();

  return (
    <Section
      id="protocol"
      index="05"
      eyebrow="Protocol"
      title="Parameters, addresses and costs."
      lede="BOT Chain is EVM-compatible with a Geth-compatible JSON-RPC surface, so the standard toolchain applies with no chain-specific SDK. Contracts compile with solc 0.8.24, optimizer on at 200 runs, targeting the cancun EVM — BOT Chain has Shanghai and Cancun active, so PUSH0 is available and the bytecode is smaller."
    >
      <div ref={ref} className="grid gap-x-14 gap-y-14 lg:grid-cols-2">
        {/* --- Networks --- */}
        <div className="reveal">
          <h3 className="text-[15px] font-medium text-text">Networks</h3>
          <div className="mt-5 overflow-hidden rounded-md border border-line">
            {supportedChains.map((chain) => {
              const factory = factoryAddress(chain.id);
              return (
                <div
                  key={chain.id}
                  className="border-b border-line bg-ink-900 px-4 py-4 last:border-b-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="text-[14px] text-text">{chain.name}</span>
                    <span className="tnum text-[11px] text-text-faint">
                      Chain ID {chain.id} · {chain.nativeCurrency.symbol}
                    </span>
                  </div>

                  <dl className="mt-3.5 space-y-2">
                    <InfoRow label="Factory">
                      {factory ? (
                        <AddressDisplay
                          address={factory}
                          chainId={chain.id}
                          label="factory address"
                        />
                      ) : (
                        <span className="text-[12px] text-text-faint">Not deployed</span>
                      )}
                    </InfoRow>

                    {chain.blockExplorers?.default && (
                      <InfoRow label="Explorer">
                        <a
                          href={chain.blockExplorers.default.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-[28px] cursor-pointer items-center gap-1 text-[12px] text-signal underline decoration-signal/30 underline-offset-2 hover:decoration-signal"
                        >
                          {chain.blockExplorers.default.url.replace("https://", "")}
                          <ArrowSquareOut size={11} aria-hidden />
                        </a>
                      </InfoRow>
                    )}

                    <InfoRow label="RPC">
                      <span className="tnum text-[12px] text-text-dim">
                        {chain.rpcUrls.default.http[0]?.replace("https://", "")}
                      </span>
                    </InfoRow>
                  </dl>
                </div>
              );
            })}
          </div>

          {/* Live registry read, when available. */}
          <div className="mt-5 rounded-md border border-line bg-ink-900 px-4 py-4">
            <div className="flex items-center gap-2.5">
              <span
                className={clsx(
                  "size-1.5 rounded-full",
                  implementation ? "bg-signal" : "bg-text-faint",
                )}
                aria-hidden
              />
              <span className="label">Live registry</span>
            </div>
            {implementation ? (
              <dl className="mt-3.5 space-y-2">
                <InfoRow label="Vaults created">
                  <span className="tnum text-[13px] text-text">
                    {isLoading ? "…" : formatCount(totalVaults)}
                  </span>
                </InfoRow>
                <InfoRow label="Implementation">
                  <span className="tnum text-[12px] text-text-dim" title={implementation}>
                    {truncateAddress(implementation, 6)}
                  </span>
                </InfoRow>
              </dl>
            ) : (
              <p className="mt-3 max-w-[48ch] text-[12px] leading-relaxed text-text-faint">
                No factory is configured for the current network, so there is nothing to read yet.
                Deploy one with{" "}
                <code className="font-mono text-text-dim">npm run deploy:factory:testnet</code> and
                set <code className="font-mono text-text-dim">VITE_FACTORY_ADDRESS_968</code>.
              </p>
            )}
          </div>
        </div>

        {/* --- Parameters + gas --- */}
        <div className="reveal">
          <h3 className="text-[15px] font-medium text-text">Parameters</h3>
          <dl className="mt-5">
            <ParamRow
              label="MIN_TIMEOUT_PERIOD"
              value={formatDuration(PROTOCOL.MIN_TIMEOUT_SECONDS)}
              note="Floor, so clock drift cannot race a heartbeat"
            />
            <ParamRow
              label="MAX_TIMEOUT_PERIOD"
              value="365 days"
              note="Ceiling, so a switch can always eventually fire"
            />
            <ParamRow
              label="MAX_TRACKED_TOKENS"
              value={String(PROTOCOL.MAX_TRACKED_TOKENS)}
              note="Keeps the rescue inside the block gas limit"
            />
            <ParamRow
              label="MAX_PAGE_LIMIT"
              value={String(PROTOCOL.MAX_PAGE_LIMIT)}
              note="Cap on registry pagination, to stay RPC-friendly"
            />
          </dl>

          <h3 className="mt-12 text-[15px] font-medium text-text">Measured gas</h3>
          <p className="mt-2 max-w-[52ch] text-[13px] leading-relaxed text-text-dim">
            Reproduce with <code className="font-mono text-[12px]">npm run gas</code>. Creating a
            vault through the factory costs about 80% less than deploying one outright.
          </p>
          <dl className="mt-5">
            {GAS.map((g) => (
              <div
                key={g.op}
                className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-0.5 border-t border-line py-2.5 last:border-b"
              >
                <dt className="font-mono text-[12px] text-text">{g.op}</dt>
                <dd className="tnum text-[12px] text-text">{g.gas}</dd>
                <p className="col-span-2 text-[11px] text-text-faint">{g.payer}</p>
              </div>
            ))}
          </dl>

          <a
            href={LINKS.botchainDocs}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex min-h-[32px] cursor-pointer items-center gap-1.5 text-[13px] text-signal underline decoration-signal/30 underline-offset-2 transition-colors hover:decoration-signal"
          >
            BOT Chain developer quick guide
            <ArrowSquareOut size={12} aria-hidden />
          </a>
        </div>
      </div>
    </Section>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <dt className="label">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ParamRow({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="border-t border-line py-3 last:border-b">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <dt className="font-mono text-[12px] text-text">{label}</dt>
        <dd className="tnum text-[13px] text-signal">{value}</dd>
      </div>
      <p className="mt-1 text-[12px] text-text-faint">{note}</p>
    </div>
  );
}
