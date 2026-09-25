# Nostrom

**Dead-Man's Switch / Fail-Safe Vault for autonomous AI agent treasuries on BOT Chain.**

An AI agent holds operating funds. If its process crashes, its key is lost, or it is
compromised and goes silent, those funds become unreachable. Nostrom makes silence
itself the trigger for recovery: the agent proves it is alive on a schedule, and if
the heartbeat stops, **anyone** can evacuate the treasury to a pre-set cold wallet.

```
   Agent healthy                          Agent dark
   ─────────────                          ──────────
   ping() every N sec                     no ping for > timeoutPeriod
        │                                        │
        ▼                                        ▼
   countdown resets                       executeDeadManSwitch()
   funds stay in vault                    ← callable by ANYONE
   owner can withdraw                            │
                                                 ▼
                                      all BOT + tracked ERC-20s
                                      → recoveryAddress (cold wallet)
```

---

## Which contract do I deploy?

Two options, depending on whether you are building a platform or a single vault.

### `NostromFactory.sol` — multi-tenant (use this for a platform)

Deploy the factory **once**. After that any user can create their own vault:

```
  YOU (once)              NostromFactory
                                │
  USER A ── createVault() ──> Vault A   (owner A, agent A, cold wallet A)
  USER B ── createVault() ──> Vault B   (owner B, agent B, cold wallet B)
  USER C ── createVault() ──> Vault C   (owner C, agent C, cold wallet C)
```

Each vault is a **separate contract at its own address** holding its own balance,
so no user's funds are ever commingled. Vaults are EIP-1167 minimal-proxy clones,
which makes creating one 80% cheaper than deploying a vault outright. The factory
also acts as a registry so a frontend can discover and display vaults.

The factory has **no owner, no admin functions, no fees and no upgrade path** —
once deployed it is immutable, so there is nothing for its deployer to abuse.
That is what makes it safe for strangers to build on.

This file contains everything (the `Clones` library, `NostromVault`, and
`NostromFactory`) with no external imports, so it pastes straight into Remix.

→ Step-by-step Remix walkthrough: **[`DEPLOY_REMIX.md`](DEPLOY_REMIX.md)**

### `Nostrom.sol` — standalone single vault

The original single-tenant version: one deployment equals one vault, configured
via constructor arguments. Fine if you only need a vault for **your own** agent
and do not intend to serve other users. Superseded by the factory for anything
multi-user.

The two vault implementations share the same design and the same public API
(`ping`, `executeDeadManSwitch`, `status`, …). The only structural difference is
that the factory's vault is configured through `initialize()` instead of a
constructor, because EIP-1167 proxies cannot run constructors.

---

## Network configuration

Per the [BOT Chain quick guide](https://dev-docs.botchain.ai/docs/Developers/quick-guide/).
BOT Chain is EVM-compatible with a Geth-compatible JSON-RPC surface, so the standard
Hardhat + ethers.js toolchain applies with no chain-specific SDK.

| | Testnet | Mainnet |
|---|---|---|
| Chain ID | `968` | `677` |
| RPC | `https://rpc.bohr.life` | `https://rpc.botchain.ai` |
| Native token | BOT | BOT |
| Explorer | https://scan.bohr.life | https://scan.botchain.ai |

Testnet BOT comes from the faucet linked in the dev docs. Mainnet BOT is available
via the official DEX.

---

## Quick start

```bash
npm install
npm run build               # compile
npm test                    # 70 tests
npm run gas                 # gas report
npm run demo                # standalone lifecycle walkthrough, ~5 seconds
```

`npm run demo` deploys a vault with a 60-second timeout, funds it, sends healthy
heartbeats, lets the agent die, and has an unrelated third party rescue the funds.
It is the fastest way to see the protocol work.

### Web interface

A landing page and vault console live in [`frontend/`](frontend/README.md):

```bash
npm run app:install
npm run app:dev             # http://localhost:5173
```

It reuses this repository's compiled ABIs (`npm run app:abis` regenerates them from
`artifacts/`) and takes contract addresses from environment variables — nothing is
hardcoded. Point it at a factory with `VITE_FACTORY_ADDRESS_968` in `frontend/.env`
after deploying one. Without a factory it degrades to direct-address vault lookup,
which is enough for monitoring, heartbeats and execution.

