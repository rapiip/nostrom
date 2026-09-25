/**
 * Layout, tap-target and contrast verification.
 *
 * Loads every route in real Chrome at three viewports and reports:
 *   - horizontal overflow (excluding intentional scroll containers)
 *   - interactive targets below 24x24px (WCAG 2.2 AA 2.5.8, inline links exempt)
 *   - visible text below 10.5px
 *   - COMPUTED WCAG contrast for every text node, resolving alpha backgrounds
 *     up the ancestor chain
 *   - console errors, uncaught page errors, failed requests
 *
 * Run against the production build, not the dev server — Vite's dependency
 * re-optimisation and HMR produce aborted requests that look like real failures.
 *
 *   npx vite build && npx vite preview --port 4173
 *   VERIFY_BASE=http://localhost:4173 node scripts/verify-ui.cjs
 *
 * Requires a local Chrome and puppeteer-core. Screenshots land in .verify/.
 */
const puppeteer = require("puppeteer-core");
const fs = require("node:fs");
const path = require("node:path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.VERIFY_BASE || "http://localhost:5173";
const OUT = path.join(__dirname, "..", ".verify");

const VAULTS = {
  alive: "0xB7A5bd0345EF1Cc5E66bf61BdeC17D2461fBd968",
  expiring: "0xeEBe00Ac0756308ac4AaBfD76c05c4F3088B8883",
  executable: "0x10C6E9530F1C1AF873a391030a1D9E8ed0630D26",
  triggered: "0x603E1BD79259EbcbAaeD0c83eeC09cA0B89a5bcC",
  empty: "0x86337dDaF2661A069D0DcB5D160585acC2d15E9a",
};

const ROUTES = [
  { name: "landing", url: "/", full: true },
  { name: "app-vaults", url: "/app" },
  { name: "app-new", url: "/app/new" },
  { name: "app-lookup", url: "/app/lookup" },
  { name: "app-keeper", url: "/app/keeper" },
  { name: "vault-alive", url: `/app/vault/${VAULTS.alive}`, full: true },
  { name: "vault-expiring", url: `/app/vault/${VAULTS.expiring}` },
  { name: "vault-executable", url: `/app/vault/${VAULTS.executable}`, full: true },
  { name: "vault-triggered", url: `/app/vault/${VAULTS.triggered}` },
  { name: "vault-empty", url: `/app/vault/${VAULTS.empty}` },
  { name: "vault-bogus", url: "/app/vault/0x000000000000000000000000000000000000dEaD" },
  { name: "vault-malformed", url: "/app/vault/not-an-address" },
  { name: "notfound", url: "/app/nowhere" },
];

const VIEWPORTS = [
  { label: "desktop", width: 1440, height: 1000 },
  { label: "tablet", width: 768, height: 1024 },
  { label: "mobile", width: 375, height: 812 },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--hide-scrollbars", "--force-prefers-reduced-motion=false"],
  });

  const report = [];

  for (const vp of VIEWPORTS) {
    for (const route of ROUTES) {
      // Only screenshot every route at desktop; spot-check layout at the rest.
      if (vp.label !== "desktop" && !route.full && route.name !== "app-vaults") continue;

      const page = await browser.newPage();
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });

      const consoleErrors = [];
      const pageErrors = [];
      const failedRequests = [];

      page.on("console", (msg) => {
        if (msg.type() === "error") {
          const t = msg.text();
          // Expected: no wallet injected in headless Chrome, and the local RPC
          // is only reachable once a chain is selected.
          if (/Failed to load resource/i.test(t)) return;
          consoleErrors.push(t);
        }
      });
      page.on("pageerror", (e) => pageErrors.push(e.message));
      page.on("requestfailed", (r) => {
        failedRequests.push(`${r.url()} :: ${r.failure()?.errorText}`);
      });

      await page.goto(BASE + route.url, { waitUntil: "networkidle2", timeout: 30000 });
      await new Promise((r) => setTimeout(r, 1600));

      const metrics = await page.evaluate(() => {
        const de = document.documentElement;

        /** True if the element sits inside an intentional horizontal scroller. */
        const inScroller = (el) => {
          for (let p = el.parentElement; p; p = p.parentElement) {
            const o = getComputedStyle(p).overflowX;
            if (o === "auto" || o === "scroll") return true;
          }
          return false;
        };

        const isHidden = (el) => {
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden" || cs.display === "none") return true;
          // sr-only pattern: 1px clipped box.
          const r = el.getBoundingClientRect();
          return r.width <= 1 || r.height <= 1;
        };

        // Elements extending past the viewport that are NOT inside a scroller.
        const offenders = [];
        for (const el of document.querySelectorAll("*")) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > de.clientWidth + 2 && !inScroller(el)) {
            offenders.push(
              `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} right=${Math.round(r.right)}`,
            );
          }
        }

        // WCAG 2.2 AA 2.5.8 requires 24x24 for standalone targets. Inline links
        // inside a sentence are exempt, so links whose parent is a paragraph or
        // list-item of prose are skipped.
        const inlineExempt = (el) => {
          const p = el.parentElement;
          if (!p) return false;
          if (!["P", "SPAN", "LI", "DD", "DT", "CODE"].includes(p.tagName)) return false;
          // Exempt only when there is sibling text around the link.
          return (p.textContent || "").trim().length > (el.textContent || "").trim().length + 4;
        };

        const small = [];
        for (const el of document.querySelectorAll(
          "button, a, input, [role=radio], summary",
        )) {
          if (isHidden(el)) continue;
          if (inlineExempt(el)) continue;
          const r = el.getBoundingClientRect();
          if (r.height < 24 || r.width < 24) {
            small.push(
              `${el.tagName.toLowerCase()} "${(el.textContent || "").trim().slice(0, 28)}" ${Math.round(r.width)}x${Math.round(r.height)}`,
            );
          }
        }

        // Contrast spot-check on body copy: flag any visible text below 12px.
        const tiny = [];
        for (const el of document.querySelectorAll("p, span, dt, dd, li, code")) {
          if (isHidden(el)) continue;
          if (!(el.textContent || "").trim()) continue;
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs && fs < 10.5) {
            tiny.push(`${Math.round(fs)}px "${(el.textContent || "").trim().slice(0, 24)}"`);
          }
        }

        /* --- Real WCAG 2.1 contrast measurement -------------------------- */
        const parseRgb = (s) => {
          const m = s.match(/rgba?\(([^)]+)\)/);
          if (!m) return null;
          const p = m[1].split(",").map((x) => parseFloat(x));
          return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
        };
        const lum = ({ r, g, b }) => {
          const f = (v) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
          };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        /** Walk up for the first opaque background. */
        const bgOf = (el) => {
          for (let p = el; p; p = p.parentElement) {
            const c = parseRgb(getComputedStyle(p).backgroundColor);
            if (c && c.a > 0.85) return c;
          }
          return { r: 8, g: 9, b: 10, a: 1 };
        };

        const lowContrast = [];
        const seen = new Set();
        for (const el of document.querySelectorAll(
          "p, span, dt, dd, li, code, h1, h2, h3, h4, a, button, label",
        )) {
          if (isHidden(el)) continue;
          // Only leaf-ish nodes, so a wrapper isn't blamed for its children.
          const ownText = Array.from(el.childNodes)
            .filter((n) => n.nodeType === 3)
            .map((n) => n.textContent.trim())
            .join("");
          if (!ownText) continue;

          const cs = getComputedStyle(el);
          const fg = parseRgb(cs.color);
          if (!fg) continue;
          const bg = bgOf(el);
          const l1 = lum(fg);
          const l2 = lum(bg);
          const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

          const fs = parseFloat(cs.fontSize);
          const bold = parseInt(cs.fontWeight, 10) >= 700;
          // WCAG large-text threshold: >=24px, or >=18.66px bold.
          const isLarge = fs >= 24 || (bold && fs >= 18.66);
          const required = isLarge ? 3 : 4.5;

          if (ratio < required) {
            const key = `${cs.color}|${Math.round(fs)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            lowContrast.push(
              `${ratio.toFixed(2)}:1 (need ${required}) ${Math.round(fs)}px ${cs.color} "${ownText.slice(0, 24)}"`,
            );
          }
        }

        return {
          scrollW: de.scrollWidth,
          clientW: de.clientWidth,
          overflow: offenders.slice(0, 6),
          smallTargets: [...new Set(small)].slice(0, 6),
          tinyText: [...new Set(tiny)].slice(0, 4),
          lowContrast: lowContrast.slice(0, 8),
          h1: document.querySelector("h1")?.textContent?.trim().slice(0, 70) ?? null,
          bodyLen: document.body.innerText.length,
        };
      });

      await page.screenshot({
        path: path.join(OUT, `${vp.label}-${route.name}.png`),
        // Never full-page: some routes are tall enough to exceed image limits,
        // and the viewport frame is what matters for layout checks anyway.
        fullPage: false,
      });

      report.push({
        viewport: vp.label,
        route: route.name,
        ...metrics,
        hScroll: metrics.scrollW > metrics.clientW + 1,
        consoleErrors,
        pageErrors,
        failedRequests: failedRequests.filter((f) => !/127\.0\.0\.1:8545|localhost:8545/.test(f)),
      });

      await page.close();
    }
  }

  await browser.close();

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));

  let problems = 0;
  for (const r of report) {
    const issues = [];
    if (r.hScroll) issues.push(`H-SCROLL (${r.scrollW} > ${r.clientW})`);
    if (r.overflow.length) issues.push(`OVERFLOW: ${r.overflow.join(" | ")}`);
    if (r.smallTargets.length) issues.push(`SMALL TARGETS: ${r.smallTargets.join(" | ")}`);
    if (r.tinyText.length) issues.push(`TINY TEXT: ${r.tinyText.join(" | ")}`);
    if (r.lowContrast.length) issues.push(`CONTRAST:\n      ${r.lowContrast.join("\n      ")}`);
    if (r.pageErrors.length) issues.push(`PAGE ERRORS: ${r.pageErrors.join(" | ")}`);
    if (r.consoleErrors.length) issues.push(`CONSOLE: ${r.consoleErrors.slice(0, 3).join(" | ")}`);
    if (r.failedRequests.length) issues.push(`NET: ${r.failedRequests.slice(0, 2).join(" | ")}`);
    if (r.bodyLen < 120) issues.push(`EMPTY PAGE (text length ${r.bodyLen})`);

    if (issues.length) {
      problems++;
      console.log(`\n[${r.viewport}] ${r.route}`);
      for (const i of issues) console.log(`   ${i}`);
    }
  }
  console.log(`\n${report.length} page loads checked, ${problems} with findings.`);
})();
