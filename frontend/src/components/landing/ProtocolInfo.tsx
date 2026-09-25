import { clsx } from "clsx";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { supportedChains } from "@/config/chains";
import { factoryAddress, LINKS, PROTOCOL } from "@/config/contracts";
import { formatCount, formatDuration, formatGas, truncateAddress } from "@/lib/format";
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
 * and implementation address are read live from it; this is the one section
 * where the landing page talks to the chain, and it is worth the round-trip
 * because "is this actually deployed" is the first question a reader has.
 *
 * Gas figures are the measured values from scripts/measure-gas.js, labelled as
 * measurements rather than promises.
 */

/**
 * Measured gas, split into two groups.
 *
 * The figures span 25,700 to 2,994,000 — a 116x range. Scaling one set of bars
 * across all of it would compress every operation into an invisible sliver and
 * the table would lose the comparison the bars exist to provide. Deployment and
 * per-operation costs are also decisions a reader makes at different times, so
 * they are grouped and each group is scaled to its own maximum: like compared
 * with like.
 *
 * The deployment group then shows the actual decision — a standalone vault is
 * 44% cheaper than the factory if you only ever need one vault — as a length
 * difference rather than as two numbers to mentally divide.
 */
const GAS_GROUPS: {
  heading: string;
  note: string;
  rows: { op: string; gas: number; note: string }[];
}[] = [
  {
    heading: "Deployment",
    note: "Paid once. The factory only becomes the cheaper route from the third vault onward.",
    rows: [
      {
        op: "Factory deployment",
        gas: 2994000,
        note: "Once, for a platform others can use",
      },
      {
        op: "Standalone vault",
        gas: 1688000,
        note: "Once, for a single agent of your own",
      },
    ],
  },
  {
    heading: "Per operation",
    note: "Paid by whoever calls the function.",
    rows: [
      { op: "Create vault", gas: 343000, note: "Each user, via the factory" },
      { op: "Create vault & deposit", gas: 338000, note: "Atomic creation plus initial deposit" },
      { op: "Execute fail-safe", gas: 74400, note: "Any keeper, during evacuation" },
      { op: "Liveness heartbeat", gas: 37600, note: "The agent, every ping" },
      { op: "Deposit funds", gas: 25700, note: "Each deposit" },
    ],
  },
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
      lede="Nostrom runs natively on BOT Chain with full EVM compatibility and standard JSON-RPC support. Vaults deploy as lightweight, gas-efficient contracts ensuring every user retains an isolated on-chain treasury."
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
                No factory contract is detected on this network. Connect to a supported network to inspect live registry metrics.
              </p>
            )}
          </div>
        </div>

        {/* --- Parameters + gas --- */}
        <div className="reveal">
          <h3 className="text-[15px] font-medium text-text">Parameters</h3>
          <dl className="mt-5">
            <ParamRow
              label="Minimum timeout"
              value={formatDuration(PROTOCOL.MIN_TIMEOUT_SECONDS)}
              note="Floor duration, ensuring network timing cannot race a heartbeat"
            />
            <ParamRow
              label="Maximum timeout"
              value="365 days"
              note="Ceiling duration, ensuring fail-safes always remain executable"
            />
            <ParamRow
              label="Tracked token capacity"
              value={String(PROTOCOL.MAX_TRACKED_TOKENS)}
              note="Maximum ERC-20 tokens swept per evacuation"
            />
            <ParamRow
              label="Batch pagination limit"
              value={String(PROTOCOL.MAX_PAGE_LIMIT)}
              note="Maximum vaults scanned per batch request"
            />
          </dl>

          <h3 className="mt-12 text-[15px] font-medium text-text">Measured gas</h3>
          <p className="mt-2 max-w-[52ch] text-[13px] leading-relaxed text-text-dim">
            Nostrom charges no protocol fee. Every figure below is network gas, reproduced with{" "}
            <span className="tnum text-text">scripts/measure-gas.js</span>.
          </p>

          {GAS_GROUPS.map((group) => {
            const max = Math.max(...group.rows.map((r) => r.gas));
            return (
              <div key={group.heading} className="mt-7">
                <div className="flex items-baseline justify-between gap-4">
                  <h4 className="label">{group.heading}</h4>
                  <span className="tnum text-[11px] text-text-faint">
                    bars relative to {formatGas(max)}
                  </span>
                </div>
                <p className="mt-1.5 max-w-[52ch] text-[12px] leading-relaxed text-text-faint">
                  {group.note}
                </p>

                <dl className="mt-3.5">
                  {group.rows.map((r) => (
                    <div key={r.op} className="border-t border-line py-3 last:border-b">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                        <dt className="text-[13px] font-medium text-text">{r.op}</dt>
                        <dd className="tnum text-[12px] text-text">~{formatGas(r.gas)}</dd>
                      </div>

                      {/* Proportional bar. Neutral by design: the palette reserves
                          green/amber/red for vault liveness, and gas is not a
                          status. Magnitude is carried by length, not by hue. */}
                      <div
                        className="mt-2 h-1 w-full overflow-hidden rounded-full bg-ink-800"
                        role="presentation"
                      >
                        <div
                          className="h-full rounded-full bg-text-dim"
                          // Floored at 1.5% so the smallest row still reads as a
                          // bar rather than as an empty track.
                          style={{ width: `${Math.max(1.5, (r.gas / max) * 100)}%` }}
                        />
                      </div>

                      <p className="mt-1.5 text-[11px] text-text-faint">{r.note}</p>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}

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
        <dt className="text-[13px] font-medium text-text">{label}</dt>
        <dd className="tnum text-[13px] text-signal">{value}</dd>
      </div>
      <p className="mt-1 text-[12px] text-text-faint">{note}</p>
    </div>
  );
}
