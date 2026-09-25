import { useReveal } from "@/hooks/useReveal";
import { Section } from "./Section";

/**
 * Capabilities.
 *
 * Every entry here is a function that exists in contracts/NostromFactory.sol.
 * Nothing is aspirational, and nothing is on a roadmap. The layout is a
 * definition list grouped by who can invoke what, which doubles as an
 * access-control summary: more useful than a grid of identical icon cards, and
 * it mirrors how the contract is actually organised.
 */

const GROUPS = [
  {
    role: "The agent",
    constraint: "One function. Cannot move funds.",
    tone: "text-signal",
    items: [
      {
        name: "ping()",
        desc: "Proof of life. Resets the countdown and increments the lifetime ping count.",
      },
    ],
  },
  {
    role: "The owner",
    constraint: "Full control while the vault is healthy. Frozen once the switch fires.",
    tone: "text-text",
    items: [
      { name: "deposit()", desc: "Fund the vault with native BOT. Open to anyone, in fact." },
      {
        name: "withdrawByOwner() · withdrawAllByOwner()",
        desc: "Normal withdrawals, any amount up to the balance.",
      },
      { name: "withdrawTokenByOwner()", desc: "Move an ERC-20 out without firing the switch." },
      {
        name: "updateTimeoutPeriod()",
        desc: "Re-tune how much silence is tolerated, within 30s to 365d.",
      },
      { name: "updateRecoveryAddress()", desc: "Point the rescue at a different cold wallet." },
      {
        name: "updateAgentAddress()",
        desc: "Rotate the heartbeat key. Also resets the clock, so a rotation cannot strand you.",
      },
      {
        name: "addTrackedToken() · removeTrackedToken()",
        desc: "Manage the ERC-20 sweep watchlist, up to 20 tokens.",
      },
      { name: "transferOwnership()", desc: "Hand the vault to another address." },
      { name: "rearm()", desc: "Return a fired vault to service with a fresh agent." },
    ],
  },
  {
    role: "Anyone",
    constraint: "No permission, no allowlist, no registration.",
    tone: "text-danger",
    items: [
      {
        name: "executeDeadManSwitch()",
        desc: "Fire the switch once the heartbeat has lapsed. Destination is fixed to the stored recovery address.",
      },
      {
        name: "sweepNativeToRecovery()",
        desc: "Push BOT that arrived after the trigger on to recovery.",
      },
      {
        name: "sweepTokenToRecovery()",
        desc: "Push any ERC-20 to recovery post-trigger, including tokens that were never on the watchlist.",
      },
    ],
  },
] as const;

const READS = [
  { name: "status()", desc: "Owner, agent, recovery, balance, timeout, last ping, deadline, grace remaining, triggered, executable, and ping count in one call." },
  { name: "getVaultsSnapshot(address[])", desc: "Live state for many vaults in a single RPC round-trip. This console uses it to render a dashboard without an N-call fan-out." },
  { name: "getExecutableVaults(offset, limit)", desc: "Every vault that can be rescued right now. The keeper query, scanned on-chain." },
  { name: "isVault(address)", desc: "Whether an address is a genuine vault from this factory. This app gates on it so a look-alike contract cannot be mistaken for a real vault." },
  { name: "predictVaultAddress(creator, salt)", desc: "CREATE2 address, computable before the vault exists so it can be funded in advance." },
];

export function Capabilities() {
  const ref = useReveal<HTMLDivElement>();
  const readsRef = useReveal<HTMLDivElement>();

  return (
    <Section
      id="capabilities"
      index="03"
      eyebrow="Capabilities"
      title="What each key can actually do."
      lede="The access model is the security model, so it is worth reading literally. The agent key, the one exposed in a running process, can do exactly one thing, and it is not spending."
    >
      <div ref={ref} className="grid gap-x-14 gap-y-12 lg:grid-cols-3">
        {GROUPS.map((group) => (
          <div key={group.role} className="reveal">
            <h3 className={`text-[15px] font-medium ${group.tone}`}>{group.role}</h3>
            <p className="mt-1.5 max-w-[34ch] text-[12px] leading-relaxed text-text-faint">
              {group.constraint}
            </p>
            <dl className="mt-5">
              {group.items.map((item) => (
                <div key={item.name} className="border-t border-line py-3.5 last:border-b">
                  <dt className="font-mono text-[12px] leading-relaxed text-text">{item.name}</dt>
                  <dd className="mt-1.5 text-[13px] leading-relaxed text-text-dim">{item.desc}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      {/* --- Reads --- */}
      <div ref={readsRef} className="mt-20 border-t border-line pt-12">
        <div className="reveal grid gap-x-14 gap-y-8 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <h3 className="text-[15px] font-medium text-text">Built for watchers</h3>
            <p className="mt-2.5 max-w-[38ch] text-[13px] leading-relaxed text-text-dim">
              The read surface is designed for dashboards and keeper bots, not just for humans
              clicking through one vault at a time.
            </p>
          </div>
          <dl className="lg:col-span-8">
            {READS.map((r) => (
              <div
                key={r.name}
                className="grid gap-1.5 border-t border-line py-3.5 last:border-b sm:grid-cols-[minmax(0,17rem)_1fr] sm:gap-6"
              >
                <dt className="font-mono text-[12px] leading-relaxed text-text">{r.name}</dt>
                <dd className="text-[13px] leading-relaxed text-text-dim">{r.desc}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Section>
  );
}
