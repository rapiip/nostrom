import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Terminal } from "@phosphor-icons/react";
import { LINKS, deployedContractAddress } from "@/config/contracts";
import { botchainMainnet, explorerAddressUrl } from "@/config/chains";
import { useReveal } from "@/hooks/useReveal";
import { ButtonRouterLink, ButtonLink } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/Address";
import { Eyebrow } from "@/components/ui/Panel";
import { Logo } from "./Logo";
import { BuiltOnBotChain } from "@/components/web3/BuiltOnBotChain";

/**
 * Integration + final CTA.
 *
 * The last section before the footer is a real code sample rather than another
 * banner: the audience is developers embedding a heartbeat into an agent, and the
 * most persuasive thing left to show is how little code that takes. The snippet
 * is copied from agent/nostrom-heartbeat.js usage in the README, so it is
 * accurate, and it can be copied verbatim.
 */

/** Plain-text copy of the snippet, for the copy button. Kept next to the JSX. */
const SNIPPET = `const { NostromHeartbeat } = require("./agent/nostrom-heartbeat");

const heartbeat = new NostromHeartbeat({
  rpcUrl: "https://rpc.botchain.ai",
  vaultAddress: process.env.NOSTROM_ADDRESS,
  privateKey: process.env.AGENT_PRIVATE_KEY,
  intervalSeconds: 3600,

  // Only report liveness if the agent is genuinely well.
  healthCheck: async () => myAgent.isHealthy(),
});

await heartbeat.start(); // pings now, then on an interval
`;