### Deploy the factory (multi-tenant)

```ini
PRIVATE_KEY=...             # deployer; the factory has no owner afterwards
```

```bash
npm run deploy:factory:testnet      # chainId 968
npm run deploy:factory:mainnet      # chainId 677
```

No constructor arguments. Deploy once, then users call `createVault` themselves.
For the Remix/MetaMask route see [`DEPLOY_REMIX.md`](DEPLOY_REMIX.md).

### Deploy a standalone vault

Set these in `.env`:

```ini
PRIVATE_KEY=...             # deployer, becomes the vault owner
AGENT_ADDRESS=0x...         # wallet the AI agent signs heartbeats with
RECOVERY_ADDRESS=0x...      # cold wallet that receives funds on failure
TIMEOUT_PERIOD=86400        # seconds of silence tolerated (24h)
```

```bash
npm run deploy:testnet
npm run deploy:mainnet
```

The script validates every argument before spending gas, asserts the deployed state
matches what you asked for, and writes a record to `deployments/`.

Then start the heartbeat — this works against a standalone vault *or* a
factory-created vault, just point it at the right address:

```ini
NOSTROM_ADDRESS=0x...       # vault address
AGENT_PRIVATE_KEY=...       # must match the vault's agentAddress
PING_INTERVAL_SECONDS=3600
```

```bash
npm run heartbeat
```

---

## Factory API (multi-tenant)

### Creating vaults

| Function | Purpose |
|---|---|
| `createVault(agent, recovery, timeout)` | Caller gets a vault they own. |
| `createVaultAndFund(agent, recovery, timeout)` payable | Create + fund in one signature. |
| `createVaultDeterministic(agent, recovery, timeout, salt)` payable | CREATE2, so the address is known in advance. Salt is namespaced per caller, so nobody can squat another user's address. |
| `predictVaultAddress(creator, salt)` | Compute the address before creating — lets a UI show it, or a user pre-fund it. |

### Registry and reads

| Function | Purpose |
|---|---|
| `isVault(address)` | **Gate your frontend on this** so users cannot be tricked into interacting with a look-alike contract. |
| `implementation()` | The shared vault logic. Holds no funds, permanently locked. |
| `totalVaults()` / `getVaults(offset, limit)` | Global enumeration, paginated. |
| `vaultsOf(creator)` / `vaultCountOf` / `getVaultsOf(creator, offset, limit)` | Per-creator index. |
| `getVaultRecord(vault)` | Creation metadata: creator, timestamp, index. |
| `getVaultSnapshot(vault)` | Live state of one vault. |
| **`getVaultsSnapshot(address[])`** | Live state of many vaults in **one RPC call** — turns an N-call dashboard render into one. |
| **`getExecutableVaults(offset, limit)`** | Vaults whose switch can be fired right now. The primary query for a keeper bot. |

Event: `VaultCreated(vault, creator, agentAddress, recoveryAddress, timeoutPeriod, vaultIndex, initialDeposit)`.

### Registry semantics — read this before building a frontend

`vaultsOf(creator)` is indexed by **who called `createVault`**, and that link never
changes. It is *not* the same as "current owner": a vault owner can hand the vault
over with `transferOwnership`, and agent/recovery addresses can be rotated.

The factory deliberately does not mirror that mutable state. Doing so would cost
every user gas forever and couple the vault to the factory at runtime. For live
state, read from the vault — `getVaultsSnapshot` batches it — or index the vault's
`OwnershipTransferred` / `AgentAddressUpdated` / `RecoveryAddressUpdated` events
with something like The Graph.

---

## Vault API

### State

