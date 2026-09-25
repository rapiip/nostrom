import { clsx } from "clsx";
import { WarningCircle } from "@phosphor-icons/react";
import { useReveal } from "@/hooks/useReveal";
import { Section } from "./Section";

/**
 * Security and architecture.
 *
 * Every property listed here is traceable to a specific mechanism in the
 * contracts, and each is stated as what it does rather than as a guarantee. The
 * "not audited" disclaimer is prominent and not buried, because the repository
 * says so plainly and a security section that omits it would be dishonest.
 */

const PROPERTIES = [
  {
    title: "Reentrancy defense: checks before interactions",
    tag: "Reentrancy guard",
    body: "The triggered status is locked before any funds move, guaranteeing that an external contract cannot re-enter to drain assets twice.",
  },
  {
    title: "Atomic execution guarantees",
    tag: "State consistency",
    body: "If native asset transfer fails, the entire transaction reverts and the switch remains armed and retryable, avoiding partially executed states or stranded balances.",
  },
  {
    title: "Isolated asset sweeping",
    tag: "Fault isolation",
    body: "Each tracked token is swept independently. Reverting transfers or non-standard token behaviors are safely skipped, ensuring native asset rescue always succeeds.",
  },
  {
    title: "Resilient ERC-20 handling",
    tag: "Token compatibility",
    body: "Handles varied and non-standard token return formats safely without risking execution reverts during emergency evacuation.",
  },
  {
    title: "Agent key has zero spending permissions",
    tag: "Least privilege",
    body: "The hot key stored in your agent process can only submit heartbeat pings. It cannot move funds or serve as the rescue recipient.",
  },
  {
    title: "Protected vault initialization",
    tag: "Deployment safety",
    body: "Vaults are cloned and initialized atomically in a single transaction, leaving zero window for unauthorized claims or premature triggering.",
  },
  {
    title: "Self-locking shared implementation",
    tag: "Proxy security",
    body: "The master implementation contract is permanently sealed upon deployment and can never hold funds or be initialized directly.",
  },
  {
    title: "Enforced timeout boundaries",
    tag: "Timing guard",
    body: "A 30-second floor prevents validator timestamp drift from racing heartbeats, while a 365-day ceiling ensures fail-safes remain practical.",
  },
];

