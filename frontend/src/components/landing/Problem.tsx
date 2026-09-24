import { useReveal } from "@/hooks/useReveal";
import { Section } from "./Section";

/**
 * Problem.
 *
 * States the actual failure mode the contracts address, then the reason the
 * obvious remedies do not work. No invented statistics — the argument is
 * structural, so it does not need any.
 *
 * Visually: a comparison of three failure paths against one recovery path,
 * expressed as a table-like grid rather than as three identical feature cards.
 */

const FAILURES = [
  {
    cause: "Process dies",
    consequence: "Nothing signs. The treasury sits in a contract nobody is watching.",
  },
  {
    cause: "Key is lost",
    consequence: "The funds are mathematically unreachable. There is no recovery path.",
  },
  {
    cause: "Agent is compromised",
    consequence: "The attacker has the key. You find out from the balance, not from an alert.",
  },
];

const NON_SOLUTIONS = [
  {
    approach: "Multisig",
    why: "Requires a quorum of humans to notice and act. The failure being defended against is nobody noticing.",
  },
  {
    approach: "Timelocked withdrawal",
    why: "Still needs someone holding a key to start it. If the key is gone, so is the timelock.",
  },
  {
    approach: "Off-chain monitoring",
    why: "Can page you, but cannot move funds. The alert and the authority live in different places.",
  },
];

export function Problem() {
  const ref = useReveal<HTMLDivElement>();

  return (
    <Section
      id="problem"
      index="01"
      eyebrow="The problem"
      title="Autonomous agents hold funds. Autonomous agents fail silently."
      lede="An AI agent with an operating budget needs a hot key to spend it. That key is, by construction, the least protected thing in the system — it lives in a running process, on a server, signing unattended. When that process stops, the funds do not go anywhere. They just stop being reachable."
    >
      <div ref={ref} className="grid gap-x-16 gap-y-12 lg:grid-cols-2">
        {/* --- Failure modes --- */}
        <div className="reveal">
          <h3 className="text-[13px] font-medium tracking-[0.02em] text-danger">
            Three ways it ends
          </h3>
          <dl className="mt-5">
            {FAILURES.map((f, i) => (
              <div
                key={f.cause}
                className="flex gap-4 border-b border-line py-4 first:border-t first:border-line"
              >
                <span className="tnum pt-0.5 text-[11px] text-text-faint">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <dt className="text-[14px] text-text">{f.cause}</dt>
                  <dd className="mt-1 text-[13px] leading-relaxed text-text-dim">
                    {f.consequence}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
          <p className="mt-6 max-w-[48ch] text-[13px] leading-relaxed text-text-dim">
            In all three cases the on-chain state is identical: a contract with a balance and no
            further transactions. Nothing on-chain can tell them apart, and nothing on-chain reacts.
          </p>
        </div>

        {/* --- Why the usual answers don't fit --- */}
        <div className="reveal">
          <h3 className="text-[13px] font-medium tracking-[0.02em] text-text-dim">
            Why the usual answers don't fit
          </h3>
          <dl className="mt-5">
            {NON_SOLUTIONS.map((s) => (
              <div
                key={s.approach}
                className="border-b border-line py-4 first:border-t first:border-line"
              >
                <dt className="text-[14px] text-text">{s.approach}</dt>
                <dd className="mt-1 max-w-[52ch] text-[13px] leading-relaxed text-text-dim">
                  {s.why}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-8 border-l-2 border-signal pl-5">
            <p className="max-w-[48ch] text-[15px] leading-[1.6] text-text">
              Every one of these needs a living participant to act. Nostrom inverts that: the absence
              of action <span className="text-signal">is</span> the trigger, and the party who acts
              on it does not need to be you.
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}