| Variable | Type | Meaning |
|---|---|---|
| `owner` | `address` | Vault owner / agent developer. Full control while healthy. |
| `agentAddress` | `address` | The agent's heartbeat key. Can *only* call `ping()`. |
| `recoveryAddress` | `address` | Cold wallet that receives everything on failure. |
| `timeoutPeriod` | `uint256` | Seconds of silence tolerated. |
| `lastPingTime` | `uint256` | Timestamp of the most recent heartbeat. |
| `isTriggered` | `bool` | True once the fail-safe has fired. |
| `pingCount` | `uint256` | Lifetime heartbeat count. |

### Functions

| Function | Access | Purpose |
|---|---|---|
| `ping()` | agent | Proof of life. Resets the countdown. |
| `receive()` / `deposit()` | anyone | Fund the vault with native BOT. |
| `withdrawByOwner(amount)` | owner | Normal withdrawal. |
| `withdrawAllByOwner()` | owner | Drain to owner. |
| `withdrawTokenByOwner(token, to, amount)` | owner | Normal ERC-20 withdrawal. |
| **`executeDeadManSwitch()`** | **anyone** | **Fire the switch and evacuate the treasury.** |
| `sweepNativeToRecovery()` | anyone (post-trigger) | Push late-arriving BOT to recovery. |
| `sweepTokenToRecovery(token)` | anyone (post-trigger) | Push any ERC-20 to recovery. |
| `updateTimeoutPeriod(t)` | owner | Reconfigure the timeout. |
| `updateRecoveryAddress(a)` | owner | Change the cold wallet. |
| `updateAgentAddress(a)` | owner | Rotate the agent key (also resets the clock). |
| `addTrackedToken(t)` / `removeTrackedToken(t)` | owner | Manage the ERC-20 sweep watchlist. |
| `transferOwnership(a)` | owner | Hand over the vault. |
| `rearm()` | owner (post-trigger) | Return a fired vault to service. |

### Views for keepers and dashboards

`status()` returns everything in one call. Individually: `vaultBalance()`,
`executionDeadline()`, `timeUntilTrigger()`, `timeSinceLastPing()`, `isExecutable()`,
`trackedTokens()`, `trackedTokenCount()`, `isTokenTracked(token)`.

### Events

`Heartbeat`, `VaultFunded`, `OwnerWithdrawal`, `TokenWithdrawal`,
**`DeadManSwitchTriggered(recoveryAddress, amountRescued, timestamp)`**,
`TokenRescued`, `TokenRescueFailed`, `NativeSwept`, `TimeoutPeriodUpdated`,
`RecoveryAddressUpdated`, `AgentAddressUpdated`, `OwnershipTransferred`,
`TrackedTokenAdded`, `TrackedTokenRemoved`, `SwitchRearmed`.

---

## Design decisions worth knowing

**Execution is permissionless by design.** `executeDeadManSwitch()` has no access
control. If recovery required the owner to act, the vault would fail in exactly the
scenario it exists for — nobody watching. The caller cannot choose the destination
(it is always the stored `recoveryAddress`), so there is nothing to extract by
calling it. Any keeper, watchtower, or bystander can fire it.

**Reentrancy.** `isTriggered` is set *before* any value moves (checks-effects-
interactions), so a hostile `recoveryAddress` cannot re-enter and drain twice.
Tested in `test/Nostrom.test.js` with an attacker contract.

**Atomic failure.** If the native transfer fails (e.g. the recovery address is a
contract that reverts on receive), the whole transaction reverts and `isTriggered`
stays `false`. The switch remains armed and retryable rather than half-executed
with funds stranded.

**ERC-20 sweeps cannot brick the rescue.** The EVM gives no way to enumerate a
contract's token holdings, so ERC-20s must be registered via `addTrackedToken`.
Each token is swept in isolation: a reverting `balanceOf`, a failing `transfer`, a
token returning `false`, or a non-ERC-20 address is logged as `TokenRescueFailed`
and skipped. The native rescue always proceeds.

One subtlety worth calling out: the transfer return value is decoded as `uint256`,
not `bool`. `abi.decode(data, (bool))` **reverts** when the word is anything other
than 0 or 1, and a token returning e.g. `bytes1` produces `0x0100…00`. Decoding as
`bool` would have let one weird token take down the entire fail-safe. There is a
test for exactly this.

