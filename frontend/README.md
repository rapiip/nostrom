# Nostrom frontend

Landing page and vault console for the Nostrom dead-man's switch protocol.

The contracts in `../contracts/` are the source of truth. This app exposes what they
actually do — no invented features, no hardcoded addresses, no contract logic
reimplemented in TypeScript.

```
Landing page  ->  Protocol explanation  ->  Connect wallet  ->  Vault console
```

---

## Quick start

```bash
npm install            # or, from the repo root: npm run app:install
cp .env.example .env   # then set a factory address (see below)
npm run dev            # http://localhost:5173
```

From the repository root the same steps are `npm run app:install` / `npm run app:dev`.

### You need a factory address

Nothing is hardcoded. The repository ships no deployed addresses (`deployments/*.json`
is gitignored), so vault discovery and creation stay disabled until you provide one:

```bash
# from the repo root
npm run deploy:factory:testnet      # prints the address, and writes deployments/
```

Then in `frontend/.env`:

```ini
VITE_FACTORY_ADDRESS_968=0x…        # BOT Chain testnet
```

Without it the console says so plainly rather than failing oddly. **Monitoring,
heartbeats and execution still work from a bare vault address** — use *Look up*. The
registry is only needed for discovery.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Build | Vite 8 | No SSR needed — the app is entirely client-side and wallet-driven |
| UI | React 19 + TypeScript (strict) | — |
| Styling | Tailwind 4 (CSS-first `@theme`) | Tokens live in `src/styles/index.css`, one place |
| Chain | wagmi 3 + viem | Account/chain-change handling and reorg-safe receipts |
| Data | TanStack Query (via wagmi) | Read caching and polling |
| Routing | React Router 7 | Route-level code splitting |
| Icons | Phosphor | Tree-shaken; no emoji used as iconography |

Only the `injected` connector is configured. That is deliberate: BOT Chain is a custom
EVM chain that injected wallets can be asked to add via `wallet_addEthereumChain`, while
WalletConnect would need a project ID and a relay round-trip for a chain most mobile
wallets do not know. Adding it later is one line in `src/config/wagmi.ts` plus its peer
dependency.

---

## Layout

```
src/
  config/       chains, contract addresses, protocol constants, wagmi setup
  contracts/    abis.ts — GENERATED, do not edit
  lib/          format · vaultState · errors · validation   (no React)
  hooks/        useWallet · useVault · useVaultActions · useTransaction · useClock
  components/
    ui/         Button · Panel · Field · Dialog · Address · StatusBadge · GraceTrack
    web3/       ConnectButton · WalletGate · TransactionDialog
    landing/    Nav · Hero · ProtocolDiagram · Problem · HowItWorks · …
    app/        HeartbeatPanel · OwnerPanel · ExecutionPanel · TokenWatchlist
  routes/       Landing · AppShell · Vaults · CreateVault · VaultDetail · Lookup · Keeper
```

`lib/` is pure domain logic with no React import, so the protocol state machine and the
revert decoder are testable and reusable independently of the UI.

### ABIs are generated, never hand-written

```bash
npm run sync:abis     # reads ../artifacts, writes src/contracts/abis.ts
```

`src/contracts/abis.ts` is committed (artifacts are gitignored) but **must not be edited
by hand**. Re-run the script after any change to `contracts/`. Hand-transcribed
signatures are exactly how a frontend silently drifts from its contracts.

---

## Design system

See [`../design-system/nostrom/pages/frontend.md`](../design-system/nostrom/pages/frontend.md)
for the full specification and the rationale for overriding `MASTER.md`.

In short: the protocol is a countdown that a proof-of-life signal keeps resetting, so the
interface is a monitoring instrument. Near-black base, hairline rules, monospace for every
on-chain value, and **colour reserved entirely for status** — green alive, amber expiring,
red lapsed. No gradients, no glow, no floating coins.

---

## Two rules this codebase holds to

### 1. Never claim success before the chain confirms it

`useTransaction` derives its phase from the receipt query rather than mirroring it into
component state:

```
idle -> signing -> pending -> success | reverted | error
```

