/**
 * End-to-end wallet and transaction verification.
 *
 * Injects an EIP-1193 provider that forwards every RPC to a local Hardhat node.
 * Hardhat's dev accounts are unlocked, so eth_sendTransaction is forwarded
 * verbatim and real transactions mine; this exercises the genuine
 * signing -> pending -> receipt path rather than a stub.
 *
 * The node is switched to 4-second interval mining for the duration, because
 * auto-mining confirms a transaction before the UI can render a pending state,
 * which would make "never show success before confirmation" untestable.
 *
 * Prerequisites: node running, factory deployed, seed-local.cjs run, app built
 * and served, and frontend/.env pointing at chain 31337.
 *
 *   VERIFY_BASE=http://localhost:4173 node scripts/verify-flows.cjs
 *
 * Flows covered:
 *   1. connect wallet, list vaults from the batched registry read
 *   2. agent sends ping(): asserts pending precedes confirmation
 *   3. a guaranteed-revert action is refused up front, with the error named
 *   4. keeper fires executeDeadManSwitch() and the scan re-reads
 *   5. unsupported network is detected and a switch is offered
 *   6. vault is publicly inspectable with no wallet at all
 */
const puppeteer = require("puppeteer-core");
const fs = require("node:fs");
const path = require("node:path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.VERIFY_BASE || "http://localhost:4173";
const RPC = "http://127.0.0.1:8545";
const OUT = path.join(__dirname, "..", ".verify");

// Hardhat default accounts.
const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // creator/owner
const AGENT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // heartbeat key

const VAULTS = {
  alive: "0xB7A5bd0345EF1Cc5E66bf61BdeC17D2461fBd968",
  executable: "0x10C6E9530F1C1AF873a391030a1D9E8ed0630D26",
};

/** Injected before any page script runs. */
function makeProvider(account, chainIdHex, rpc) {
  const state = { account, chainIdHex };
  const listeners = {};
  // Recorded so a failed flow can show what the app actually asked the wallet.
  window.__rpcLog = [];

  const request = async ({ method, params }) => {
    window.__rpcLog.push(method);
    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        return [state.account];
      case "eth_chainId":
        return state.chainIdHex;
      case "net_version":
        return String(parseInt(state.chainIdHex, 16));
      case "wallet_switchEthereumChain": {
        const target = params?.[0]?.chainId;
        if (target) {
          state.chainIdHex = target;
          (listeners["chainChanged"] || []).forEach((fn) => fn(target));
        }
        return null;
      }
      case "wallet_addEthereumChain":
        return null;
      case "wallet_getPermissions":
      case "wallet_requestPermissions":
        return [{ parentCapability: "eth_accounts" }];
      default:
        break;
    }

    const res = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params: params ?? [] }),
    });
    const json = await res.json();
    if (json.error) {
      const err = new Error(json.error.message || "RPC error");
      err.code = json.error.code ?? -32000;
      err.data = json.error.data;
      throw err;
    }
    return json.result;
  };

  const provider = {
    isMetaMask: true,
    request,
    on(event, fn) {
      (listeners[event] = listeners[event] || []).push(fn);
      return provider;
    },
    removeListener(event, fn) {
      listeners[event] = (listeners[event] || []).filter((f) => f !== fn);
      return provider;
    },
    __setChain(hex) {
      state.chainIdHex = hex;
      (listeners["chainChanged"] || []).forEach((fn) => fn(hex));
    },
  };

  window.ethereum = provider;
  window.__mockProvider = provider;
}

async function newPage(browser, account, chainIdHex = "0x7a69") {
  // A fresh context per flow: wagmi persists the connection in localStorage, so
  // sharing one profile would let an earlier flow's account leak into a later one.
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) {
      errors.push(m.text());
    }
  });
  page.__errors = errors;
  page.__context = context;

  await page.evaluateOnNewDocument(makeProvider, account, chainIdHex, RPC);
  return page;
}