export function Integration() {
  const ref = useReveal<HTMLDivElement>();

  // Direct link to the deployed Nostrom contract on the mainnet explorer,
  // falling back to the explorer homepage only if no address is configured.
  const mainnetContract = deployedContractAddress(botchainMainnet.id);
  const contractUrl =
    (mainnetContract && explorerAddressUrl(botchainMainnet.id, mainnetContract)) ||
    LINKS.mainnetExplorer;

  return (
    <section id="integration" className="border-t border-line py-20 sm:py-28">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <div ref={ref} className="grid gap-x-14 gap-y-12 lg:grid-cols-12">
          {/* min-w-0 is required on both tracks: the code block below contains
              pre-formatted lines whose intrinsic width would otherwise force the
              grid wider than the viewport on small screens. */}
          <div className="reveal min-w-0 lg:col-span-5">
            <Eyebrow index="06">Integration</Eyebrow>

            <h2 className="display mt-6 text-[clamp(1.6rem,3.2vw,2.35rem)] text-text">
              A few lines inside your agent.
            </h2>

            <p className="mt-5 max-w-[46ch] text-[15px] leading-[1.65] text-text-dim">
              Heartbeat clients for Node.js and Python, with scheduling, retries and a gas
              pre-flight check built in. The health check is what makes it a real fail-safe: when
              your agent is unwell it stops checking in, and the vault protects itself.
            </p>

            <ul className="mt-6 flex flex-col gap-2 text-[13px] text-text-dim">
              <Bullet>Refuses to start if its key is not the vault's agent</Bullet>
              <Bullet>Pings every third of the timeout, so two missed pings in a row are survivable</Bullet>
              <Bullet>Checks the agent wallet can pay for gas before it starts</Bullet>
            </ul>

            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonRouterLink
                to="/app/new"
                variant="primary"
                size="lg"
                iconRight={<ArrowRight size={14} aria-hidden />}
              >
                Create a vault
              </ButtonRouterLink>
              <ButtonRouterLink
                to="/app/keeper"
                size="lg"
                icon={<Terminal size={14} aria-hidden />}
              >
                Run a keeper
              </ButtonRouterLink>
              <ButtonLink
                href={contractUrl}
                target="_blank"
                rel="noopener noreferrer"
                size="lg"
                iconRight={<ArrowUpRight size={14} aria-hidden />}
              >
                View Contract
              </ButtonLink>
            </div>
          </div>

          <div className="reveal min-w-0 lg:col-span-7 lg:self-center">
            <CodeBlock />
          </div>
        </div>
      </div>
    </section>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-[7px] size-1 shrink-0 rounded-full bg-signal" aria-hidden />
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}

function CodeBlock() {
  return (
    <figure className="m-0 overflow-hidden rounded-md border border-line bg-ink-900 shadow-[0_4px_24px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="flex items-center justify-between gap-4 border-b border-line py-1.5 pr-2 pl-4">
        <figcaption className="label truncate">agent.js</figcaption>
        <div className="flex items-center gap-3">
          <span className="tnum hidden text-[11px] text-text-faint sm:inline">
            Node · ethers v6
          </span>
          <span className="text-[11px] text-text-faint sm:hidden">Scroll →</span>
          <CopyButton value={SNIPPET} label="code sample" />
        </div>
      </div>
      <div className="relative">
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
            rpcUrl: <S>"https://rpc.botchain.ai"</S>,
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
        {/* Lines are longer than a phone is wide. The fade says "this scrolls"
            instead of the code simply appearing cut off mid-identifier. */}
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-ink-900 to-transparent sm:hidden"
          aria-hidden
        />
      </div>
    </figure>
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

type FooterLink = { label: string; to?: string; href?: string };

export function Footer() {
  // Direct link to the deployed Nostrom contract source on the mainnet
  // explorer. Falls back to the explorer homepage only if no address is
  // configured, so the link is never broken.
  const mainnetContract = deployedContractAddress(botchainMainnet.id);
  const contractUrl =
    (mainnetContract && explorerAddressUrl(botchainMainnet.id, mainnetContract)) ||
    LINKS.mainnetExplorer;

  return (
    <footer className="border-t border-line bg-ink-950">
      <div className="mx-auto max-w-[1240px] px-5 py-14 sm:px-8">
        <div className="grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link to="/" className="inline-flex min-h-[44px] items-center gap-2.5 no-underline">
              <Logo className="h-4 w-auto text-white" />
              <span className="text-[15px] font-medium tracking-[-0.01em] text-text">Nostrom</span>
            </Link>
            <p className="mt-2 max-w-[34ch] text-[13px] leading-relaxed text-text-dim">
              Fail-safe vaults for autonomous agent treasuries. Silence is the trigger.
            </p>

            <div className="mt-5">
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

          {/* Router links, not bare hrefs: "/#how" as an <a href> reloaded the
              whole app (and re-downloaded the wallet bundle) on every click. */}
          <FooterColumn
            title="Protocol"
            links={[
              { label: "How it works", to: "/#how" },
              { label: "Architecture", to: "/#security" },
              { label: "Permission matrix", to: "/reference#permissions" },
              { label: "Safety properties", to: "/reference#safety" },
              { label: "Parameters & gas", to: "/reference#parameters" },
            ]}
          />

          <FooterColumn
            title="Resources"
            links={[
              { label: "View Contract", href: contractUrl },
              { label: "BOT Chain docs", href: LINKS.botchainDocs },
              { label: "Testnet explorer", href: LINKS.testnetExplorer },
              { label: "Mainnet explorer", href: LINKS.mainnetExplorer },
            ]}
          />
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-line pt-7 text-[12px] text-text-faint sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Nostrom · MIT licensed</p>
          <p>
            Use at your own risk.
          </p>
        </div>
      </div>
    </footer>
  );
}

const FOOTER_LINK =
  "inline-flex min-h-[32px] cursor-pointer items-center gap-1 text-[13px] text-text-dim no-underline transition-colors duration-150 hover:text-text";

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div>
      <h3 className="label">{title}</h3>
      <ul className="mt-3 space-y-0.5">
        {links.map((l) => (
          <li key={l.label}>
            {l.to ? (
              <Link to={l.to} className={FOOTER_LINK}>
                {l.label}
              </Link>
            ) : (
              <a href={l.href} target="_blank" rel="noopener noreferrer" className={FOOTER_LINK}>
                {l.label}
                <ArrowUpRight size={11} aria-hidden className="text-text-faint" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
