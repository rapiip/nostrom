import { Link } from "react-router-dom";
import { ArrowRight, GithubLogo, Terminal } from "@phosphor-icons/react";
import { LINKS } from "@/config/contracts";
import { useReveal } from "@/hooks/useReveal";
import { Logo } from "./Logo";
import { BuiltOnBotChain } from "@/components/web3/BuiltOnBotChain";

/**
 * Integration + final CTA.
 *
 * The last section before the footer is a real code sample rather than another
 * banner: the audience is developers embedding a heartbeat into an agent, and the
 * most persuasive thing left to show is how little code that takes. The snippet
 * is copied from agent/nostrom-heartbeat.js usage in the README, so it is
 * accurate.
 */
export function Integration() {
  const ref = useReveal<HTMLDivElement>();

  return (
    <section className="border-t border-line py-20 sm:py-28">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <div ref={ref} className="grid gap-x-14 gap-y-12 lg:grid-cols-12">
          {/* min-w-0 is required on both tracks: the code block below contains
              pre-formatted lines whose intrinsic width would otherwise force the
              grid wider than the viewport on small screens. */}
          <div className="reveal min-w-0 lg:col-span-5">
            <div className="flex items-center gap-3">
              <span className="tnum text-[11px] font-medium text-signal">06</span>
              <span className="h-px w-8 bg-line-strong" aria-hidden />
              <span className="label">Integration</span>
            </div>

            <h2 className="display mt-6 text-[clamp(1.6rem,3.2vw,2.35rem)] text-text">
              Six lines inside your agent.
            </h2>

            <p className="mt-5 max-w-[46ch] text-[15px] leading-[1.65] text-text-dim">
              Heartbeat libraries are available for Node.js and Python with built-in automated scheduling
              and exponential backoff.
            </p>

            <p className="mt-5 max-w-[46ch] text-[15px] leading-[1.65] text-text-dim">
              The health check hook is what protects your funds: withhold the heartbeat whenever your agent
              is degraded or unhealthy, allowing the fail-safe to trigger on its own.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                to="/app/new"
                className="group inline-flex min-h-[48px] cursor-pointer items-center gap-2 rounded border border-signal bg-signal px-5 text-[14px] font-medium text-ink-950 no-underline shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all duration-150 hover:bg-signal/90 hover:shadow-[0_0_20px_-3px_rgba(125,211,160,0.35)] active:scale-[0.985]"
              >
                Create a vault
                <ArrowRight
                  size={14}
                  aria-hidden
                  className="transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </Link>
              <Link
                to="/app/keeper"
                className="inline-flex min-h-[48px] cursor-pointer items-center gap-2 rounded border border-line-strong bg-ink-850 px-5 text-[14px] text-text no-underline shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-150 hover:border-text-faint hover:bg-ink-750 active:scale-[0.985]"
              >
                <Terminal size={14} aria-hidden />
                Run a keeper
              </Link>
            </div>
          </div>

          <div className="reveal min-w-0 lg:col-span-7">
            <CodeBlock />
          </div>
        </div>
      </div>
    </section>
  );
}

function CodeBlock() {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-ink-900 shadow-[0_4px_24px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-2.5">
        <span className="label">agent/nostrom-heartbeat.js</span>
        <span className="tnum text-[11px] text-text-faint">Node · ethers v6</span>
      </div>
      <pre className="overflow-x-auto px-4 py-5 font-mono text-[12.5px] leading-[1.75] text-text-dim">
        <code>
          <Ln>
            <K>const</K> {"{ NostromHeartbeat } = "}
            <F>require</F>
            {"("}
            <S>"./agent/nostrom-heartbeat"</S>
            {");"}
          </Ln>
          <Ln />
          <Ln>
            <K>const</K> heartbeat = <K>new</K> <T>NostromHeartbeat</T>
            {"({"}
          </Ln>
          <Ln indent={1}>
            rpcUrl: <S>"https://rpc.bohr.life"</S>,
          </Ln>
          <Ln indent={1}>vaultAddress: process.env.NOSTROM_ADDRESS,</Ln>
          <Ln indent={1}>privateKey: process.env.AGENT_PRIVATE_KEY,</Ln>
          <Ln indent={1}>
            intervalSeconds: <N>3600</N>,
          </Ln>
          <Ln />
          <Ln indent={1}>
            <C>{"// Only report liveness if the agent is genuinely well."}</C>
          </Ln>
          <Ln indent={1}>
            healthCheck: <K>async</K> () =&gt; myAgent.<F>isHealthy</F>(),
          </Ln>
          <Ln>{"});"}</Ln>
          <Ln />
          <Ln>
            <K>await</K> heartbeat.<F>start</F>(); <C>{"// pings now, then on an interval"}</C>
          </Ln>
        </code>
      </pre>
    </div>
  );
}

