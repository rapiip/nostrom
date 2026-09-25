import { ArrowRight } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { supportedChains } from "@/config/chains";
import { PING_GAS } from "@/config/protocol-reference";
import { formatCount, formatGas } from "@/lib/format";
import { useFactoryInfo } from "@/hooks/useVault";
import { useReveal } from "@/hooks/useReveal";
import { Stat } from "@/components/ui/Panel";
import { Section } from "./Section";

/**
 * Protocol — headline figures only.
 *
 * The networks/addresses table, the parameter bounds and the measured-gas bars
 * moved to /reference. They are lookup material: a reader deciding whether to
 * use Nostrom wants four numbers, and a reader about to deploy wants the tables
 * — and only the second one wants them on the way past.
 *
 * What stays is the shortest honest answer to "what does this cost me": no
 * protocol fee, one cheap recurring call, and a live count of vaults the factory
 * has actually created. The vault count is read from the chain rather than
 * asserted, which is the whole point of putting it on a landing page.
 */
export function ProtocolInfo() {
  const ref = useReveal<HTMLDListElement>();
  const { implementation, totalVaults, isLoading } = useFactoryInfo();

  return (
    <Section
      id="protocol"
      index="05"
      eyebrow="Protocol"
      title="No protocol fees. One recurring cost."
      lede="Nostrom runs on BOT Chain, which is EVM-compatible with a standard JSON-RPC surface. There is no creation fee and no cut of a rescue; every figure below is network gas paid to validators."
    >
      <dl
        ref={ref}
        className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="reveal bg-ink-900 px-5 py-6">
          <Stat
            label="Protocol fees"
            value="None"
            tone="signal"
            hint="No creation fee, no cut of a rescue"
          />
        </div>
        <div className="reveal bg-ink-900 px-5 py-6">
          <Stat
            label="Heartbeat"
            value={`~${formatGas(PING_GAS)}`}
            unit="gas"
            hint="The only recurring cost, paid by the agent"
          />
        </div>
        <div className="reveal bg-ink-900 px-5 py-6">
          <Stat
            label="Timeout range"
            value="30s – 365d"
            hint="Enforced on-chain, set per vault"
          />
        </div>
        <div className="reveal bg-ink-900 px-5 py-6">
          {implementation ? (
            <Stat
              label="Vaults created"
              value={isLoading ? "…" : formatCount(totalVaults)}
              hint="Read live from the factory registry"
            />
          ) : (
            <Stat
              label="Networks"
              value={String(supportedChains.length)}
              hint={supportedChains.map((c) => c.name).join(" · ")}
              tone="dim"
            />
          )}
        </div>
      </dl>

      <div className="mt-8">
        <Link
          to="/reference#parameters"
          className="group inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded border border-line-strong bg-ink-850 px-4 text-[13px] text-text no-underline shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-150 hover:border-text-faint hover:bg-ink-750"
        >
          Parameters, contract addresses and the full gas table
          <ArrowRight
            size={13}
            aria-hidden
            className="transition-transform duration-200 group-hover:translate-x-0.5"
          />
        </Link>
      </div>
    </Section>
  );
}
