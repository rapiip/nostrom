import { Link } from "react-router-dom";
import { ArrowRight, BookOpen } from "@phosphor-icons/react";
import { defaultChain } from "@/config/chains";
import { Label } from "@/components/ui/Panel";
import { ProtocolDiagram } from "./ProtocolDiagram";

/**
 * Hero.
 *
 * The headline states what the contract does, in the contract's own terms. No
 * "revolutionising" anything. A reader who knows nothing about Nostrom should be
 * able to restate the mechanism after one sentence.
 *
 * Layout is an asymmetric 12-column split with generous negative space above,
 * editorial rather than centred-marketing.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-14 sm:pt-36 sm:pb-20">
      {/* The measuring lattice. Masked to fade downward so it frames the type
          without turning into a decorative background. */}
      <div className="grid-field pointer-events-none absolute inset-0 -z-10" aria-hidden />

      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <div className="grid gap-x-16 gap-y-14 lg:grid-cols-12">
          {/* --- Copy column --- */}
          <div className="lg:col-span-6 xl:col-span-5">
            <div className="flex items-center gap-2.5">
              <span className="pulse-dot text-signal" aria-hidden />
              <Label>Dead-man's switch · BOT Chain</Label>
            </div>

            {/* No hard line breaks: `.display` sets text-wrap: balance, which
                distributes the lines evenly at any column width. Manual <br />
                fought the natural wrap and stranded a word on its own line. */}
            <h1 className="display mt-7 text-[clamp(2rem,4.1vw,3.05rem)] text-text">
              An agent that goes quiet should not take the{" "}
              <span className="text-signal">treasury with it.</span>
            </h1>

            <p className="mt-7 max-w-[46ch] text-[15px] leading-[1.65] text-text-dim">
              Nostrom is a fail-safe vault for autonomous AI agents. The agent proves it is alive on
              a schedule. If the heartbeat stops for longer than the timeout you set,{" "}
              <span className="text-text">anyone</span> can evacuate the vault to a cold wallet you
              chose in advance: no key recovery, no admin, no waiting for you to notice.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                to="/app/new"
                className="group inline-flex min-h-[48px] cursor-pointer items-center gap-2 rounded border border-signal bg-signal px-5 text-[14px] font-medium text-ink-950 no-underline shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all duration-150 hover:bg-signal/90 hover:shadow-[0_0_20px_-3px_rgba(125,211,160,0.35)] active:scale-[0.985]"
              >
                Create a vault
                <ArrowRight
                  size={14}
                  aria-hidden
                  className="transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </Link>
              <a
                href="#how"
                className="inline-flex min-h-[48px] cursor-pointer items-center gap-2 rounded border border-line-strong bg-ink-850 px-5 text-[14px] text-text no-underline shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-150 hover:border-text-faint hover:bg-ink-750 active:scale-[0.985]"
              >
                <BookOpen size={14} aria-hidden />
                How it works
              </a>
            </div>

            {/* Concrete protocol facts, not vanity metrics. Everything here is a
                verifiable property of the contracts. Notes are kept to one line
                each so the three cards match; a two-line note on only the first
                card made the row look misaligned. */}
            <dl className="mt-11 grid gap-2.5 sm:grid-cols-3">
              <HeroFact label="Execution" value="Permissionless" note="No owner needed" />
              <HeroFact label="Timeout range" value="30s to 365d" note="Set per vault" />
              <HeroFact
                label="Network"
                value={defaultChain.name}
                note={`Chain ID ${defaultChain.id}`}
              />
            </dl>
          </div>

          {/* --- Diagram column ---
              Self-centered so the height difference against the taller copy
              column distributes above and below the panel instead of pooling as
              one large void underneath it. */}
          <div className="lg:col-span-6 lg:self-center xl:col-span-7">
            <ProtocolDiagram />
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroFact({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded border border-line/80 bg-ink-900/60 px-3.5 py-3 backdrop-blur-xs transition-colors hover:border-line-strong sm:block">
      <dt className="label">{label}</dt>
      <dd className="text-right sm:mt-1.5 sm:text-left">
        <span className="block text-[14px] font-medium text-text">{value}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-text-faint">{note}</span>
      </dd>
    </div>
  );
}
