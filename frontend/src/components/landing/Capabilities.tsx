import { clsx } from "clsx";
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
    constraint: "Dedicated heartbeat role. Zero spending authority.",
    tone: "text-signal",
    items: [
      {
        name: "Liveness heartbeat",
        desc: "Periodically resets the countdown timer to verify health. Cannot spend, withdraw, or transfer funds.",
      },
    ],
  },
  {
    role: "The owner",
    constraint: "Full administrative control during normal health. Locked once the fail-safe triggers.",
    tone: "text-text",
    items: [
      { name: "Treasury deposits", desc: "Fund the vault with native BOT anytime. Open to external deposits as well." },
      {
        name: "Flexible withdrawals",
        desc: "Withdraw partial balances or the entire treasury during regular operations.",
      },
      { name: "ERC-20 withdrawals", desc: "Safely retrieve specific tokens without interrupting the countdown." },
      {
        name: "Adjust timeout",
        desc: "Fine-tune silence tolerance between 30 seconds and 365 days.",
      },
      { name: "Update recovery address", desc: "Point future recovery transfers to a different cold wallet." },
      {
        name: "Rotate agent key",
        desc: "Update the heartbeat key safely while resetting the timer to prevent stranding.",
      },
      {
        name: "Token watchlist",
        desc: "Configure up to 20 tracked ERC-20 tokens for automated fail-safe sweeping.",
      },
      { name: "Transfer ownership", desc: "Hand vault governance over to a new address or multisig." },
      { name: "Rearm & reactivate", desc: "Return an evacuated vault back into active duty with a fresh agent." },
    ],
  },
  {
    role: "Permissionless keepers",
    constraint: "Open to anyone. Destination is permanently locked to your stored recovery address.",
    tone: "text-danger",
    items: [
      {
        name: "Execute fail-safe",
        desc: "Trigger emergency evacuation once silence exceeds the deadline. Funds route strictly to recovery.",
      },
      {
        name: "Sweep late native BOT",
        desc: "Forward any native funds that arrive after a trigger directly to cold storage.",
      },
      {
        name: "Sweep ERC-20 tokens",
        desc: "Evacuate remaining or untracked ERC-20 tokens to the recovery wallet post-trigger.",
      },
    ],
  },
] as const;

const READS = [
  { name: "Real-time vault telemetry", desc: "Comprehensive state inspection covering balance, timeout, deadline, grace remaining, and trigger status." },
  { name: "Batch multi-vault queries", desc: "Retrieve live state for multiple vaults in a single round-trip for high-performance dashboards." },
  { name: "Keeper scanning engine", desc: "Instantly scan and identify all rescue-eligible vaults across the network." },
  { name: "Factory authentication", desc: "Cryptographically verify authentic vaults and safeguard against spoofed contracts." },
  { name: "Predictive pre-funding", desc: "Compute future vault addresses deterministically before deployment to enable advance funding." },
];

export function Capabilities() {
  const ref = useReveal<HTMLDivElement>();
  const readsRef = useReveal<HTMLDivElement>();

  return (
    <Section
      id="capabilities"
      index="03"
      eyebrow="Capabilities"
      title="Role-based permissions and access control."
      lede="Security is rooted in strict separation of privileges. The agent key, active in a running process, can only report liveness. Treasury control remains strictly with the owner and pre-configured cold storage."
    >
      <div ref={ref} className="grid gap-6 lg:grid-cols-3">
        {GROUPS.map((group) => (
          <div
            key={group.role}
            className="reveal rounded-md border border-line bg-ink-900/60 p-5 shadow-[0_2px_8px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.02)] transition-colors hover:border-line-strong"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className={`text-[15px] font-medium ${group.tone}`}>{group.role}</h3>
              <span
                className={clsx(
                  "size-1.5 rounded-full",
                  group.tone === "text-signal"
                    ? "bg-signal"
                    : group.tone === "text-danger"
                      ? "bg-danger"
                      : "bg-text",
                )}
                aria-hidden
              />
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-text-faint">
              {group.constraint}
            </p>
            <dl className="mt-5 space-y-3">
              {group.items.map((item) => (
                <div key={item.name} className="border-t border-line/60 pt-3">
                  <dt className="text-[13px] font-medium leading-relaxed text-text">{item.name}</dt>
                  <dd className="mt-1 text-[13px] leading-relaxed text-text-dim">{item.desc}</dd>
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
              High-efficiency telemetry designed for public watchtowers, automated keeper bots, and live dashboards.
            </p>
          </div>
          <dl className="lg:col-span-8">
            {READS.map((r) => (
              <div
                key={r.name}
                className="grid gap-1.5 border-t border-line py-3.5 last:border-b sm:grid-cols-[minmax(0,17rem)_1fr] sm:gap-6"
              >
                <dt className="text-[13px] font-medium leading-relaxed text-text">{r.name}</dt>
                <dd className="text-[13px] leading-relaxed text-text-dim">{r.desc}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Section>
  );
}
