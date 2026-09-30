import { clsx } from "clsx";
import { ArrowRight, GasPump, LockKey, ShieldCheck } from "@phosphor-icons/react";
import { ButtonRouterLink } from "@/components/ui/Button";
import { useReveal } from "@/hooks/useReveal";
import { Section } from "./Section";

/**
 * Security and architecture.
 *
 * Keeps the two things that are worth a visitor's scroll: the topology diagram,
 * because the isolation claim is spatial and a drawing carries it better than a
 * paragraph, and the honest limits, because a security section that hides them
 * is dishonest. The eight safety properties moved to /reference#safety — they
 * are lookup material, and as a block of sixteen lines of small text they were
 * the densest thing on the page.
 */

export function Security() {
  const archRef = useReveal<HTMLDivElement>();

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

      {/* --- Honest limits --- */}
      <div className="mt-14 grid gap-5 lg:grid-cols-3">
        <div className="rounded-md border border-line bg-ink-900/70 p-5 shadow-[0_2px_8px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.02)]">
          <div className="flex items-center gap-2.5">
            <ShieldCheck size={16} className="text-signal" aria-hidden />
            <h3 className="text-[14px] font-medium text-text">Hardened</h3>
          </div>
          <p className="mt-2.5 text-[13px] leading-relaxed text-text-dim">
            Guards against reentrancy, exact deadline boundaries, hostile ERC-20 sweeps, and
            multi-tenant isolation.
          </p>
          <p className="mt-3 border-t border-line pt-3 text-[13px] leading-relaxed text-text-dim">
            Review the contracts before trusting significant value to them.
          </p>
        </div>

        <div className="rounded-md border border-line bg-ink-900/70 p-5 shadow-[0_2px_8px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.02)]">
          <div className="flex items-center gap-2.5">
            <LockKey size={16} className="text-text-dim" aria-hidden />
            <h3 className="text-[14px] font-medium text-text">Trust boundary</h3>
          </div>
          <p className="mt-2.5 text-[13px] leading-relaxed text-text-dim">
            Nostrom protects against <span className="text-text">agent failure</span>, not a
            malicious owner: an owner can withdraw and change the recovery address at will. Point the
            owner at a multisig if that matters.
          </p>
        </div>

        <div className="rounded-md border border-line bg-ink-900/70 p-5 shadow-[0_2px_8px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.02)]">
          <div className="flex items-center gap-2.5">
            <GasPump size={16} className="text-warn" aria-hidden />
            <h3 className="text-[14px] font-medium text-text">Agent gas</h3>
          </div>
          <p className="mt-2.5 text-[13px] leading-relaxed text-text-dim">
            An agent that runs out of gas cannot ping, and the switch fires on a healthy agent. The
            clients check at startup; monitor it in production too.
          </p>
        </div>
      </div>

      <div className="mt-8">
        <ButtonRouterLink to="/reference#safety" iconRight={<ArrowRight size={13} aria-hidden />}>
          Eight safety properties, mechanism by mechanism
        </ButtonRouterLink>
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
          EIP-1167 minimal proxies · ~80% cheaper than a full deploy
        </span>
      </div>

      <div className="grid gap-px bg-line lg:grid-cols-[minmax(0,15rem)_1fr]">
        {/* Factory + implementation */}
        <div className="bg-ink-900 px-5 py-6">
          <Node
            title="NostromFactory"
            subtitle="registry"
            tone="signal"
            lines={["deployed once", "no owner, no admin", "no upgrade path", "creates and indexes vaults"]}
          />
          <div className="my-4 ml-3 h-6 w-px bg-line-strong" aria-hidden />
          <Node
            title="NostromVault"
            subtitle="shared logic"
            tone="dim"
            lines={["one implementation", "locked at deploy", "never holds funds"]}
          />
        </div>

        {/* Clones */}
        <div className="bg-ink-900 px-5 py-6">
          <p className="mb-5 max-w-[60ch] text-[13px] leading-relaxed text-text-dim">
            Every vault is its own contract. They share code, but never storage, keys or balances.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {vaults.map((v) => (
              <div key={v.label} className="rounded border border-line bg-ink-850 px-3.5 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-signal" aria-hidden />
                  <span className="text-[13px] font-medium text-text">{v.label}</span>
                </div>
                <dl className="mt-3 space-y-1.5">
                  <Row k="owner" v={v.owner} />
                  <Row k="agent" v="agent key" />
                  <Row k="recovery" v={v.cold} />
                  <Row k="balance" v="isolated" tone="text-signal font-medium" />
                </dl>
              </div>
            ))}
          </div>
          <p className="mt-5 text-[12px] leading-relaxed text-text-faint">
            One user cannot withdraw from, or trigger, another user's vault. Firing one switch leaves
            every other vault untouched.
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
