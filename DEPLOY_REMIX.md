# Deploy Nostrom via Remix + MetaMask

A guide to deploying **`contracts/NostromFactory.sol`** to BOT Chain Testnet using
Remix. Every step is manual and under your control — nothing is published
automatically.

---

## Understand first: you deploy the Factory, not a Vault

This is the key to the multi-tenant architecture. There are two levels:

```
  YOU (once, as the platform provider)
       │
       └── deploy NostromFactory  ──────────────┐
                                               │
  EACH USER (through your frontend later)       │
       │                                       │
       ├── user A: factory.createVault(...) ──> Vault A  (owner: user A)
       ├── user B: factory.createVault(...) ──> Vault B  (owner: user B)
       └── user C: factory.createVault(...) ──> Vault C  (owner: user C)
```

Each user gets **their own vault contract at their own address**, with their own
agent and cold wallet. Every user's funds are genuinely isolated in a separate
contract — not merely accounted for separately, but physically separate. The
factory only keeps a registry so a frontend can discover and display vaults.

**You deploy only the Factory, once.** After that you never deploy anything
again — users create their own vaults.

The factory has **no owner, no admin, no fees and no upgrade path**. There is
nothing you (or anyone) can abuse to reach a user's funds. That is what makes it
safe for others to build on your platform.

---

## Cost: no protocol fees, only network gas

Nostrom **charges nothing** — no vault-creation fee, no cut of a rescue, nothing
the deployer can withdraw. Every figure below is gas paid to BOT Chain
validators, not to the contract.

Which contract you deploy is the largest lever on cost:

| You need | Deploy | Gas |
|---|---|---|
| **One vault for your own agent** | `Nostrom.sol` | ~1,688,000 |
| A platform for others to use | `NostromFactory.sol` | ~2,994,000, then ~343,000 per vault |

If you only need a vault for yourself, **`Nostrom.sol` is 44% cheaper** than
deploying the factory. The factory becomes the cheaper option from the **third
vault onward**:

| Vaults | Via factory | Standalone | Cheaper |
|---|---|---|---|
| 1 | 3,337,626 | 1,687,525 | standalone |
| 2 | 3,680,977 | 3,375,050 | standalone |
| 3 | 4,024,328 | 5,062,575 | **factory** |

Two more things lower the real cost:

- **Gas price is set by the network, not by this code.** The same deployment is
  cheaper when the chain is quiet. In MetaMask, check or adjust the gas price
  before confirming rather than accepting the default.
- **Try it on testnet first.** Chain 968 uses BOT from the faucet (free) and
  behaves identically to mainnet. Every step in this guide is the same.

If you do need the factory, the rest of this guide already uses the cheapest
compiler settings that are safe for BOT Chain (see Phase 4).

---

## Phase 1 — Wallet

Install MetaMask from metamask.io, create a new wallet, and **write the 12-word
Secret Recovery Phrase down on paper**. Do not store it digitally, and never
share it with anyone.

---

## Phase 2 — Add BOT Chain Testnet

MetaMask → network dropdown (top left) → **Add a network** →
**Add a network manually**:

| Field | Value |
|---|---|
| Network Name | BOT Chain Testnet |
| New RPC URL | `https://rpc.bohr.life` |
| Chain ID | `968` |
| Currency Symbol | BOT |
| Block Explorer URL | `https://scan.bohr.life/` |

**Save** → confirm the active network switches to BOT Chain Testnet.

---

## Phase 3 — Get testnet BOT from the faucet

1. Copy your wallet address from MetaMask.
2. Open the official testnet faucet (the link is in the BOT Chain dev docs).
3. Paste your address → request test BOT → wait 1–2 minutes → check your balance.

Deploying the factory needs roughly **3,000,000 gas**, so make sure your balance
is sufficient. If the faucet gives a small amount, request several times or wait
out the cooldown.

> If you only need a single vault for your own agent, `Nostrom.sol` is just
> ~1,688,000 gas — 44% cheaper. See the **Cost** section above.

---

## Phase 4 — Compile in Remix

