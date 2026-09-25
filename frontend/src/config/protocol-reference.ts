/**
 * Protocol reference content.
 *
 * Lives here rather than inside a component because it is shared: the /reference
 * page renders it in full, and the landing page renders counts and headline
 * figures derived from it. Keeping one copy means the landing page cannot claim
 * "9 functions" while the reference lists ten.
 *
 * Every entry corresponds to something that exists in contracts/NostromFactory.sol.
 * Nothing here is aspirational and nothing is on a roadmap.
 */

export type Role = {
  id: string;
  role: string;
  constraint: string;
  /** One-line summary for the landing page, where the full list is not shown. */
  summary: string;
  tone: "signal" | "neutral" | "danger";
  items: readonly { name: string; desc: string }[];
};

export const ROLES: readonly Role[] = [
  {
    id: "agent",
    role: "The agent",
    constraint: "Dedicated heartbeat role. Zero spending authority.",
    summary: "Can prove it is alive. Cannot touch the money.",
    tone: "signal",
    items: [{ name: "Liveness heartbeat", desc: "Resets the countdown. Nothing else." }],
  },
  {
    id: "owner",
    role: "The owner",
    constraint: "Full control while the vault is healthy. Locked once the fail-safe fires.",
    summary: "Funds and configuration, until the switch fires.",
    tone: "neutral",
    items: [
      { name: "Deposit", desc: "Native BOT, from any address." },
      { name: "Withdraw", desc: "Part of the balance, or all of it." },
      { name: "Withdraw ERC-20", desc: "Specific tokens, countdown untouched." },
      { name: "Adjust timeout", desc: "30 seconds to 365 days." },
      { name: "Change recovery address", desc: "Point the rescue at a different cold wallet." },
      { name: "Rotate agent key", desc: "Swap the heartbeat key; resets the clock." },
      { name: "Token watchlist", desc: "Up to 20 ERC-20s swept on trigger." },
      { name: "Transfer ownership", desc: "Hand the vault to an address or multisig." },
      { name: "Rearm", desc: "Return a fired vault to service." },
    ],
  },
  {
    id: "keepers",
    role: "Anyone",
    constraint: "Open to every address. The destination is fixed to your stored recovery wallet.",
    summary: "Can fire the switch. Cannot choose where funds go.",
    tone: "danger",
    items: [
      { name: "Execute fail-safe", desc: "Once the deadline passes without a heartbeat." },
      { name: "Sweep late BOT", desc: "Native funds that arrive after a trigger." },
      { name: "Sweep ERC-20", desc: "Any token left behind, tracked or not." },
    ],
  },
];

export const READS = [
  { name: "Vault telemetry", desc: "Balance, timeout, deadline, grace remaining, trigger status." },
  { name: "Batch queries", desc: "Live state for many vaults in one round-trip." },
  { name: "Keeper scan", desc: "Every vault that can be executed right now." },
  { name: "Factory check", desc: "Confirm a vault is genuine, not a look-alike." },
  {
    name: "Address prediction",
    desc: "Compute a vault's address before it exists, to pre-fund it.",
  },
] as const;

export const SAFETY = [
  {
    tag: "Reentrancy guard",
    body: "Triggered status locks before any funds move, so a hostile recipient cannot drain twice.",
  },
  {
    tag: "Atomic execution",
    body: "If the transfer fails the whole transaction reverts. The switch stays armed, never half-fired.",
  },
  {
    tag: "Fault isolation",
    body: "Tokens are swept one at a time. A broken token is skipped, never blocking the rescue.",
  },
  {
    tag: "Token compatibility",
    body: "Non-standard ERC-20 return values are decoded safely instead of reverting the evacuation.",
  },
  {
    tag: "Least privilege",
    body: "The agent key can only ping. It cannot move funds, and cannot be the rescue destination.",
  },
  {
    tag: "Deployment safety",
    body: "A vault is created and configured in one transaction, leaving no window to hijack it.",
  },
  {
    tag: "Proxy security",
    body: "The shared implementation seals itself on deployment and can never hold funds.",
  },
  {
    tag: "Timing guard",
    body: "A 30-second floor and 365-day ceiling keep clock drift from racing a heartbeat.",
  },
] as const;

/**
 * Measured gas, split into two groups.
 *
 * The figures span 25,700 to 2,994,000 — a 116x range. Scaling one set of bars
 * across all of it would compress every operation into an invisible sliver and
 * the table would lose the comparison the bars exist to provide. Deployment and
 * per-operation costs are also decisions a reader makes at different times, so
 * they are grouped and each group is scaled to its own maximum: like compared
 * with like.
 *
 * Reproduce with scripts/measure-gas.js.
 */
export const GAS_GROUPS: readonly {
  heading: string;
  note: string;
  rows: readonly { op: string; gas: number; note: string }[];
}[] = [
  {
    heading: "Deployment",
    note: "Paid once. The factory is only cheaper from the third vault onward.",
    rows: [
      { op: "Factory deployment", gas: 2994000, note: "Once, for a platform others can use" },
      { op: "Standalone vault", gas: 1688000, note: "Once, for a single agent of your own" },
    ],
  },
  {
    heading: "Per operation",
    note: "Paid by whoever calls the function.",
    rows: [
      { op: "Create vault", gas: 343000, note: "Each user, via the factory" },
      { op: "Create vault & deposit", gas: 338000, note: "Atomic creation plus initial deposit" },
      { op: "Execute fail-safe", gas: 74400, note: "Any keeper, during evacuation" },
      { op: "Liveness heartbeat", gas: 37600, note: "The agent, every ping" },
      { op: "Deposit funds", gas: 25700, note: "Each deposit" },
    ],
  },
];

/** The one heartbeat figure the landing page quotes, so it cannot drift. */
export const PING_GAS = 37600;

export const ROLE_TONES = {
  signal: { text: "text-signal", dot: "bg-signal", border: "border-signal-dim" },
  neutral: { text: "text-text", dot: "bg-text", border: "border-line-strong" },
  danger: { text: "text-danger", dot: "bg-danger", border: "border-danger-dim" },
} as const;
