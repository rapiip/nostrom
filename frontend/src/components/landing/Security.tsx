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
    title: "Reentrancy: effects before interactions",
    body: "isTriggered is set before any value moves, so a hostile recoveryAddress cannot re-enter and drain twice. Tested with an attacker contract.",
    ref: "executeDeadManSwitch",
  },
  {
    title: "Atomic failure, not partial failure",
    body: "If the native transfer fails (say the recovery address is a contract that reverts on receive), the whole transaction reverts and isTriggered stays false. The switch remains armed and retryable rather than half-executed with funds stranded.",
    ref: "_sendNative",
  },
  {
    title: "A broken token cannot brick the rescue",
    body: "Each tracked ERC-20 is swept in isolation. A reverting balanceOf, a failing transfer, a token returning false, or a non-ERC-20 address is logged as TokenRescueFailed and skipped. The native rescue always proceeds.",
    ref: "_sweepTrackedTokens",
  },
  {
    title: "Return values decoded as uint256, not bool",
    body: "abi.decode(data, (bool)) reverts when the word is anything other than 0 or 1, and a token returning bytes1 produces 0x0100…00. Decoding as bool would have let one weird token take down the entire fail-safe. There is a test for exactly this.",
    ref: "_tryTransferToken",
  },
  {
    title: "The agent key is deliberately powerless",
    body: "It can call ping() and nothing else. The initialiser also refuses a recoveryAddress equal to the agentAddress, so the hot key can never be the rescue destination.",
    ref: "onlyAgent",
  },
  {
    title: "Unconfigured clones cannot be griefed",
    body: "A fresh clone has timeoutPeriod == 0, so its deadline is already in the past. Every permissionless entry point requires initialisation, or anyone could flip isTriggered on a vault before its owner set it up.",
    ref: "whenInitialized",
  },
  {
    title: "The implementation locks itself",
    body: "The shared vault logic locks its own status in its constructor, so it can never be initialised or hold funds. initialize() is callable exactly once, and the factory calls it in the same transaction as the clone; there is no window for anyone to claim someone else's vault.",
    ref: "constructor",
  },
  {
    title: "Bounded timeouts",
    body: "A 30-second floor keeps validator clock drift from racing a heartbeat. A 365-day ceiling prevents configuring a switch that can never fire, which would not be a safety device.",
    ref: "_validateTimeout",
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
          Design decisions worth checking yourself
        </h3>
        <dl className="reveal mt-6 grid gap-x-14 lg:grid-cols-2">
          {PROPERTIES.map((p) => (
            <div key={p.title} className="border-t border-line py-5">
              <dt className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[14px] font-medium text-text">{p.title}</span>
                <code className="font-mono text-[11px] text-text-faint">{p.ref}</code>
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
              <h4 className="text-[14px] font-medium text-warn">Not audited</h4>
              <p className="mt-2 max-w-[52ch] text-[13px] leading-relaxed text-text-dim">
                This was built for a hackathon. It compiles with solc 0.8.24 and has 70 passing
                tests, including reentrancy, exact deadline boundaries, hostile ERC-20s and
                multi-tenant isolation, but it has not been reviewed by a third party. Read the
                contracts before trusting real value to them.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-line bg-ink-900 px-5 py-5">
          <h4 className="text-[14px] font-medium text-text">Trust boundary</h4>
          <p className="mt-2 max-w-[52ch] text-[13px] leading-relaxed text-text-dim">
            Each vault's owner is trusted for that vault: they can withdraw at will and change the
            recovery address while the vault is healthy. Nostrom protects against{" "}
            <span className="text-text">agent failure</span>, not against a malicious owner; point
            the owner at a multisig if that matters. The factory trusts nobody and has no privileges
            over any vault.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-md border border-line bg-ink-900 px-5 py-5">
        <h4 className="text-[14px] font-medium text-text">The agent still needs gas</h4>
        <p className="mt-2 max-w-[78ch] text-[13px] leading-relaxed text-text-dim">
          If the agent wallet runs out of BOT it cannot ping, and the switch will fire on a perfectly
          healthy agent. The bundled heartbeat clients check this at startup and fail loudly if the
          key does not match the on-chain agentAddress, because a silent key mismatch would mean
          every ping reverts. Monitor it in production too.
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
            Every user calls <code className="font-mono text-[12px] text-text">createVault</code> and
            receives their own contract. The clones delegate logic to the implementation but each
            keeps its own storage and its own balance.
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