1. Open **remix.ethereum.org**.
2. File Explorer → click **"+"** → file name: `NostromFactory.sol`.
3. Open `contracts/NostromFactory.sol` on your machine → copy the **entire
   contents** → paste into Remix.
   - This file already contains everything (the Clones library, NostromVault,
     NostromFactory) with no external imports, so a copy-paste works directly.
4. Click the **Solidity Compiler** icon (`<S>`).
5. Compiler version: **0.8.24** (must match `pragma solidity 0.8.24;`).
6. Open **Advanced Configurations**:
   - **EVM Version**: `cancun`
   - **Enable optimization**: checked, runs `200`

   > Both settings must match `hardhat.config.js`, otherwise the bytecode
   > differs and explorer verification will fail.
   >
   > `cancun` is used because BOT Chain has activated both Shanghai and Cancun on
   > mainnet and testnet, so the `PUSH0` opcode is available. The bytecode is
   > smaller and deployment is ~77,000 gas cheaper with no behavioural change.
   > Use `paris` only if you deploy to another chain that is not yet on Shanghai.
7. Click **Compile NostromFactory.sol** → wait for the green check.

> If you see a warning (not an error) about contract size, that is normal — the
> factory bundles the vault bytecode inside it.

---

## Phase 5 — Deploy the Factory

1. Click the **Deploy & Run Transactions** icon.
2. **Environment** → **Injected Provider - MetaMask** → Connect.
3. Confirm MetaMask is still on **BOT Chain Testnet (968)**.
4. **CONTRACT** → select **`NostromFactory`**.

   The dropdown will list several options (`Clones`, `IERC20`, `NostromVault`,
   `NostromFactory`). **Select `NostromFactory`.** Do not pick the others:
   - `Clones` / `IERC20` — a library and an interface, not usable on their own
   - `NostromVault` — the vault logic; the factory deploys this itself inside
     its constructor, so you never deploy it manually

5. **There are no input fields** — the `NostromFactory` constructor takes no
   parameters. This differs from the earlier single-tenant version.
6. Click the orange **Deploy** button → MetaMask popup → **Confirm**.
7. The factory address appears under **Deployed Contracts**. **Save this
   address** — your frontend will use it.

---

## Phase 6 — Verify on the explorer

1. Copy the factory address from Remix.
2. Open **scan.bohr.life** → paste it in the search bar.
3. Confirm your deployment transaction appears.

---

## Phase 7 — Test vault creation through Remix

Before building a frontend, confirm the factory works. In the Deployed Contracts
panel, expand `NOSTROMFACTORY`:

### 1. Confirm the implementation is deployed

Click **`implementation`** (the blue button). It should return an address, not
`0x0000...0000`.

### 2. Create your first vault

For a test, prepare **two separate accounts** in MetaMask (Add account) to serve
as agent and recovery. Then expand **`createVault`** and fill in:

| Field | Value | Example |
|---|---|---|
| `_agentAddress` | the AI agent's wallet address | `0xAgent...` |
| `_recoveryAddress` | cold wallet, **must differ from the agent** | `0xCold...` |
| `_timeoutPeriod` | seconds, min `30` max `31536000` | `60` (for a quick test) |

Click **transact** → Confirm in MetaMask.

### 3. Find your vault address

Click **`vaultsOf`**, enter your wallet address → it returns an array of vault
addresses. Alternatively, check the transaction on the explorer and read the
`VaultCreated` event.

You can also click **`totalVaults`** to confirm the count has increased.

### 4. Read the vault state

Click **`getVaultSnapshot`**, enter the vault address → it returns the full state
at once (owner, agent, recovery, balance, deadline, etc.). This is the function
your frontend will use to render the dashboard.

### 5. Send funds to the vault

Send BOT from MetaMask directly to the vault address (not to the factory). Then
call `getVaultSnapshot` again — `balance` should have increased.

### 6. Test the dead-man's switch

If you set `_timeoutPeriod` to `60`, wait 60+ seconds without calling `ping()`,
then:

- Click **`getExecutableVaults`** with `_offset = 0`, `_limit = 100` → your vault
  should appear in the list.
