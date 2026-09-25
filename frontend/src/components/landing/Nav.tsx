import { clsx } from "clsx";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { List, X } from "@phosphor-icons/react";
import { Logo } from "./Logo";
import { BuiltOnBotChain } from "@/components/web3/BuiltOnBotChain";

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
 * link to `/#how`, which the Landing route's mount effect then scrolls to.
 */

const SECTIONS = [
  { id: "problem", label: "Problem" },
  { id: "how", label: "How it works" },
  { id: "capabilities", label: "Capabilities" },
  { id: "security", label: "Security" },
  { id: "protocol", label: "Protocol" },
] as const;

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const onLanding = pathname === "/";

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

  /** In-page anchor on the landing route, router link anywhere else. */
  const sectionLink = (
    id: string,
    label: string,
    className: string,
    onClick?: () => void,
  ) =>
    onLanding ? (
      <a key={id} href={`#${id}`} onClick={onClick} className={className}>
        {label}
      </a>
    ) : (
      <Link key={id} to={`/#${id}`} onClick={onClick} className={className}>
        {label}
      </Link>
    );

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
              sectionLink(
                s.id,
                s.label,
                "inline-flex min-h-[44px] cursor-pointer items-center text-[13px] text-text-dim no-underline transition-colors duration-150 hover:text-text",
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
                class order. Tailwind emits `.inline-flex` after `.hidden`, so
                the badge stayed visible at 390px and pushed "Launch app" onto
                two lines. A wrapper owns the breakpoint with nothing to clash. */}
            <div className="hidden md:block">
              <BuiltOnBotChain />
            </div>

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
            {SECTIONS.map((s) =>
              sectionLink(
                s.id,
                s.label,
                "flex min-h-[48px] cursor-pointer items-center border-b border-line text-[14px] text-text-dim no-underline transition-colors duration-150 hover:text-text",
                () => setMobileOpen(false),
              ),
            )}
            <Link
              to="/reference"
              onClick={() => setMobileOpen(false)}
              className="flex min-h-[48px] cursor-pointer items-center text-[14px] text-text-dim no-underline transition-colors duration-150 hover:text-text"
            >
              Reference
            </Link>

            <div className="mt-3">
              <BuiltOnBotChain />
            </div>
          </nav>
        )}
      </header>
    </>
  );
}
