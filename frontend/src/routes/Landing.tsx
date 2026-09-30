import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { Problem } from "@/components/landing/Problem";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Capabilities } from "@/components/landing/Capabilities";
import { Security } from "@/components/landing/Security";
import { ProtocolInfo } from "@/components/landing/ProtocolInfo";
import { Footer, Integration } from "@/components/landing/Integration";

/**
 * Landing page.
 *
 * Section order follows the argument rather than a template: state the mechanism
 * (hero + diagram), establish why it is needed (problem), explain it step by step
 * (how), enumerate what actually exists (capabilities), show the architecture and
 * its limits (security), give the hard numbers (protocol), then hand over to code
 * and the app (integration).
 */
export function Landing() {
  // Honour a hash arriving from another route AND a router link to "/#x" while
  // already on "/" (the component does not remount, so a mount-only effect
  // silently ignored footer links such as "How it works").
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (el) {
      requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
    }
  }, [hash]);

  return (
    <div className="min-h-dvh bg-ink-950">
      <Nav />
      <main id="main" tabIndex={-1} className="outline-none">
        <Hero />
        <Problem />
        <HowItWorks />
        <Capabilities />
        <Security />
        <ProtocolInfo />
        <Integration />
      </main>
      <Footer />
    </div>
  );
}