**Timing.** `block.timestamp` is used for the countdown. Validator drift is a few
seconds, irrelevant against timeouts measured in hours. `MIN_TIMEOUT_PERIOD` (30s)
keeps that assumption true; `MAX_TIMEOUT_PERIOD` (365 days) prevents configuring a
switch that can never fire.

**Clones cannot be hijacked or griefed.** Three specific guards:
- The implementation locks itself in its constructor, so it can never be
  initialised or hold funds.
- `initialize()` is callable exactly once, and the factory calls it in the *same
  transaction* as the clone — there is no window for anyone to initialise someone
  else's vault first.
- A fresh clone has `timeoutPeriod == 0`, so its deadline is already in the past.
  Without a guard, anyone could call `executeDeadManSwitch()` on an unconfigured
  clone and flip `isTriggered` before its owner set it up. Every permissionless
  entry point therefore requires initialisation. There is a test for exactly this.

**Clones and the 2300-gas stipend.** A vault created by the factory is an EIP-1167
proxy, so a plain transfer is forwarded by `delegatecall` — which costs well over
the 2300 gas that Solidity's `transfer()`/`send()` forward. Sending from a wallet
is fine (normal gas limit), but *another contract* must use `deposit()` or `call`
with an adequate budget. This is inherent to the clone pattern, shared by Gnosis
Safe proxies, and there is a test documenting the behaviour.

**`ping()` is storage-packed.** It is the most frequent call in the protocol —
every agent, forever. `lastPingTime` and `pingCount` share one storage slot as
`uint128`s so a heartbeat costs one SSTORE instead of two. The public getters
still return `uint256`, so the ABI is unchanged. Measured cost: ~37,600 gas.

**Agent key is deliberately powerless.** The agent can call `ping()` and nothing
else. It cannot move funds. Compromising the agent key does not compromise the
treasury — the worst an attacker can do is keep the vault healthy. The initialiser
also refuses a `recoveryAddress` equal to `agentAddress`, so the hot key can never
be the rescue destination.

**Trust boundary.** Each vault's owner is trusted for that vault: they can withdraw
at will and change the recovery address while it is healthy. Nostrom protects
against agent failure, not against a malicious owner. Point `owner` at a multisig
if that matters. The *factory* trusts nobody and has no privileges over any vault.

**The agent needs gas.** If the agent wallet runs out of BOT it cannot ping, and
the switch will fire on a perfectly healthy agent. The heartbeat clients check this
at startup, but monitor it in production too.

---

## Embedding the heartbeat in an AI agent

### Node.js / ethers.js

```js
const { NostromHeartbeat } = require("./agent/nostrom-heartbeat");

const heartbeat = new NostromHeartbeat({
  rpcUrl: "https://rpc.bohr.life",
  vaultAddress: process.env.NOSTROM_ADDRESS,
  privateKey: process.env.AGENT_PRIVATE_KEY,
  intervalSeconds: 3600,

  // Only report liveness if the agent is genuinely well. This is what makes it
  // a real dead-man's switch rather than a cron job — a wedged agent that keeps
  // pinging defeats the entire purpose.
  healthCheck: async () => myAgent.isHealthy(),
});

await heartbeat.start();   // pings immediately, then on an interval
// ... agent does its work ...
await heartbeat.stop();
```

### Python / web3.py

```bash
pip install -r agent/requirements.txt
```

```python
from nostrom_heartbeat import NostromHeartbeat

heartbeat = NostromHeartbeat(
    rpc_url="https://rpc.bohr.life",
    vault_address=os.environ["NOSTROM_ADDRESS"],
    private_key=os.environ["AGENT_PRIVATE_KEY"],
    interval_seconds=3600,
    health_check=lambda: my_agent.is_healthy(),
)

heartbeat.start()          # background thread
...
heartbeat.stop()
```

Or drive it manually from an existing loop:

```python
heartbeat.preflight()
while agent.running:
    agent.do_work()
    heartbeat.ping_once()
```

Both clients provide the same safeguards:

