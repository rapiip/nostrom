import { clsx } from "clsx";
import { ArrowLeft, ArrowSquareOut } from "@phosphor-icons/react";
import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { supportedChains } from "@/config/chains";
import { factoryAddress, LINKS, PROTOCOL } from "@/config/contracts";
import { GAS_GROUPS, READS, ROLES, ROLE_TONES, SAFETY } from "@/config/protocol-reference";
import { formatCount, formatDuration, formatGas, truncateAddress } from "@/lib/format";
import { useFactoryInfo } from "@/hooks/useVault";
import { AddressDisplay } from "@/components/ui/Address";
import { Label } from "@/components/ui/Panel";
import { Nav } from "@/components/landing/Nav";
import { Footer } from "@/components/landing/Integration";

/**
 * Protocol reference.
 *
 * Everything a developer needs to look up, and nothing a first-time visitor
 * needs to scroll past. The permission matrix, the safety properties and the
 * parameter/address/gas tables all used to live at the bottom of the landing
 * page, where they were three consecutive walls of small text: correct, but the
 * wrong register for a page whose job is to explain the mechanism once.
 *
 * The landing page now shows a visual summary of each and links here.
 */

const TOC = [
  { id: "permissions", label: "Permissions" },
  { id: "reads", label: "Read paths" },
  { id: "safety", label: "Safety" },
  { id: "parameters", label: "Parameters" },
  { id: "networks", label: "Networks" },
  { id: "gas", label: "Gas" },
] as const;

