import { clsx } from "clsx";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { GithubLogo, List, X } from "@phosphor-icons/react";
import { LINKS } from "@/config/contracts";
import { Logo } from "./Logo";
import { BuiltOnBotChain } from "@/components/web3/BuiltOnBotChain";

/**
 * Landing navigation.
 *
 * Transparent over the hero, then gains a hairline and a solid background once
 * the page scrolls, so the hero reads as full-bleed but the nav never floats
 * illegibly over content. Section links are in-page; "Launch app" is the single
 * primary action and is always visible, including on mobile.
 */

const SECTIONS = [
  { href: "#problem", label: "Problem" },
  { href: "#how", label: "How it works" },
  { href: "#capabilities", label: "Capabilities" },
  { href: "#security", label: "Security" },
  { href: "#protocol", label: "Protocol" },
] as const;

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock the page behind the mobile sheet.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded focus:border focus:border-signal focus:bg-ink-900 focus:px-3 focus:py-2 focus:text-[13px] focus:text-text"
      >
        Skip to content
      </a>

      <header
        className={clsx(
          "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
          scrolled || mobileOpen
            ? "border-b border-line bg-ink-950/92 backdrop-blur-sm"
            : "border-b border-transparent",
        )}
      >
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-8 px-5 sm:px-8">
          <Link
            to="/"
            className="flex h-11 shrink-0 items-center gap-2.5 no-underline"
            aria-label="Nostrom home"
          >
            <Logo className="h-4 w-auto text-signal" />
            <span className="text-[15px] font-medium tracking-[-0.01em] text-text">Nostrom</span>
          </Link>

          <nav aria-label="Sections" className="hidden items-center gap-5 lg:flex">
            {SECTIONS.map((s) => (
              <a
                key={s.href}
                href={s.href}
                className="inline-flex min-h-[44px] cursor-pointer items-center text-[13px] text-text-dim no-underline transition-colors duration-150 hover:text-text"
              >
                {s.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <BuiltOnBotChain className="hidden md:inline-flex" />

            <a
              href={LINKS.github}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Source on GitHub"
              title="Source on GitHub"
              className="hidden size-9 cursor-pointer items-center justify-center rounded text-text-dim transition-colors duration-150 hover:bg-ink-850 hover:text-text sm:inline-flex"
            >
              <GithubLogo size={17} aria-hidden />
            </a>

            <Link
              to="/app"
              className="inline-flex min-h-[40px] cursor-pointer items-center rounded border border-signal bg-signal px-3.5 text-[13px] font-medium text-ink-950 no-underline shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all duration-150 hover:bg-signal/90 hover:shadow-[0_0_16px_-3px_rgba(125,211,160,0.3)] active:scale-[0.985]"
            >
              Launch app
            </Link>

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-expanded={mobileOpen}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              className="inline-flex size-9 cursor-pointer items-center justify-center rounded text-text-dim transition-colors duration-150 hover:bg-ink-850 hover:text-text lg:hidden"
            >
              {mobileOpen ? <X size={17} aria-hidden /> : <List size={17} aria-hidden />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav
            aria-label="Sections"
            className="border-t border-line bg-ink-950 px-5 pb-6 pt-2 lg:hidden"
          >
            {SECTIONS.map((s) => (
              <a
                key={s.href}
                href={s.href}
                onClick={() => setMobileOpen(false)}
                className="flex min-h-[48px] cursor-pointer items-center border-b border-line text-[14px] text-text-dim no-underline transition-colors duration-150 last:border-b-0 hover:text-text"
              >
                {s.label}
              </a>
            ))}
            <a
              href={LINKS.github}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex min-h-[48px] cursor-pointer items-center gap-2 text-[14px] text-text-dim no-underline hover:text-text"
            >
              <GithubLogo size={16} aria-hidden />
              GitHub
            </a>

            <div className="mt-3">
              <BuiltOnBotChain />
            </div>
          </nav>
        )}
      </header>
    </>
  );
}
