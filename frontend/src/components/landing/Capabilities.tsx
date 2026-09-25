import { clsx } from "clsx";
import { ArrowRight } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { ROLES, ROLE_TONES } from "@/config/protocol-reference";
import { useReveal } from "@/hooks/useReveal";
import { Section } from "./Section";

/**
 * Capabilities — summary only.
 *
 * The full permission matrix (thirteen functions with descriptions, plus five
 * read paths) now lives at /reference#permissions. On the landing page it was a
 * long list of small text that a first-time reader had no reason to work
 * through, and it crowded out the one thing this section actually has to land:
 * the *asymmetry*. The key running inside the agent process holds one function;
 * the owner holds nine; anyone at all holds three, and none of them can choose
 * where the money goes.
 *
 * So the count is the headline, set large, and the list is a link away.
 */
export function Capabilities() {
  const ref = useReveal<HTMLDivElement>();

  return (
    <Section
      id="capabilities"
      index="03"
      eyebrow="Capabilities"
      title="Three roles. Only one of them can move funds."
      lede="Security rests on separating privileges. The agent key, live in a running process, can only report liveness; the treasury answers to the owner and to the cold wallet chosen in advance."
    >
      <div ref={ref} className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3">
        {ROLES.map((role) => {
          const tone = ROLE_TONES[role.tone];
          return (
            <div key={role.id} className="reveal bg-ink-900 px-5 py-7">
              <div className="flex items-center gap-2.5">
                <span className={clsx("size-1.5 shrink-0 rounded-full", tone.dot)} aria-hidden />
                <h3 className="text-[13px] font-medium text-text">{role.role}</h3>
              </div>

              <div className="mt-5 flex items-baseline gap-2.5">
                <span
                  className={clsx(
                    "tnum text-[clamp(2.4rem,4.6vw,3.2rem)] leading-none font-medium tracking-tight",
                    tone.text,
                  )}
                >
                  {role.items.length}
                </span>
                <span className="label">
                  {role.items.length === 1 ? "function" : "functions"}
                </span>
              </div>

              <p className="mt-5 max-w-[34ch] text-[14px] leading-[1.6] text-text">
                {role.summary}
              </p>
              <p className="mt-2 max-w-[36ch] text-[12px] leading-relaxed text-text-faint">
                {role.constraint}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-8">
        <Link
          to="/reference#permissions"
          className="group inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded border border-line-strong bg-ink-850 px-4 text-[13px] text-text no-underline shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-150 hover:border-text-faint hover:bg-ink-750"
        >
          Full permission matrix and read paths
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
