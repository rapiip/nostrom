import { clsx } from "clsx";
import { ArrowUpRight } from "@phosphor-icons/react";
import { LINKS } from "@/config/contracts";
import { BotChainMark } from "./BotChainMark";

/**
 * "Built on BOT Chain" attribution.
 *
 * Nostrom runs entirely on BOT Chain, so the collaboration is stated plainly and
 * links to the network's own site. The BOT Chain green (`text-botchain`) is used
 * for the mark so it reads as *their* brand, not a Nostrom status colour — the
 * one place partner colour is allowed to enter an otherwise status-only palette.
 *
 * Two shapes:
 *   variant="chip"    — bordered pill, for nav / dense rows (default)
 *   variant="lockup"  — larger stacked mark + label, for footers / hero
 */
export function BuiltOnBotChain({
  variant = "chip",
  className,
}: {
  variant?: "chip" | "lockup";
  className?: string;
}) {
  if (variant === "lockup") {
    return (
      <a
        href={LINKS.botchain}
        target="_blank"
        rel="noopener noreferrer"
        className={clsx(
          "group inline-flex items-center gap-3 no-underline",
          className,
        )}
      >
        <BotChainMark className="h-7 w-auto shrink-0 text-botchain" />
        <span className="flex flex-col leading-tight">
          <span className="text-[11px] uppercase tracking-[0.14em] text-text-faint">
            Built on
          </span>
          <span className="inline-flex items-center gap-1 text-[15px] font-medium text-text transition-colors duration-150 group-hover:text-botchain">
            BOT Chain
            <ArrowUpRight
              size={13}
              aria-hidden
              className="text-text-faint transition-colors duration-150 group-hover:text-botchain"
            />
          </span>
        </span>
      </a>
    );
  }

  return (
    <a
      href={LINKS.botchain}
      target="_blank"
      rel="noopener noreferrer"
      title="Nostrom runs on BOT Chain: visit botchain.ai"
      className={clsx(
        "group inline-flex min-h-[32px] cursor-pointer items-center gap-2 rounded-full border border-line-strong bg-ink-900 px-3 py-1 no-underline transition-colors duration-150 hover:border-botchain/60 hover:bg-ink-850",
        className,
      )}
    >
      <BotChainMark className="h-4 w-auto shrink-0 text-botchain" />
      <span className="text-[12px] font-medium text-text-dim transition-colors duration-150 group-hover:text-text">
        Built on <span className="text-text">BOT Chain</span>
      </span>
    </a>
  );
}