/* Minimal syntax colouring. Only three hues, all already in the palette; a
   full highlighter would add a dependency and a rainbow. */
const Ln = ({ children, indent = 0 }: { children?: React.ReactNode; indent?: number }) => (
  <span className="block min-h-[1.75em] whitespace-pre">
    {"  ".repeat(indent)}
    {children}
  </span>
);
const K = ({ children }: { children: React.ReactNode }) => (
  <span className="text-signal">{children}</span>
);
const S = ({ children }: { children: React.ReactNode }) => (
  <span className="text-warn">{children}</span>
);
const N = ({ children }: { children: React.ReactNode }) => (
  <span className="text-warn">{children}</span>
);
const F = ({ children }: { children: React.ReactNode }) => (
  <span className="text-text">{children}</span>
);
const T = ({ children }: { children: React.ReactNode }) => (
  <span className="text-text">{children}</span>
);
const C = ({ children }: { children: React.ReactNode }) => (
  <span className="text-text-faint italic">{children}</span>
);

/* ===========================================================================
   Footer
   =========================================================================== */

export function Footer() {
  return (
    <footer className="border-t border-line bg-ink-950">
      <div className="mx-auto max-w-[1240px] px-5 py-14 sm:px-8">
        <div className="grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2.5">
              <Logo className="h-4 w-auto text-signal" />
              <span className="text-[15px] font-medium tracking-[-0.01em] text-text">Nostrom</span>
            </div>
            <p className="mt-4 max-w-[34ch] text-[13px] leading-relaxed text-text-dim">
              Fail-safe vaults for autonomous agent treasuries. Silence is the trigger.
            </p>

            <div className="mt-6">
              <BuiltOnBotChain variant="lockup" />
            </div>
          </div>

          <FooterColumn
            title="Application"
            links={[
              { label: "Vault console", to: "/app" },
              { label: "Create a vault", to: "/app/new" },
              { label: "Open by address", to: "/app/lookup" },
              { label: "Keeper scan", to: "/app/keeper" },
            ]}
          />

          <FooterColumn
            title="Protocol"
            links={[
              { label: "How it works", href: "/#how" },
              { label: "Capabilities", href: "/#capabilities" },
              { label: "Architecture", href: "/#security" },
              { label: "Parameters", href: "/#protocol" },
            ]}
          />

          <FooterColumn
            title="Resources"
            links={[
              { label: "GitHub", href: LINKS.github, external: true },
              { label: "BOT Chain docs", href: LINKS.botchainDocs, external: true },
              { label: "Testnet explorer", href: LINKS.testnetExplorer, external: true },
              { label: "Mainnet explorer", href: LINKS.mainnetExplorer, external: true },
            ]}
          />
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-7">
          <p className="text-[12px] text-text-faint">
            MIT licensed. Open source on BOT Chain.
          </p>
          <a
            href={LINKS.github}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Source on GitHub"
            className="inline-flex size-8 cursor-pointer items-center justify-center rounded text-text-faint transition-colors duration-150 hover:bg-ink-850 hover:text-text"
          >
            <GithubLogo size={16} aria-hidden />
          </a>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; to?: string; href?: string; external?: boolean }[];
}) {
  return (
    <div>
      <h3 className="label">{title}</h3>
      <ul className="mt-3 space-y-0.5">
        {links.map((l) => (
          <li key={l.label}>
            {l.to ? (
              <Link
                to={l.to}
                className="inline-flex min-h-[28px] cursor-pointer items-center text-[13px] text-text-dim no-underline transition-colors duration-150 hover:text-text"
              >
                {l.label}
              </Link>
            ) : (
              <a
                href={l.href}
                {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="inline-flex min-h-[28px] cursor-pointer items-center text-[13px] text-text-dim no-underline transition-colors duration-150 hover:text-text"
              >
                {l.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