async function closePage(page) {
  await page.close();
  if (page.__context) await page.__context.close();
}

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "  PASS" : "  FAIL"}  ${name}${detail ? `: ${detail}` : ""}`);
}

/** Direct JSON-RPC call to the node, for test setup. */
async function rpc(method, params = []) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result;
}

/**
 * Hardhat auto-mines, so a transaction is confirmed before the UI can render a
 * pending state, which would make "never show success before confirmation"
 * untestable. Interval mining gives a real mempool window to observe.
 */
async function setSlowMining(intervalMs) {
  await rpc("evm_setAutomine", [false]);
  await rpc("evm_setIntervalMining", [intervalMs]);
}
async function restoreMining() {
  await rpc("evm_setIntervalMining", [0]);
  await rpc("evm_setAutomine", [true]);
}

/**
 * Click the first element whose trimmed text matches.
 *
 * Dispatched inside the page rather than via Puppeteer's mouse: a real click is
 * hit-tested, and the app's sticky header occludes controls near the top of the
 * document after scrollIntoView, so the click would land on the header instead.
 */
async function clickByText(page, selector, text) {
  const clicked = await page.evaluate(
    (sel, t) => {
      const el = Array.from(document.querySelectorAll(sel)).find((e) =>
        (e.textContent || "").trim().toLowerCase().includes(t.toLowerCase()),
      );
      if (!el) return false;
      el.scrollIntoView({ block: "center" });
      el.click();
      return true;
    },
    selector,
    text,
  );
  if (!clicked) throw new Error(`No ${selector} containing "${text}"`);
}

async function waitForText(page, text, timeout = 25000) {
  await page.waitForFunction(
    (t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()),
    { timeout, polling: 250 },
    text,
  );
}

/** Case-insensitive body-text probe: `.label` renders uppercase via CSS. */
async function bodyText(page) {
  return page.evaluate(() => document.body.innerText);
}
function has(text, needle) {
  return text.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Connect only if a Connect button is present. wagmi's shimDisconnect persists
 * the authorisation in localStorage, which the browser shares across pages on
 * the same origin, so a later page legitimately auto-reconnects.
 */
async function ensureConnected(page) {
  await new Promise((r) => setTimeout(r, 1200));
  const found = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) =>
      (x.textContent || "").trim().toLowerCase().includes("connect wallet"),
    );
    if (b) {
      b.click();
      return true;
    }
    return false;
  });
  await new Promise((r) => setTimeout(r, found ? 2800 : 1800));
  return found;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // 4-second blocks, so the signing -> pending -> confirmed transition is real
  // and observable rather than collapsed into one frame by auto-mining.
  await setSlowMining(4000);
  console.log("Node switched to 4s interval mining for an observable pending window.");

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--hide-scrollbars"],
  });

  /* ================= 1. Connect + vault list ========================== */
  console.log("\n[1] Connect wallet and list vaults (owner account)");
  {
    const page = await newPage(browser, OWNER);
    await page.goto(`${BASE}/app`, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 800));

    await ensureConnected(page);
    try {
      await waitForText(page, "Your vaults");
    } catch {
      const dump = await page.evaluate(() => ({
        text: document.body.innerText.slice(0, 900),
        chain: window.__mockProvider ? "provider present" : "NO PROVIDER",
      }));
      console.log("  DIAGNOSTIC:", JSON.stringify(dump, null, 2));
      throw new Error("connect flow did not reach the vault list");
    }
    await new Promise((r) => setTimeout(r, 2500));

    const text = await bodyText(page);
    check("wallet connects and address renders", /0xf39F/i.test(text), "truncated address shown");
    check("vault list loads from registry", has(text, "Total secured"));
    check(
      "all five seeded vaults render",
      (text.match(/Manage/g) || []).length === 5,
      `${(text.match(/Manage/g) || []).length} rows`,
    );
    check("alive status present", has(text, "Alive"));
    check("executable status present", has(text, "Executable"));
    check("triggered status present", has(text, "Triggered"));
    check("at-risk banner surfaces lapsed vault", has(text, "can be rescued right now"));
    check(
      "testnet notice not shown on a non-968 chain",
      !has(text, "BOT Chain Testnet"),
      "chain 31337",
    );
    check("no console errors", page.__errors.length === 0, page.__errors.slice(0, 2).join(" | "));

    await page.screenshot({ path: path.join(OUT, "flow-1-vaults-connected.png") });
    await closePage(page);
  }

  /* ================= 2. Agent ping (real transaction) ================= */
  console.log("\n[2] Agent sends a heartbeat (real signed transaction)");
  {
    const page = await newPage(browser, AGENT);
    await page.goto(`${BASE}/app/vault/${VAULTS.alive}`, { waitUntil: "networkidle2" });
    await ensureConnected(page);
    await new Promise((r) => setTimeout(r, 2500));

    let text = await bodyText(page);
    check("agent role detected", has(text, "Agent"), "role line shows Agent");
    check("heartbeat button offered to agent", has(text, "Send heartbeat"));
    check("tracked ERC-20 listed", has(text, "TUSD"), "watchlist read");
    check("token balance read", /2,500/.test(text));

    const pingsBefore = (text.match(/Lifetime pings\s+(\d+)/i) || [])[1];

    await clickByText(page, "button", "Send heartbeat");
    // The dialog must show pending BEFORE success, never the other way round.
    try {
      await waitForText(page, "Transaction submitted", 20000);
    } catch {
      const dump = await page.evaluate(() => {
        const d = document.querySelector("dialog");
        return {
          dialogOpen: Boolean(d?.open),
          dialogText: d ? d.innerText.slice(0, 700) : "NO DIALOG",
          rpcLog: window.__rpcLog ? window.__rpcLog.slice(-14) : [],
        };
      });
      console.log("  DIAGNOSTIC:", JSON.stringify(dump, null, 2));
      throw new Error("ping did not reach the pending state");
    }
    const pendingText = await bodyText(page);
    check(
      "pending state does not claim success",
      has(pendingText, "Waiting for a block") && !has(pendingText, "Transaction confirmed"),
    );
    check(
      "pending copy warns it is not a guarantee",
      has(pendingText, "not a guarantee of success"),
    );

    await waitForText(page, "Transaction confirmed", 30000);
    const doneText = await bodyText(page);
    check("confirmation only after receipt", has(doneText, "Heartbeat recorded"));
    check("block number reported", /Included in block \d+/i.test(doneText));
    check("gas used reported", /gas used/i.test(doneText));
    check("tx hash + explorer offered", /Transaction hash/i.test(doneText));

    await page.screenshot({ path: path.join(OUT, "flow-2-ping-confirmed.png") });

    await clickByText(page, "button", "Done");
    await new Promise((r) => setTimeout(r, 3500));
    text = await bodyText(page);
    const pingsAfter = (text.match(/Lifetime pings\s+(\d+)/i) || [])[1];
    check(
      "ping count incremented on-chain",
      Number(pingsAfter) === Number(pingsBefore) + 1,
      `${pingsBefore} -> ${pingsAfter}`,
    );
    check("no console errors", page.__errors.length === 0, page.__errors.slice(0, 2).join(" | "));
    await closePage(page);
  }

  /* ================= 3. Revert path is pre-empted ===================== */
  console.log("\n[3] A guaranteed-revert action is refused up front");
  {
    const page = await newPage(browser, AGENT);
    await page.goto(`${BASE}/app/vault/${VAULTS.alive}`, { waitUntil: "networkidle2" });
    await ensureConnected(page);
    await new Promise((r) => setTimeout(r, 2000));

    const text = await bodyText(page);
    check(
      "execute button disabled while agent alive",
      has(text, "Disabled because the heartbeat is current"),
    );
    check("revert reason named up front", has(text, "AgentStillAlive"));
    check(
      "non-owner is not offered owner controls",
      !has(text, "Withdraw everything"),
      "agent is not the owner",
    );
    await closePage(page);
  }

  /* ================= 4. Keeper fires the switch ======================= */
  console.log("\n[4] Keeper executes the dead-man's switch on a lapsed vault");
  {
    const page = await newPage(browser, OWNER);
    await page.goto(`${BASE}/app/keeper`, { waitUntil: "networkidle2" });
    await ensureConnected(page);
    await waitForText(page, "Keeper scan");
    await new Promise((r) => setTimeout(r, 3000));

    let text = await bodyText(page);
    check("keeper scan finds the lapsed vault", !has(text, "Every agent is alive"),
      "executable set is non-empty");
    check("keeper told they receive nothing", has(text, "receive nothing"));

    // Read the actual target from the DOM rather than hardcoding an address:
    // which vault is executable depends on how much time has passed.
    const targetShort = await page.evaluate(() => {
      const row = document.querySelector("ul li");
      const m = row?.innerText.match(/0x[0-9a-fA-F]{6}/);
      return m ? m[0] : null;
    });
    check("executable row exposes its vault address", Boolean(targetShort), String(targetShort));

    await clickByText(page, "button", "Execute");
    await waitForText(page, "Execute this vault's switch", 10000);
    const confirmText = await bodyText(page);
    check(
      "confirmation names the fixed destination",
      has(confirmText, "Destination (recovery address)"),
    );
    check("confirmation states caller gains nothing", has(confirmText, "receive nothing"));

    await page.screenshot({ path: path.join(OUT, "flow-4-keeper-confirm.png") });

    // Confirm inside the dialog.
    await page.evaluate(() => {
      const go = Array.from(document.querySelectorAll("dialog button")).find(
        (b) => b.textContent.trim() === "Execute",
      );
      go.click();
    });

    await waitForText(page, "Waiting for a block", 25000);
    check("keeper execution reaches pending state", true);

    await waitForText(page, "Transaction confirmed", 60000);
    text = await bodyText(page);
    check("switch fired and confirmed from receipt", has(text, "Switch fired"));
    check("keeper receipt reports block", /Included in block \d+/i.test(text));
    check("keeper receipt offers explorer link", has(text, "Transaction hash"));

    await page.screenshot({ path: path.join(OUT, "flow-4-keeper-confirmed.png") });

    // Dismiss and let the scan re-read.
    await clickByText(page, "button", "Done");
    await new Promise((r) => setTimeout(r, 6000));
    text = await bodyText(page);
    check(
      "scan re-reads and the vault leaves the executable set",
      has(text, "Every agent is alive") || !new RegExp(targetShort, "i").test(text),
      "list refreshed after confirmation",
    );
    check("no console errors", page.__errors.length === 0, page.__errors.slice(0, 2).join(" | "));

    await page.screenshot({ path: path.join(OUT, "flow-4-keeper-after.png") });
    await closePage(page);
  }

  /* ================= 5. Wrong network ================================ */
  console.log("\n[5] Unsupported network is handled");
  {
    const page = await newPage(browser, OWNER, "0x1"); // Ethereum mainnet
    await page.goto(`${BASE}/app`, { waitUntil: "networkidle2" });
    await ensureConnected(page);
    await new Promise((r) => setTimeout(r, 2000));

    const text = await bodyText(page);
    check("unsupported chain detected", has(text, "Unsupported network"));
    check("chain id named in the message", has(text, "chain 1"));
    check("switch targets offered", has(text, "Switch to BOT Chain"));

    await page.screenshot({ path: path.join(OUT, "flow-5-wrong-network.png") });
    await closePage(page);
  }

  /* ================= 6. Read-only (no wallet) ======================== */
  console.log("\n[6] Vault is publicly inspectable without a wallet");
  {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    // No provider injected at all.
    await page.goto(`${BASE}/app/vault/${VAULTS.alive}`, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 3000));
    const text = await bodyText(page);
    check("vault state readable with no wallet", has(text, "Heartbeat"));
    check("read-only mode declared", has(text, "Read-only"));
    check("no write controls offered", !has(text, "Send heartbeat"));
    check("install prompt offered instead of a dead button", has(text, "Install a wallet"));
    await page.close();
    await context.close();
  }

  await browser.close();
  await restoreMining();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length} assertions, ${failed.length} failed.`);
  if (failed.length) {
    for (const f of failed) console.log(`  FAILED: ${f.name} ${f.detail}`);
    process.exitCode = 1;
  }
})();
