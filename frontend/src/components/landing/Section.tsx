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
 *
 * The header is a two-column masthead from `lg` up: headline left, lede right,
 * bottom-aligned so both columns land on a shared baseline. Stacking them was
 * the original arrangement and it left roughly half the 1240px container empty
 * beside every section opener — a void that read as a layout mistake rather
 * than as deliberate negative space, because nothing ever occupied it. Pairing
 * them also removes a full paragraph-height of scroll from each of the five
 * sections.
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
        "scroll-mt-20 py-16 sm:py-24",
        bordered && "border-t border-line",
        className,
      )}
    >
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <div
          ref={ref}
          className="reveal lg:grid lg:grid-cols-12 lg:items-end lg:gap-x-16"
        >
          <div className="lg:col-span-7">
            <Eyebrow index={index}>{eyebrow}</Eyebrow>
            <h2 className="display mt-6 max-w-[24ch] text-[clamp(1.6rem,3.2vw,2.35rem)] text-text">
              {title}
            </h2>
          </div>

          {lede && (
            <p className="mt-5 max-w-[62ch] text-[15px] leading-[1.65] text-text-dim lg:col-span-5 lg:mt-0 lg:max-w-none lg:border-l lg:border-line lg:pl-6">
              {lede}
            </p>
          )}
        </div>
        {children && <div className="mt-12 sm:mt-14">{children}</div>}
      </div>
    </section>
  );
}
