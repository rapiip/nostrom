/**
 * Renders a social image from HTML to a pixel-exact PNG.
 *
 * Text in these images is real type rendered by Chrome, not generated pixels, so
 * headlines stay sharp at any scale and cannot be misspelled the way an image
 * model misspells them. Colours come straight from the design tokens in the HTML,
 * which means a post image and the product it advertises cannot drift apart.
 *
 * Waits on document.fonts.ready before capturing: without it Chrome screenshots
 * the fallback stack and the type metrics shift.
 *
 * Usage:
 *   node scripts/render-social.cjs <input.html> <output.png> [width] [height] [scale]
 */

const path = require("node:path");
const fs = require("node:fs");
const puppeteer = require("puppeteer-core");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function main() {
  const [input, output, w = "1600", h = "900", scale = "2"] = process.argv.slice(2);

  if (!input || !output) {
    console.error("usage: node scripts/render-social.cjs <input.html> <output.png> [w] [h] [scale]");
    process.exit(1);
  }

  const inPath = path.resolve(input);
  const outPath = path.resolve(output);

  if (!fs.existsSync(inPath)) {
    console.error(`input not found: ${inPath}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const width = Number(w);
  const height = Number(h);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--hide-scrollbars", "--force-color-profile=srgb"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({
      width,
      height,
      deviceScaleFactor: Number(scale), // 2x so the PNG survives X's recompression
    });

    await page.goto(`file://${inPath}`, { waitUntil: "networkidle0", timeout: 60_000 });

    // Google Fonts must actually be resolved before the capture.
    await page.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 400));

    const loadedInter = await page.evaluate(() => document.fonts.check("600 54px Inter"));
    const loadedMono = await page.evaluate(() =>
      document.fonts.check("500 13px 'IBM Plex Mono'"),
    );

    await page.screenshot({
      path: outPath,
      type: "png",
      clip: { x: 0, y: 0, width, height },
    });

    const bytes = fs.statSync(outPath).size;
    console.log(`rendered  ${path.relative(process.cwd(), outPath)}`);
    console.log(`size      ${width}x${height} @${scale}x  (${(bytes / 1024).toFixed(0)} KB)`);
    console.log(`fonts     Inter ${loadedInter ? "ok" : "FALLBACK"} · IBM Plex Mono ${loadedMono ? "ok" : "FALLBACK"}`);

    if (!loadedInter || !loadedMono) {
      console.log("\nwarning: a webfont fell back. Check network access and re-render.");
      process.exitCode = 2;
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
