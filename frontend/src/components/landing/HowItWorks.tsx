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
    call: "createVault(agent, recovery, timeout)",
    body: "You pick three things: the address your agent signs heartbeats from, the cold wallet that receives funds if it goes dark, and how much silence to tolerate. The factory clones a vault you own and registers it.",
    detail:
      "The contract refuses a recovery address equal to the agent address: the hot key must never be the rescue destination.",
    tone: "signal" as const,
  },
  {
    n: "02",
    title: "The agent reports in",
    call: "ping()",
    body: "Your agent calls ping() on a schedule. Each call resets the countdown. The bundled Node and Python clients do this for you, and can withhold the ping when your own health check fails: a wedged agent that keeps pinging defeats the point.",
    detail:
      "ping() is the only function the agent key can call. It cannot move funds. Compromising it does not compromise the treasury.",
    tone: "signal" as const,
  },
  {
    n: "03",
    title: "Silence accumulates",
    call: "timeUntilTrigger()",
    body: "If no ping arrives, the grace window drains. Up to the deadline nothing has changed: you can still withdraw, rotate the agent key, or extend the timeout. After it, the vault is armed.",
    detail:
      "Execution requires block.timestamp to be strictly past the deadline. At exactly the deadline the switch is not yet live.",
    tone: "warn" as const,
  },
  {
    n: "04",
    title: "Anyone evacuates the treasury",
    call: "executeDeadManSwitch()",
    body: "No access control. Any keeper, watchtower or bystander can fire it. The caller cannot choose the destination (it is always the recoveryAddress you stored), so there is nothing to extract by calling it, and no reason to trust whoever does.",
    detail:
      "Native BOT plus every tracked ERC-20 moves to the recovery address in one transaction.",
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
            <li key={step.n} className={clsx("reveal relative pl-9 sm:pl-12", i > 0 && "mt-12")}>
              {/* Node on the rail. */}
              <span
                className={clsx(
                  "absolute top-1.5 left-0 flex size-[15px] items-center justify-center rounded-full border bg-ink-950 sm:size-[19px]",
                  tone.border,
                )}
                aria-hidden
              >
                <span className={clsx("size-1.5 rounded-full sm:size-2", tone.dot)} />
              </span>

              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className={clsx("tnum text-[11px] font-medium", tone.text)}>{step.n}</span>
                <h3 className="text-[17px] font-medium tracking-[-0.01em] text-text">
                  {step.title}
                </h3>
              </div>

              <code className="mt-2.5 inline-block rounded border border-line bg-ink-850 px-2 py-1 font-mono text-[12px] text-text-dim">
                {step.call}
              </code>

              <p className="mt-3.5 max-w-[68ch] text-[14px] leading-[1.65] text-text-dim">
                {step.body}
              </p>

              <p
                className={clsx(
                  "mt-3 max-w-[64ch] border-l pl-3.5 text-[13px] leading-relaxed text-text-faint",
                  tone.border,
                )}
              >
                {step.detail}
              </p>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