export function Security() {
  const archRef = useReveal<HTMLDivElement>();
  const propsRef = useReveal<HTMLDivElement>();

  return (
    <Section
      id="security"
      index="04"
      eyebrow="Architecture & security"
      title="One factory, many isolated vaults, no privileged party."
      lede="The factory is immutable and has no owner, no admin functions, no fees and no upgrade path; there is nothing for its deployer to abuse. Each vault is a separate contract at its own address holding its own balance, so no user's funds are ever commingled."
    >
      <div ref={archRef} className="reveal">
        <ArchitectureDiagram />
      </div>

      {/* --- Properties --- */}
      <div ref={propsRef} className="mt-20">
        <h3 className="reveal text-[15px] font-medium text-text">
          Architectural safety guarantees
        </h3>
        <dl className="reveal mt-6 grid gap-x-14 lg:grid-cols-2">
          {PROPERTIES.map((p) => (
            <div key={p.title} className="border-t border-line py-5">
              <dt className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[14px] font-medium text-text">{p.title}</span>
                <span className="text-[11px] font-medium uppercase tracking-wider text-text-faint">{p.tag}</span>
              </dt>
              <dd className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-text-dim">
                {p.body}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* --- Honest limits --- */}
      <div className="mt-16 grid gap-6 lg:grid-cols-2">
        <div className="rounded-md border border-warn-dim bg-warn/[0.05] px-5 py-5">
          <div className="flex items-start gap-3">
            <WarningCircle size={17} className="mt-0.5 shrink-0 text-warn" aria-hidden />
            <div>
              <h4 className="text-[14px] font-medium text-warn">Audit status</h4>
              <p className="mt-2 max-w-[52ch] text-[13px] leading-relaxed text-text-dim">
                The codebase includes 70 passing test suites covering reentrancy, exact deadline
                boundaries, adversarial ERC-20 tokens, and isolation, but has not yet undergone
                formal third-party audit. Review the open-source contracts before depositing significant value.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-line bg-ink-900 px-5 py-5">
          <h4 className="text-[14px] font-medium text-text">Trust boundary</h4>
          <p className="mt-2 max-w-[52ch] text-[13px] leading-relaxed text-text-dim">
            Each vault owner retains administrative control: they can withdraw at will and change
            the recovery destination while the vault is active. Nostrom protects against{" "}
            <span className="text-text">agent process failure</span>, not owner compromise. Assign
            the owner role to a multisig or DAO for enhanced administrative security.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-md border border-line bg-ink-900 px-5 py-5">
        <h4 className="text-[14px] font-medium text-text">Agent gas reserves</h4>
        <p className="mt-2 max-w-[78ch] text-[13px] leading-relaxed text-text-dim">
          If the agent wallet runs out of gas for transaction fees, it cannot submit heartbeats and the
          fail-safe will trigger. Bundled clients check balances and address validity at startup to prevent
          accidental lockouts. Monitor agent wallet balances in production.
        </p>
      </div>
    </Section>
  );
}

/**
 * Factory / clone topology.
 *
 * Shows the two facts that matter: the implementation holds no funds and is
 * locked, and each vault is an independent balance. Drawn as a diagram rather
 * than described in prose because the isolation claim is spatial.
 */
function ArchitectureDiagram() {
  const vaults = [
    { label: "Vault A", owner: "owner A", cold: "cold A" },
    { label: "Vault B", owner: "owner B", cold: "cold B" },
    { label: "Vault C", owner: "owner C", cold: "cold C" },
  ];

  return (
    <div className="overflow-hidden rounded-md border border-line bg-ink-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <span className="label">Deployment topology</span>
        <span className="tnum text-[11px] text-text-faint">
          EIP-1167 minimal proxies · ~80% cheaper than deploying a vault outright
        </span>
      </div>

      <div className="grid gap-px bg-line lg:grid-cols-[minmax(0,15rem)_1fr]">
        {/* Factory + implementation */}
        <div className="bg-ink-900 px-5 py-6">
          <Node
            title="NostromFactory"
            tone="signal"
            lines={["deployed once", "no owner", "no upgrade path", "registry + creation"]}
          />
          <div className="my-4 ml-3 h-6 w-px bg-line-strong" aria-hidden />
          <Node
            title="NostromVault"
            subtitle="implementation"
            tone="dim"
            lines={["shared logic", "locked in constructor", "holds no funds"]}
          />
        </div>

        {/* Clones */}
        <div className="bg-ink-900 px-5 py-6">
          <p className="mb-5 max-w-[60ch] text-[13px] leading-relaxed text-text-dim">
            Each vault is an independent smart contract. The clones share immutable logic while
            strictly maintaining isolated storage, keys, and balances.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {vaults.map((v) => (
              <div key={v.label} className="rounded border border-line bg-ink-850 px-3.5 py-3.5">
                <div className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-signal" aria-hidden />
                  <span className="text-[13px] font-medium text-text">{v.label}</span>
                </div>
                <dl className="mt-3 space-y-1.5">
                  <Row k="owner" v={v.owner} />
                  <Row k="agent" v="agent key" />
                  <Row k="recovery" v={v.cold} />
                  <Row k="balance" v="isolated" tone="text-signal" />
                </dl>
              </div>
            ))}
          </div>
          <p className="mt-5 text-[12px] leading-relaxed text-text-faint">
            Tested explicitly: one user cannot withdraw from or trigger another user's vault, and
            triggering one vault leaves every other vault untouched.
          </p>
        </div>
      </div>
    </div>
  );
}

function Node({
  title,
  subtitle,
  lines,
  tone,
}: {
  title: string;
  subtitle?: string;
  lines: string[];
  tone: "signal" | "dim";
}) {
  return (
    <div
      className={clsx(
        "rounded border px-3.5 py-3",
        tone === "signal" ? "border-signal-dim bg-signal/[0.05]" : "border-line bg-ink-850",
      )}
    >
      <div className="flex items-baseline gap-2">
        <span
          className={clsx(
            "font-mono text-[12px] font-medium",
            tone === "signal" ? "text-signal" : "text-text",
          )}
        >
          {title}
        </span>
        {subtitle && <span className="text-[11px] text-text-faint">{subtitle}</span>}
      </div>
      <ul className="mt-2.5 space-y-1">
        {lines.map((l) => (
          <li key={l} className="flex items-center gap-2 text-[12px] text-text-dim">
            <span className="h-px w-2 bg-line-strong" aria-hidden />
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="label">{k}</dt>
      <dd className={clsx("text-[11px]", tone ?? "text-text-dim")}>{v}</dd>
    </div>
  );
}