- **`preflight()`** fails loudly if the key does not match the on-chain
  `agentAddress`, if the vault is already triggered, or if the agent cannot pay
  gas. A silent key mismatch would mean every ping reverts and the switch fires on
  a perfectly healthy agent — so this is checked up front, not discovered later.
- **Interval auto-tuning** clamps the ping cadence to `timeoutPeriod / 3`, so two
  missed transactions in a row are survivable.
- **Retries with backoff**, and immediate abort on unrecoverable reverts
  (`NotAgent`, `SwitchAlreadyTriggered`) instead of retrying pointlessly.
- **`healthCheck`** withholds the ping when the agent is unwell, letting the
  fail-safe arm.

CLI usage for both: `--once` (single ping), `--status` (read-only).

---

## Running a keeper

Anyone can watch a vault and fire the switch. No permission needed.

```bash
node scripts/keeper.js                 # poll forever
node scripts/keeper.js --once          # single check
node scripts/keeper.js --dry-run       # report only, never send a tx
```

Inspect a vault without sending anything:

```bash
npm run status:testnet
```

---

## Project layout

```
contracts/
  NostromFactory.sol           multi-tenant: Clones + NostromVault + NostromFactory
  Nostrom.sol                  standalone single-tenant vault
  test/
    MockERC20.sol              test doubles, incl. hostile tokens
    FactoryTestHelpers.sol     raw clone spawner, 2300-gas stipend sender
scripts/
  deploy.js                    deploy the standalone vault to BOT Chain
  demo.js                      one-command lifecycle walkthrough
  measure-gas.js               gas report for planning
  keeper.js                    permissionless watchtower
  status.js                    read-only inspector
agent/
  nostrom-heartbeat.js         Node.js/ethers heartbeat client
  nostrom_heartbeat.py         Python/web3.py heartbeat client
  requirements.txt
test/
  Nostrom.test.js              38 tests (standalone vault)
  NostromFactory.test.js       32 tests (factory, clones, isolation)
frontend/                      landing page + vault console (see frontend/README.md)
  src/config/                  chains, addresses, protocol constants, wagmi
  src/contracts/abis.ts        GENERATED from artifacts/ — never hand-edited
  src/lib/                     protocol state machine, revert decoding, validation
  src/hooks/                   wallet, vault reads, vault writes, tx lifecycle
  src/components/              ui / web3 / landing / app
  src/routes/                  Landing, Vaults, CreateVault, VaultDetail, Lookup, Keeper
  scripts/sync-abis.mjs        regenerates abis.ts from artifacts/
design-system/nostrom/
  MASTER.md                    generated baseline (left untouched)
  pages/frontend.md            protocol-derived system that overrides it
DEPLOY_REMIX.md                Remix + MetaMask walkthrough (Indonesian)
```

The heartbeat clients work unchanged against a factory-created vault: point
`NOSTROM_ADDRESS` at the clone address. The vault's `ping()` / `status()` ABI is
identical in both implementations.

The frontend never duplicates contract logic. It reads the compiled ABIs, mirrors each
`require`/`revert` for client-side validation with a citation back to the contract, and
derives what a user may do from the contract's own modifiers — so it never offers an
action that is certain to revert.

---

## Gas costs (measured)

Run `npx hardhat run scripts/measure-gas.js` to reproduce.

| Operation | Gas | Paid by |
|---|---|---|
| Deploy `NostromFactory` | ~2,994,000 | you, once |
| `createVault` | ~343,000 | each user |
| `createVaultAndFund` | ~338,000 | each user |
| `createVaultDeterministic` | ~330,000 | each user |
| `ping()` | ~37,600 | the agent, every heartbeat |
| `deposit()` | ~25,700 | each user |
| `executeDeadManSwitch()` (native only) | ~74,400 | any keeper |
| *(comparison)* standalone `Nostrom.sol` deploy | ~1,688,000 | — |

Creating a vault through the factory costs **80% less** than deploying a vault
outright.

### Choosing the cheaper deployment

There are **no protocol fees anywhere in Nostrom** — no creation fee, no cut of a
rescue, nothing for the deployer to collect. Every cost below is network gas paid
to BOT Chain validators.

Which contract you deploy is by far the largest lever on that cost:

