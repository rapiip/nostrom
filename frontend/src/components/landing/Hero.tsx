import { ArrowRight, BookOpen } from "@phosphor-icons/react";
import { defaultChain } from "@/config/chains";
import { Label } from "@/components/ui/Panel";
import { buttonClass, ButtonRouterLink } from "@/components/ui/Button";
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
              Nostrom is a fail-safe vault for autonomous AI agents. Your agent checks in on a
              schedule. If it goes silent for longer than the timeout you set,{" "}
              <span className="text-text">anyone</span> can move the treasury to a cold wallet you
              chose in advance. No admin keys, no support ticket, and nobody has to be awake when it
              happens.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <ButtonRouterLink
                to="/app/new"
                variant="primary"
                size="lg"
                iconRight={<ArrowRight size={14} aria-hidden />}
              >
                Create a vault
              </ButtonRouterLink>
              <a href="#how" className={buttonClass({ variant: "secondary", size: "lg" })}>
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
    <div className="flex items-baseline justify-between gap-3 rounded border border-line/80 bg-ink-900/60 px-3.5 py-3 backdrop-blur-xs sm:block">
      <dt className="label">{label}</dt>
      <dd className="text-right sm:mt-1.5 sm:text-left">
        <span className="block text-[14px] font-medium text-text">{value}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-text-faint">{note}</span>
      </dd>
    </div>
  );
}
