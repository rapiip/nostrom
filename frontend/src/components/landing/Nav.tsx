import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { List, X } from "@phosphor-icons/react";
import { Logo } from "./Logo";
import { BuiltOnBotChain } from "@/components/web3/BuiltOnBotChain";
import { buttonClass } from "@/components/ui/Button";

/**
 * Public navigation, shared by the landing page and /reference.
 *
 * Transparent over the hero, then gains a hairline and a solid background once
 * the page scrolls, so the hero reads as full-bleed but the nav never floats
 * illegibly over content. "Launch app" is the single primary action and is
 * always visible, including on mobile.
 *
 * Section links are in-page on the landing route and cross-route everywhere
 * else: a bare `href="#how"` on /reference would look for that section on the
 * reference page and silently do nothing, so off-landing it becomes a router
 * link to `/#how`, which the Landing route's hash effect then scrolls to.
 *
 * On the landing page the link for the section currently in view is marked with
 * aria-current, so the nav doubles as a "you are here" indicator on a long page.
 */

const SECTIONS = [
  { id: "problem", label: "Problem" },
  { id: "how", label: "How it works" },
  { id: "capabilities", label: "Roles" },
  { id: "security", label: "Security" },
  { id: "protocol", label: "Costs" },
] as const;

/** Tailwind's `lg` breakpoint, where the inline section links appear. */
const LG = 1024;

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  const onLanding = pathname === "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Scroll-spy: highlight the section occupying the upper part of the viewport.
  useEffect(() => {
    if (!onLanding) return;
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (els.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      // A band across the top third: a section is "current" once its top edge
      // passes under the nav, and stops being current when the next one does.
      { rootMargin: "-20% 0px -70% 0px" },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [onLanding]);

  // While the mobile sheet is open: lock the page, close on Escape (returning
  // focus to the toggle), and close if the viewport grows past the breakpoint
  // where the sheet is no longer rendered, which otherwise left the body
  // scroll-locked with no visible way to unlock it.
  useEffect(() => {
    if (!mobileOpen) return;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
        toggleRef.current?.focus();
      }
    };
    const onResize = () => {
      if (window.innerWidth >= LG) setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [mobileOpen]);

  /** In-page anchor on the landing route, router link anywhere else. */
  const sectionLink = (
    id: string,
    label: string,
    className: (isActive: boolean) => string,
    onClick?: () => void,
  ) => {
    const isActive = onLanding && active === id;
    const common = {
      onClick,
      className: className(isActive),
      "aria-current": isActive ? ("location" as const) : undefined,
    };
    return onLanding ? (
      <a key={id} href={`#${id}`} {...common}>
        {label}
      </a>
    ) : (
      <Link key={id} to={`/#${id}`} {...common}>
        {label}
      </Link>
    );
  };

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
          scrolled || mobileOpen || !onLanding
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
            <Logo className="h-4 w-auto text-white" />
            <span className="text-[15px] font-medium tracking-[-0.01em] text-text">Nostrom</span>
          </Link>

          <nav aria-label="Sections" className="hidden items-center gap-5 lg:flex">
            {SECTIONS.map((s) =>
              sectionLink(s.id, s.label, (isActive) =>
                clsx(
                  "relative inline-flex min-h-[44px] cursor-pointer items-center text-[13px] no-underline transition-colors duration-150 hover:text-text",
                  // A 1px underline sits on the nav's bottom edge for the
                  // current section, so the highlight reads as position, not
                  // as a hover that got stuck.
                  "after:absolute after:inset-x-0 after:bottom-2.5 after:h-px after:origin-left after:bg-signal after:transition-transform after:duration-200",
                  isActive ? "text-text after:scale-x-100" : "text-text-dim after:scale-x-0",
                ),
              ),
            )}
            <Link
              to="/reference"
              aria-current={pathname === "/reference" ? "page" : undefined}
              className={clsx(
                "inline-flex min-h-[44px] cursor-pointer items-center text-[13px] no-underline transition-colors duration-150 hover:text-text",
                pathname === "/reference" ? "text-text" : "text-text-dim",
              )}
            >
              Reference
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {/* Wrapped rather than given `hidden md:inline-flex` directly: the
                chip's own base class sets `inline-flex`, and since both are
                display utilities the winner is decided by stylesheet order, not
                class order. A wrapper owns the breakpoint with nothing to clash. */}
            <div className="hidden md:block">
              <BuiltOnBotChain />
            </div>

            <Link to="/app" className={buttonClass({ variant: "primary", size: "md" })}>
              Launch app
            </Link>

            <button
              ref={toggleRef}
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-sections"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              className="-mr-2 inline-flex size-11 cursor-pointer items-center justify-center rounded text-text-dim transition-colors duration-150 hover:bg-ink-850 hover:text-text lg:hidden"
            >
              {mobileOpen ? <X size={18} aria-hidden /> : <List size={18} aria-hidden />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav
            id="mobile-sections"
            aria-label="Sections"
            className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-line bg-ink-950 px-5 pb-6 pt-2 lg:hidden"
          >
            {SECTIONS.map((s) =>
              sectionLink(
                s.id,
                s.label,
                (isActive) =>
                  clsx(
                    "flex min-h-[48px] cursor-pointer items-center justify-between border-b border-line text-[15px] no-underline transition-colors duration-150 hover:text-text",
                    isActive ? "text-text" : "text-text-dim",
                  ),
                () => setMobileOpen(false),
              ),
            )}
            <Link
              to="/reference"
              onClick={() => setMobileOpen(false)}
              className="flex min-h-[48px] cursor-pointer items-center text-[15px] text-text-dim no-underline transition-colors duration-150 hover:text-text"
            >
              Reference
            </Link>

            <div className="mt-4">
              <BuiltOnBotChain />
            </div>
          </nav>
        )}
      </header>
    </>
  );
}
