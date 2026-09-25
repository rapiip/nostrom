/**
 * Does the shipped <Logo> SVG actually reproduce the brand artwork?
 *
 * Renders the path from Logo.tsx in Chrome at the source mark's resolution, then
 * compares the rasterised result to the source PNG's mark by intersection-over-
 * union. Catches a path that looks plausible in isolation but has drifted from
 * the artwork.
 *
 *   node scripts/verify-logo.cjs
 */
const puppeteer = require("puppeteer-core");
const fs = require("node:fs");
const path = require("node:path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const LOGO_TSX = path.join(__dirname, "..", "src", "components", "landing", "Logo.tsx");
const SRC_PNG = "D:\\Downloads\\ChatGPT Image 22 Sep 2026, 13.29.14.png";
const OUT = path.join(__dirname, "..", ".verify");

// Source mark bounds, as measured by scripts/vectorise-logo.py.
const MARK = { x: 362, y: 489, w: 533, h: 262 };

(async () => {
  const tsx = fs.readFileSync(LOGO_TSX, "utf8");
  const d = tsx.match(/d="([^"]+)"/)?.[1];
  const viewBox = tsx.match(/viewBox="([^"]+)"/)?.[1];
  if (!d || !viewBox) throw new Error("could not extract path/viewBox from Logo.tsx");
  console.log(`viewBox ${viewBox}   path ${d.length} chars`);

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--hide-scrollbars", "--force-device-scale-factor=1"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: MARK.w, height: MARK.h, deviceScaleFactor: 1 });

  // White mark on black, exactly the source framing, so pixels are comparable.
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#000">
    <svg width="${MARK.w}" height="${MARK.h}" viewBox="${viewBox}"
         xmlns="http://www.w3.org/2000/svg" style="display:block">
      <path fill="#fff" d="${d}"/>
    </svg></body></html>`);
  await new Promise((r) => setTimeout(r, 250));

  const shot = path.join(OUT, "logo-render.png");
  await page.screenshot({ path: shot });
  await browser.close();

  // Compare via Chrome itself: decode both images on a canvas and compute IoU.
  const b2 = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--allow-file-access-from-files"],
  });
  const p2 = await b2.newPage();
  await p2.goto("about:blank");

  const toDataUrl = (f) => "data:image/png;base64," + fs.readFileSync(f).toString("base64");

  const result = await p2.evaluate(
    async (renderUrl, srcUrl, mark) => {
      const load = (u) =>
        new Promise((res, rej) => {
          const i = new Image();
          i.onload = () => res(i);
          i.onerror = rej;
          i.src = u;
        });

      const render = await load(renderUrl);
      const src = await load(srcUrl);

      const grab = (img, sx, sy, sw, sh) => {
        const c = document.createElement("canvas");
        c.width = mark.w;
        c.height = mark.h;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.drawImage(img, sx, sy, sw, sh, 0, 0, mark.w, mark.h);
        return g.getImageData(0, 0, mark.w, mark.h).data;
      };

      const A = grab(render, 0, 0, render.width, render.height);
      const B = grab(src, mark.x, mark.y, mark.w, mark.h);

      let inter = 0,
        union = 0,
        onlyA = 0,
        onlyB = 0;
      const W = mark.w,
        H = mark.h;
      const ba = new Uint8Array(W * H);
      const bb = new Uint8Array(W * H);
      for (let i = 0, p = 0; i < A.length; i += 4, p++) {
        // Luma; the mark is white on near-black in both images.
        ba[p] = A[i] * 0.299 + A[i + 1] * 0.587 + A[i + 2] * 0.114 > 110 ? 1 : 0;
        bb[p] = B[i] * 0.299 + B[i + 1] * 0.587 + B[i + 2] * 0.114 > 110 ? 1 : 0;
      }
      for (let p = 0; p < ba.length; p++) {
        if (ba[p] || bb[p]) union++;
        if (ba[p] && bb[p]) inter++;
        if (ba[p] && !bb[p]) onlyA++;
        if (!ba[p] && bb[p]) onlyB++;
      }

      // A crisp vector compared against a soft raster always loses a sub-pixel
      // shell along the whole perimeter. Distinguish that from real geometry
      // error: count disagreements that survive a 1px dilation of the other
      // mask. Those are not edge effects.
      const near = (m, x, y) => {
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx,
              ny = y + dy;
            if (nx >= 0 && nx < W && ny >= 0 && ny < H && m[ny * W + nx]) return true;
          }
        return false;
      };
      let deepA = 0,
        deepB = 0;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const p = y * W + x;
          if (ba[p] && !bb[p] && !near(bb, x, y)) deepA++;
          if (!ba[p] && bb[p] && !near(ba, x, y)) deepB++;
        }

      return { iou: inter / union, onlyA, onlyB, union, deepA, deepB };
    },
    toDataUrl(shot),
    toDataUrl(SRC_PNG),
    MARK,
  );

  await b2.close();

  const pct = (result.iou * 100).toFixed(3);
  console.log(`IoU rendered-SVG vs source artwork: ${pct}%`);
  console.log(`  pixels only in SVG:    ${result.onlyA}  (beyond 1px of source: ${result.deepA})`);
  console.log(`  pixels only in source: ${result.onlyB}  (beyond 1px of SVG:    ${result.deepB})`);
  console.log(`  union:                 ${result.union}`);
  console.log(`screenshot: ${path.relative(process.cwd(), shot)}`);

  // Judge on structural agreement, not on the sub-pixel shell: a crisp vector
  // can never match a soft raster's antialiased edge pixel-for-pixel.
  const deep = result.deepA + result.deepB;
  const deepShare = deep / result.union;
  console.log(`  structural mismatch:   ${deep} px (${(deepShare * 100).toFixed(3)}% of union)`);

  if (deepShare > 0.005) {
    console.error("\nFAIL: mark deviates from the artwork beyond edge antialiasing.");
    process.exit(1);
  }
  console.log("\nPASS — differences are confined to a sub-pixel edge shell.");
})();