export function Reference() {
  // Scroll to an incoming hash. Keyed on the hash rather than on mount alone, so
  // a link to /reference#safety also works when the reader is already here and
  // the component therefore never remounts.
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const el = document.querySelector(hash);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
  }, [hash]);

  return (
    <div className="min-h-dvh bg-ink-950">
      <Nav />

      <main id="main">
        {/* --- Masthead --- */}
        <header className="border-b border-line pt-28 pb-12 sm:pt-32">
          <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
            <Link
              to="/"
              className="inline-flex min-h-[32px] cursor-pointer items-center gap-2 text-[13px] text-text-dim no-underline transition-colors hover:text-text"
            >
              <ArrowLeft size={13} aria-hidden />
              Overview
            </Link>

            <div className="mt-6 lg:grid lg:grid-cols-12 lg:items-end lg:gap-x-16">
              <div className="lg:col-span-7">
                <Label>Reference</Label>
                <h1 className="display mt-4 text-[clamp(1.9rem,3.6vw,2.6rem)] text-text">
                  Permissions, parameters and costs.
                </h1>
              </div>
              <p className="mt-5 text-[15px] leading-[1.65] text-text-dim lg:col-span-5 lg:mt-0 lg:border-l lg:border-line lg:pl-6">
                Every entry below exists in the deployed contracts. Gas figures are measurements, not
                estimates, reproduced with <span className="tnum text-text">scripts/measure-gas.js</span>.
              </p>
            </div>

            <nav aria-label="On this page" className="mt-9 flex flex-wrap gap-2">
              {TOC.map((t) => (
                <a
                  key={t.id}
                  href={`#${t.id}`}
                  className="inline-flex min-h-[32px] cursor-pointer items-center rounded border border-line bg-ink-900 px-3 font-mono text-[11px] uppercase tracking-wider text-text-dim no-underline transition-colors hover:border-line-strong hover:text-text"
                >
                  {t.label}
                </a>
              ))}
            </nav>
          </div>
        </header>

        {/* --- Permission matrix --- */}
        <Block
          id="permissions"
          index="01"
          title="Permission matrix"
          lede="Who can invoke what. The asymmetry is the security model: the key that runs inside your agent process holds one function, and it is not a spending one."
        >
          <div className="border-t border-line">
            {ROLES.map((group) => {
              const tone = ROLE_TONES[group.tone];
              return (
                <div
                  key={group.id}
                  className="grid gap-x-14 gap-y-5 border-b border-line py-9 lg:grid-cols-12"
                >
                  <div className="lg:col-span-4">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={clsx("size-1.5 shrink-0 rounded-full", tone.dot)}
                        aria-hidden
                      />
                      <h3 className={clsx("text-[15px] font-medium", tone.text)}>{group.role}</h3>
                    </div>
                    <p className="mt-2 max-w-[38ch] text-[13px] leading-relaxed text-text-faint">
                      {group.constraint}
                    </p>
                    <p className="label mt-3.5">
                      {group.items.length} {group.items.length === 1 ? "function" : "functions"}
                    </p>
                  </div>

                  <dl className="grid gap-x-10 gap-y-4 sm:grid-cols-2 lg:col-span-8">
                    {group.items.map((item) => (
                      <div key={item.name} className="min-w-0">
                        <dt className="text-[13px] font-medium leading-relaxed text-text">
                          {item.name}
                        </dt>
                        <dd className="mt-1 text-[13px] leading-relaxed text-text-dim">
                          {item.desc}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })}
          </div>
        </Block>

        {/* --- Reads --- */}
        <Block
          id="reads"
          index="02"
          title="Read paths"
          lede="Sized for watchtowers, keeper bots and dashboards: batched where it matters, so a monitoring UI is one round-trip rather than N."
        >
          <dl>
            {READS.map((r) => (
              <div
                key={r.name}
                className="grid gap-1.5 border-t border-line py-3.5 last:border-b sm:grid-cols-[minmax(0,17rem)_1fr] sm:gap-6"
              >
                <dt className="text-[13px] font-medium leading-relaxed text-text">{r.name}</dt>
                <dd className="text-[13px] leading-relaxed text-text-dim">{r.desc}</dd>
              </div>
            ))}
          </dl>
        </Block>

        {/* --- Safety --- */}
        <Block
          id="safety"
          index="03"
          title="Safety properties"
          lede="Each is a specific mechanism in the contracts, stated as what it does rather than as a guarantee."
        >
          <dl className="grid gap-x-14 sm:grid-cols-2">
            {SAFETY.map((p, i) => (
              <div key={p.tag} className="flex gap-4 border-t border-line py-4">
                <span className="tnum pt-px text-[11px] text-signal/70" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <dt className="label">{p.tag}</dt>
                  <dd className="mt-1.5 text-[13px] leading-relaxed text-text-dim">{p.body}</dd>
                </div>
              </div>
            ))}
          </dl>
        </Block>

        {/* --- Parameters --- */}
        <Block id="parameters" index="04" title="Parameters" lede="Bounds enforced on-chain.">
          <dl>
            <ParamRow
              label="Minimum timeout"
              value={formatDuration(PROTOCOL.MIN_TIMEOUT_SECONDS)}
              note="Clock drift cannot race a heartbeat"
            />
            <ParamRow
              label="Maximum timeout"
              value="365 days"
              note="Keeps every switch reachable"
            />
            <ParamRow
              label="Tracked token capacity"
              value={String(PROTOCOL.MAX_TRACKED_TOKENS)}
              note="ERC-20s swept per evacuation"
            />
            <ParamRow
              label="Batch pagination limit"
              value={String(PROTOCOL.MAX_PAGE_LIMIT)}
              note="Vaults scanned per batch request"
            />
          </dl>
        </Block>

        {/* --- Networks --- */}
        <Block
          id="networks"
          index="05"
          title="Networks and addresses"
          lede="A chain with no configured factory says so, rather than showing a placeholder."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="overflow-hidden rounded-md border border-line">
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

            <LiveRegistry />
          </div>
        </Block>

        {/* --- Gas --- */}
        <Block
          id="gas"
          index="06"
          title="Measured gas"
          lede="Nostrom charges no protocol fee. Every figure is network gas paid to BOT Chain validators."
        >
          <div className="grid gap-x-14 gap-y-10 lg:grid-cols-2">
            {GAS_GROUPS.map((group) => {
              const max = Math.max(...group.rows.map((r) => r.gas));
              return (
                <div key={group.heading}>
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="label">{group.heading}</h3>
                    <span className="tnum text-[11px] text-text-faint">
                      bars relative to {formatGas(max)}
                    </span>
                  </div>
                  <p className="mt-1.5 max-w-[56ch] text-[12px] leading-relaxed text-text-faint">
                    {group.note}
                  </p>

                  <dl className="mt-3.5">
                    {group.rows.map((r) => (
                      <div key={r.op} className="border-t border-line py-3 last:border-b">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                          <dt className="text-[13px] font-medium text-text">{r.op}</dt>
                          <dd className="tnum text-[12px] text-text">~{formatGas(r.gas)}</dd>
                        </div>

                        {/* Neutral by design: the palette reserves green/amber/red
                            for vault liveness, and gas is not a status. */}
                        <div
                          className="mt-2 h-1 w-full overflow-hidden rounded-full bg-ink-800"
                          role="presentation"
                        >
                          <div
                            className="h-full rounded-full bg-text-dim"
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
          </div>

          <a
            href={LINKS.botchainDocs}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-10 inline-flex min-h-[32px] cursor-pointer items-center gap-1.5 text-[13px] text-signal underline decoration-signal/30 underline-offset-2 transition-colors hover:decoration-signal"
          >
            BOT Chain developer quick guide
            <ArrowSquareOut size={12} aria-hidden />
          </a>
        </Block>
      </main>

      <Footer />
    </div>
  );
}

/* ===========================================================================
   Local chrome
   =========================================================================== */

function Block({
  id,
  index,
  title,
  lede,
  children,
}: {
  id: string;
  index: string;
  title: string;
  lede: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-b border-line py-14 sm:py-16">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <div className="lg:grid lg:grid-cols-12 lg:items-end lg:gap-x-16">
          <div className="lg:col-span-7">
            <div className="flex items-center gap-3">
              <span className="tnum text-[11px] font-medium text-signal">{index}</span>
              <span className="h-px w-8 bg-line-strong" aria-hidden />
              <h2 className="text-[15px] font-medium text-text">{title}</h2>
            </div>
          </div>
          <p className="mt-3 max-w-[62ch] text-[13px] leading-relaxed text-text-dim lg:col-span-5 lg:mt-0">
            {lede}
          </p>
        </div>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

function LiveRegistry() {
  const { implementation, totalVaults, isLoading } = useFactoryInfo();

  return (
    <div className="rounded-md border border-line bg-ink-900 px-4 py-4">
      <div className="flex items-center gap-2.5">
        <span
          className={clsx("size-1.5 rounded-full", implementation ? "bg-signal" : "bg-text-faint")}
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
          No factory on this network. Connect to a supported one to read the registry.
        </p>
      )}
    </div>
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

function ParamRow({ label, value, note }: { label: string; value: string; note: string }) {
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