- To execute it: in Remix, open a new file → select `NostromVault` in the
  CONTRACT dropdown → use **"At Address"** (the box below the Deploy button),
  paste the vault address → click **At Address**. The vault appears as a separate
  contract → click **`executeDeadManSwitch`**.
- The funds should move to the `recoveryAddress`.

> If `executeDeadManSwitch` reverts with `AgentStillAlive`, the timeout has not
> elapsed yet. Check `timeUntilTrigger` to see the seconds remaining.

---

## For the frontend later

The factory functions you will use:

| Function | Purpose |
|---|---|
| `createVault(agent, recovery, timeout)` | a user creates a vault |
| `createVaultAndFund(...)` payable | create + fund in one signature |
| `createVaultDeterministic(..., salt)` | the vault address can be shown before the tx is sent |
| `predictVaultAddress(creator, salt)` | compute the address in advance |
| `vaultsOf(user)` | list a user's vaults |
| `getVaultsSnapshot(address[])` | **read many vaults in a single RPC call** |
| `getExecutableVaults(offset, limit)` | for a keeper bot |
| `isVault(address)` | **use this to stop users interacting with a look-alike contract** |
| `totalVaults()`, `getVaults(offset, limit)` | global enumeration |

The `VaultCreated` event can be indexed (BOT Chain supports The Graph) to build
lists without polling.

**Important note for the frontend:** the `vaultsOf` registry records the vault's
**creator**, and that link never changes. But a vault's owner can be transferred
with `transferOwnership`, and the agent/recovery addresses can be rotated. So to
display current state, read from the vault itself (`getVaultsSnapshot`) rather
than relying on the registry alone.

---

## Gas costs (measured)

| Operation | Gas | Paid by |
|---|---|---|
| Deploy `NostromFactory` | ~2,994,000 | you, once |
| `createVault` | ~343,000 | each user, per vault |
| `createVaultAndFund` | ~338,000 | each user |
| `ping()` | ~37,600 | the AI agent, per heartbeat |
| `deposit()` | ~25,700 | each user |
| `executeDeadManSwitch()` | ~74,400 | any keeper |

For comparison, if each user had to deploy a full vault themselves it would cost
~1,688,000 gas. The clone pattern saves **80%** per user.

The deploy figures above already include two compiler optimisations: targeting
`cancun` (which uses the `PUSH0` opcode, already active on BOT Chain) and
dropping the CBOR metadata trailer — together ~77,000 gas cheaper than the
previous settings. Neither changes contract behaviour at all.

Reproduce it yourself with `npx hardhat run scripts/measure-gas.js`, or compare
compiler settings with `node scripts/tune-gas.js`.

---

## Security notes

- These contracts are **not yet audited**. Test on testnet until you are
  confident.
- **`ping()` needs gas.** The agent wallet must hold BOT; if it runs out, the
  heartbeat fails and the switch fires even on a healthy agent. Monitor this
  balance.
- `agentAddress` deliberately **has no access to funds** — it can only call
  `ping()`. If the agent key leaks, an attacker can only keep the vault "alive".
- A vault owner is fully trusted for their own vault: they can withdraw at any
  time and change the recovery address. Nostrom protects against a **dead
  agent**, not a malicious owner.
- Keep the recovery/cold wallet private key **separate from, and more secure
  than**, the agent and owner keys.
- A vault is an EIP-1167 proxy. Another contract sending BOT with
  `transfer()`/`send()` (the 2300-gas stipend) will **fail** — use `deposit()`
  or `call` with an adequate gas budget. Sending from a normal wallet is fine.

---

## If Remix errors with "Failed to fetch eth_chainId"

That is a browser-to-RPC connection issue, not a problem with the contract. The
`rpc.bohr.life` endpoint is responsive. Try:

1. MetaMask → three dots → **Connected sites** → disconnect
   `remix.ethereum.org`, then reconnect from Remix.
2. Re-check the RPC URL in the MetaMask network settings (no spaces or typos).
3. Reload the Remix page (F5) once the network is active.
4. If it still fails, open the browser Console (F12) for a more detailed error.
