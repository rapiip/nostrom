/** Full-page screenshots for the visual design review, wallet-connected where useful. */
const puppeteer = require("puppeteer-core");
const path = require("node:path");
const fs = require("node:fs");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.VERIFY_BASE || "http://localhost:4173";
const RPC = "http://127.0.0.1:8545";
const OUT = path.join(__dirname, "..", ".verify", "review");

const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const VAULTS = {
  alive: "0xB7A5bd0345EF1Cc5E66bf61BdeC17D2461fBd968",
  expiring: "0xeEBe00Ac0756308ac4AaBfD76c05c4F3088B8883",
  executable: "0x10C6E9530F1C1AF873a391030a1D9E8ed0630D26",
};

function makeProvider(account, chainIdHex, rpc) {
  const state = { account, chainIdHex };
  const listeners = {};
  const request = async ({ method, params }) => {
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
      (listeners[event] = (listeners[event] || []).filter((f) => f !== fn));
      return provider;
    },
  };
  window.ethereum = provider;
}

const ROUTES = [
  { name: "connected-app-vaults", url: "/app", wallet: true },
  { name: "connected-app-new", url: "/app/new", wallet: true },
  { name: "connected-app-keeper", url: "/app/keeper", wallet: true },
  { name: "connected-vault-alive", url: `/app/vault/${VAULTS.alive}`, wallet: true },
  { name: "connected-vault-expiring", url: `/app/vault/${VAULTS.expiring}`, wallet: true },
  { name: "connected-vault-executable", url: `/app/vault/${VAULTS.executable}`, wallet: true },
  { name: "mobile-connected-app-new", url: "/app/new", wallet: true, vp: "mobile" },
  { name: "mobile-connected-vault-alive", url: `/app/vault/${VAULTS.alive}`, wallet: true, vp: "mobile" },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--hide-scrollbars"],
  });

  for (const route of ROUTES) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const vp = route.vp === "mobile" ? { width: 375, height: 812 } : { width: 1440, height: 1000 };
    await page.setViewport({ ...vp, deviceScaleFactor: 1 });
    if (route.wallet) {
      await page.evaluateOnNewDocument(makeProvider, OWNER, "0x7a69", RPC);
    }
    await page.goto(BASE + route.url, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1200));
    if (route.wallet) {
      // The console requires an explicit connect, even with a provider present.
      const clicked = await page.evaluate(() => {
        const btns = [...document.querySelectorAll("button")];
        const b = btns.find((el) => /connect wallet/i.test(el.textContent || ""));
        if (b) {
          b.click();
          return true;
        }
        return false;
      });
      if (clicked) await new Promise((r) => setTimeout(r, 2600));
    }
    await new Promise((r) => setTimeout(r, 1000));
    await page.addStyleTag({
      content: ".reveal{opacity:1 !important;transform:none !important;transition:none !important}",
    });
    await page.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 500));
    await page.screenshot({ path: path.join(OUT, `${route.name}.png`), fullPage: true });
    await page.close();
    context.close().catch(() => {});
    console.log(route.name);
  }
  await browser.close();
})();
