import { clsx } from "clsx";
import { useReveal } from "@/hooks/useReveal";
import { Section } from "./Section";

/**
 * How it works.
 *
 * Four steps, each annotated with the actual function that performs it, so a
 * developer can map the prose onto the ABI without guessing. The connecting rail
 * on the left is a literal timeline, the protocol's own axis.
 */

const STEPS = [
  {
    n: "01",
    title: "Configure the vault",
    tag: "Vault setup",
    body: "You configure three core parameters: the address your agent uses to report liveness, the cold wallet that receives funds if the agent goes dark, and your chosen silence threshold. The factory deploys a dedicated, isolated vault.",
    detail:
      "The vault requires the recovery address to differ from the agent key, ensuring the hot signing key is never the destination for rescued funds.",
    tone: "signal" as const,
  },
  {
    n: "02",
    title: "The agent reports in",
    tag: "Liveness heartbeat",
    body: "Your agent sends periodic heartbeat signals on a schedule. Each signal resets the countdown timer. Clients can withhold the signal whenever internal health checks fail, allowing a hung or malfunctioning agent to trigger the fail-safe.",
    detail:
      "The agent key only has permission to signal liveness. It cannot move, withdraw, or transfer funds under any circumstances.",
    tone: "signal" as const,
  },
  {
    n: "03",
    title: "Silence accumulates",
    tag: "Timer expiration",
    body: "If no heartbeat arrives within the configured window, the grace period elapses. Before the deadline, you retain full owner control to withdraw assets or update settings. After the deadline passes, the fail-safe arms.",
    detail:
      "Fail-safe eligibility is strictly determined on-chain: once the deadline has elapsed without a heartbeat, the switch becomes executable.",
    tone: "warn" as const,
  },
  {
    n: "04",
    title: "Anyone evacuates the treasury",
    tag: "Automated evacuation",
    body: "Once armed, any keeper or automated watchtower can execute the evacuation. The caller cannot redirect funds, as they are permanently locked to your pre-configured recovery address.",
    detail:
      "Native BOT and all tracked ERC-20 assets are swept directly to your designated cold wallet in a single transaction.",
    tone: "danger" as const,
  },
];

const TONES = {
  signal: { dot: "bg-signal", text: "text-signal", border: "border-signal" },
  warn: { dot: "bg-warn", text: "text-warn", border: "border-warn" },
  danger: { dot: "bg-danger", text: "text-danger", border: "border-danger" },
};

export function HowItWorks() {
  const ref = useReveal<HTMLOListElement>();

  return (
    <Section
      id="how"
      index="02"
      eyebrow="How it works"
      title="Four steps, and only one of them needs you."
      lede="Steps 1 and 3 are configuration. Step 2 is your agent. Step 4 is whoever happens to be watching, which is the only reason the whole thing works when you are not."
    >
      <ol ref={ref} className="relative">
        {/* The timeline rail. */}
        <span
          className="absolute top-2 bottom-2 left-[7px] w-px bg-line-strong sm:left-[9px]"
          aria-hidden
        />

        {STEPS.map((step, i) => {
          const tone = TONES[step.tone];
          return (
            <li key={step.n} className={clsx("reveal relative pl-9 sm:pl-12", i > 0 && "mt-8")}>
              {/* Node on the rail. */}
              <span
                className={clsx(
                  "absolute top-4 left-0 flex size-[15px] items-center justify-center rounded-full border bg-ink-950 sm:size-[19px]",
                  tone.border,
                )}
                aria-hidden
              >
                <span className={clsx("size-1.5 rounded-full sm:size-2", tone.dot)} />
              </span>

              <div className="rounded-lg border border-transparent p-4 -ml-4 transition-all duration-150 hover:border-line hover:bg-ink-900/50">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className={clsx("tnum text-[11px] font-medium font-mono", tone.text)}>
                    {step.n}
                  </span>
                  <h3 className="text-[17px] font-medium tracking-[-0.01em] text-text">
                    {step.title}
                  </h3>
                  <span className="rounded border border-line bg-ink-800 px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wider text-text-faint">
                    {step.tag}
                  </span>
                </div>

                <p className="mt-3 max-w-[68ch] text-[14px] leading-[1.65] text-text-dim">
                  {step.body}
                </p>

                <p
                  className={clsx(
                    "mt-3 max-w-[64ch] border-l-2 pl-3.5 text-[13px] leading-relaxed text-text-faint",
                    tone.border,
                  )}
                >
                  {step.detail}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
