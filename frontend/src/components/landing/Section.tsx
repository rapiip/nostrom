import { clsx } from "clsx";
import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui/Panel";
import { useReveal } from "@/hooks/useReveal";

/**
 * Shared section chrome for the landing page.
 *
 * Every section gets the same eyebrow → headline → lede rhythm and the same
 * max-width, which is what makes the page read as one document rather than a
 * stack of unrelated marketing blocks.
 */
export function Section({
  id,
  index,
  eyebrow,
  title,
  lede,
  children,
  className,
  bordered = true,
}: {
  id?: string;
  index: string;
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  children?: ReactNode;
  className?: string;
  bordered?: boolean;
}) {
  const ref = useReveal<HTMLDivElement>();

  return (
    <section
      id={id}
      className={clsx(
        "scroll-mt-20 py-20 sm:py-28",
        bordered && "border-t border-line",
        className,
      )}
    >
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <div ref={ref} className="reveal">
          <Eyebrow index={index}>{eyebrow}</Eyebrow>
          <h2 className="display mt-6 max-w-[26ch] text-[clamp(1.6rem,3.2vw,2.35rem)] text-text">
            {title}
          </h2>
          {lede && (
            <p className="mt-5 max-w-[62ch] text-[15px] leading-[1.65] text-text-dim">{lede}</p>
          )}
        </div>
        {children && <div className="mt-14">{children}</div>}
      </div>
    </section>
  );
}
