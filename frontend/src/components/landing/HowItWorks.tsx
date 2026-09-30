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
    title: "Create the vault",
    fn: "createVault()",
    body: "Pick three things: the address your agent signs heartbeats with, the cold wallet that receives everything if the agent goes dark, and how much silence to tolerate. The factory deploys a vault of your own, at its own address, holding only your funds.",
    detail:
      "The contract rejects a recovery address equal to the agent key, so the hot key can never be where rescued funds end up.",
    tone: "signal" as const,
  },
  {
    n: "02",
    title: "Your agent checks in",
    fn: "ping()",
    body: "On a schedule, your agent sends a heartbeat and the countdown resets to full. The heartbeat clients run a health check first and skip the ping when it fails, so an agent that is running but broken still lets the fail-safe arm.",
    detail:
      "The agent key can call exactly one function. It cannot withdraw, transfer or reconfigure anything.",
    tone: "signal" as const,
  },
  {
    n: "03",
    title: "Silence runs the clock down",
    fn: "timeUntilTrigger()",
    body: "If no heartbeat arrives, the grace period drains. Until it reaches zero you keep full control: withdraw, change settings, or rotate the agent key. One late heartbeat puts everything back to normal.",
    detail:
      "Whether the switch can fire is decided on-chain by the block timestamp, not by an off-chain oracle or a server Nostrom runs.",
    tone: "warn" as const,
  },
  {
    n: "04",
    title: "Anyone can evacuate the treasury",
    fn: "executeDeadManSwitch()",
    body: "Once the deadline passes, any address can fire the switch: a keeper bot, a watchtower, a colleague, a stranger. It does not matter who, because the caller cannot choose where the money goes.",
    detail:
      "Native BOT and every tracked ERC-20 move to your recovery address in one transaction. A broken token is skipped, never blocking the rest.",
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
      title="Four steps, and only the first one needs you."
      lede="You set the vault up once. After that your agent keeps it alive, the chain keeps time, and whoever happens to be watching can finish the job. That last part is the point: the rescue works precisely when you are not around."
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
                  "absolute top-3 left-0 flex size-[15px] items-center justify-center rounded-full border bg-ink-950 sm:top-2.5 sm:size-[19px]",
                  tone.border,
                )}
                aria-hidden
              >
                <span className={clsx("size-1.5 rounded-full sm:size-2", tone.dot)} />
              </span>

              {/* No hover treatment: the step is not clickable, and a hover tint
                  on static content is a false affordance. */}
              <div className="py-2">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                  {/* Number and title stay together; only the function tag may
                      drop to its own line. Wrapping them independently left a
                      lone "04" above its title on narrow screens. */}
                  <div className="flex min-w-0 items-baseline gap-3">
                    <span className={clsx("tnum shrink-0 text-[11px] font-medium font-mono", tone.text)}>
                      {step.n}
                    </span>
                    <h3 className="text-[17px] font-medium tracking-[-0.01em] text-text">
                      {step.title}
                    </h3>
                  </div>
                  <code className="rounded border border-line bg-ink-800 px-2 py-0.5 font-mono text-[11px] text-text-dim">
                    {step.fn}
                  </code>
                </div>

                {/* Prose and its contract-level caveat sit side by side from lg
                    up. Stacked, each step used barely half the measure and the
                    section ran for two screens of mostly empty right margin. */}
                <div className="mt-3 grid gap-x-10 gap-y-3 lg:grid-cols-12">
                  <p className="text-[14px] leading-[1.65] text-text-dim lg:col-span-7">
                    {step.body}
                  </p>

                  <p
                    className={clsx(
                      "border-l-2 pl-3.5 text-[13px] leading-relaxed text-text-faint lg:col-span-5",
                      tone.border,
                    )}
                  >
                    {step.detail}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