`success` requires a mined receipt with `status === "success"`. A transaction hash means
a node accepted it, not that it worked — and a mined transaction can still revert. Both
outcomes are surfaced distinctly, with block number, gas used, hash and an explorer link.

Verified against a real mempool with 4-second blocks, not with auto-mining.

### 2. Never offer an action that is certain to revert

`lib/vaultState.ts` derives capabilities directly from the contract's modifiers:

| Contract | Capability |
|---|---|
| `onlyOwner` | `isOwner` |
| `onlyAgent` | `isAgent` |
| `whenNotTriggered` | `!isTriggered` |
| `whenTriggered` | `isTriggered` |

Input validation in `lib/validation.ts` mirrors each contract check with a citation, so a
user never pays gas to learn that `recoveryAddress` cannot equal `agentAddress`. When an
action genuinely cannot be taken, the button is disabled *and* the reason is named —
including the custom error it would revert with.

All 18 custom errors in `NostromFactory.sol` are decoded into plain language by
`lib/errors.ts`.

---

## Verification

Both harnesses drive real Chrome against the production build.

```bash
npm run build                        # tsc --noEmit && vite build
npm run lint
npx vite preview --port 4173

node scripts/verify-ui.cjs           # 13 routes x 3 viewports
node scripts/verify-flows.cjs        # 6 wallet/transaction flows, live chain
```

`verify-ui.cjs` checks horizontal overflow, tap-target size (WCAG 2.2 AA 2.5.8, with the
inline-link exemption), minimum text size, and **computed** WCAG contrast for every text
node — resolving alpha backgrounds up the ancestor chain. It caught three real contrast
failures that eyeballing did not.

`verify-flows.cjs` injects an EIP-1193 provider backed by a local Hardhat node. Hardhat's
dev accounts are unlocked, so `eth_sendTransaction` is forwarded verbatim and real
transactions mine — it exercises the genuine signing → pending → receipt path.

### Local end-to-end setup

```bash
# terminal 1 — from the repo root
npx hardhat node

# terminal 2 — from the repo root
npx hardhat run scripts/deploy-factory.js --network localhost
npx hardhat run frontend/scripts/seed-local.cjs --network localhost   # 5 vaults, every state
```

Then in `frontend/.env`:

```ini
VITE_FACTORY_ADDRESS_31337=0x5FbDB2315678afecb367f032d93F642f64180aa3
VITE_ENABLE_LOCALHOST=true
VITE_DEFAULT_CHAIN_ID=31337
```

`seed-local.cjs` creates a vault in each protocol state — alive, expiring, executable,
triggered, empty — plus a tracked ERC-20, so every UI branch can be exercised against
real chain data. `inspect-local.cjs` dumps live state if a flow behaves unexpectedly.

---

## Environment

Every `VITE_*` variable is inlined into the client bundle and is therefore **public**.
Never put a private key here.

| Variable | Default | Purpose |
|---|---|---|
| `VITE_FACTORY_ADDRESS_968` | — | Factory on BOT Chain testnet |
| `VITE_FACTORY_ADDRESS_677` | — | Factory on BOT Chain mainnet |
| `VITE_FACTORY_ADDRESS_31337` | — | Factory on a local Hardhat node |
| `VITE_DEFAULT_CHAIN_ID` | `968` | Chain an unconnected visitor reads from |
| `VITE_ENABLE_LOCALHOST` | `false` | Offer chain 31337 as a selectable network |
| `VITE_RPC_968` / `VITE_RPC_677` | from `hardhat.config.js` | RPC overrides |
| `VITE_GITHUB_URL` | — | Repository link in nav and footer |

`VITE_DEFAULT_CHAIN_ID` also determines which chain is first in `supportedChains`, because
wagmi initialises its current chain to `chains[0]`. If the two disagreed, a visitor with no
wallet would silently read a different network than the app claims to default to.

---

## Notes for deployment

- **SPA fallback is required.** Routes like `/app/vault/0x…` are client-side; serve
  `index.html` for unmatched paths or deep links will 404.
- The app is fully static. `dist/` can go on any static host or CDN.
- There is no backend, no API, no analytics and no telemetry. The only network traffic is
  JSON-RPC to the configured BOT Chain endpoint and Google Fonts.
