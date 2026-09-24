import { useEffect } from "react";
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
  // Honour a hash arriving from another route, which the router alone won't do.
  useEffect(() => {
    if (!window.location.hash) return;
    const el = document.querySelector(window.location.hash);
    if (el) {
      requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
    }
  }, []);

  return (
    <div className="min-h-dvh bg-ink-950">
      <Nav />
      <main id="main">
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