| You need | Deploy | Gas |
|---|---|---|
| One vault, for your own agent | `Nostrom.sol` | ~1,688,000 |
| A platform others can use | `NostromFactory.sol` | ~2,994,000, then ~343,000 per vault |

If you only ever want a vault for yourself, the standalone contract is **44%
cheaper** than deploying the factory. The factory becomes the cheaper option from
the **third vault onward** — each vault after the factory exists costs ~343,000
instead of ~1,688,000:

| Vaults | Via factory | Standalone each | Cheaper |
|---|---|---|---|
| 1 | 3,337,626 | 1,687,525 | standalone |
| 2 | 3,680,977 | 3,375,050 | standalone |
| 3 | 4,024,328 | 5,062,575 | **factory** |

Gas is also priced by the network, not by this code — the same deployment costs
less when the chain is quiet. Check the current gas price before deploying rather
than paying whatever a wallet defaults to.

---

## Verification status

- Compiles with solc 0.8.24, optimizer on (200 runs), `evmVersion: cancun`,
  `metadata.bytecodeHash: "none"`.
- **70/70 tests pass.**
  - `Nostrom.test.js` (38): heartbeat, permissionless execution, exact deadline
    boundary, reentrancy, atomic failure, hostile ERC-20s, access control, admin
    reconfiguration.
  - `NostromFactory.test.js` (32): clone mechanics, locked implementation,
    double-initialisation, uninitialised-clone griefing, CREATE2 prediction and
    salt namespacing, registry pagination, batch snapshots, keeper scanning, and
    **multi-tenant isolation** — that one user cannot withdraw from, or trigger,
    another user's vault, and that triggering one vault leaves every other vault
    untouched.
- `deploy.js`, `status.js`, `keeper.js`, `demo.js`, `measure-gas.js` and both
  heartbeat clients were each executed end-to-end against a local test node.

**Not audited.** This was built for a hackathon. Review it before trusting real
value to it.

### A note on `evmVersion`

The config targets `cancun`. BOT Chain has both Shanghai and Cancun active on
mainnet and testnet — confirmed by reading `withdrawalsRoot` and `blobGasUsed`
from the latest block on `rpc.botchain.ai` (677) and `rpc.bohr.life` (968) — so
the `PUSH0` opcode is available. Using it produces smaller bytecode, which makes
deployment ~77,000 gas cheaper for the factory and ~36,000 cheaper for a
standalone vault, with no behavioural change.

Set `GAS_EVM=paris` if you ever need to deploy the same source to a chain that
has not activated Shanghai; that bytecode must not contain `PUSH0`.

The build also sets `metadata.bytecodeHash: "none"`, dropping the CBOR metadata
trailer Solidity normally appends. The EVM never reads it, and every byte of
deployed code costs 200 gas, so removing it saves ~18,000 gas. Source
verification still works — the explorer recompiles and compares — it just forgoes
a metadata-hash "full match". Set `GAS_METADATA=keep` if your verifier needs it.

### Why `optimizer.runs` is 200 and not lower

Lowering `runs` shrinks the bytecode and makes deployment cheaper, which looks
like a free win. It is not: it also makes `ping()` more expensive, and `ping()`
is the one call that recurs for the entire life of every vault.

Measured with `node scripts/tune-gas.js`:

| `runs` | factory deploy | `ping()` |
|---|---|---|
| 1 | 2,949,574 | 37,749 |
| 200 | 2,994,275 | 37,583 |

`runs: 1` saves ~45,000 gas once, then costs an extra ~166 gas on every
heartbeat. That is a net loss after roughly 270 pings — about 11 days of hourly
heartbeats. Optimising a one-time cost at the expense of a perpetual one is a
false economy, so the recurring call wins.

### Contract verification

The explorer verification endpoints are not documented in the quick guide, so the
`customChains` entries in `hardhat.config.js` are best-effort defaults. If
`npx hardhat verify` fails, verify through the explorer UI using flattened source:

```bash
npx hardhat flatten contracts/Nostrom.sol > Nostrom.flat.sol
```

---

## License

MIT
