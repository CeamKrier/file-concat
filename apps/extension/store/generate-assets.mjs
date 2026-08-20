// Regenerates the store screenshots and the promo tile into `assets/`.
//
//   pnpm --filter @fileconcat/extension build
//   node apps/extension/store/generate-assets.mjs
//
// Chrome's side panel is window chrome, and Playwright captures pages rather
// than windows, so each screenshot is the real page and the real panel captured
// separately and pasted at their true widths: 880 + 400 = 1280. The result is
// indistinguishable from a window capture and does not need a screenshot tool
// that works under WSL.
//
// The panel is a background tab while the site tab is active, which is what
// makes `tabs.query({active: true})` resolve to the site rather than to the
// panel itself. Playwright activates the panel to capture it, so every shot
// reports the panel's state either side of the capture: if those two ever
// disagree, the shot caught a blanked panel and is not usable.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// `playwright-core` is a devDependency of `apps/web`, not of this package.
// Reaching for it there beats adding a browser driver to an extension that
// only needs one to take four pictures.
// Resolved to its CommonJS main, so the named exports arrive under `default`.
const playwright = await import(
  pathToFileURL(
    createRequire(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../web/package.json"),
    ).resolve("playwright-core"),
  ).href
);
const { chromium } = playwright.default ?? playwright;

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, "assets");
const DIST = resolve(HERE, "../.output/chrome-mv3");
const PROFILE = resolve(HERE, "../.output/store-profile");

/** How Chrome derives an unpacked extension's id: sha256 of its path, first 16
 *  bytes, each nibble mapped onto a-p. */
const EXTENSION_ID = createHash("sha256")
  .update(DIST)
  .digest("hex")
  .slice(0, 32)
  .replace(/./g, (nibble) => String.fromCharCode(97 + parseInt(nibble, 16)));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

mkdirSync(ASSETS, { recursive: true });

const context = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  viewport: { width: 880, height: 800 },
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, "--no-sandbox"],
});

const panel = await context.newPage();
await panel.setViewportSize({ width: 400, height: 800 });
await panel.goto(`chrome-extension://${EXTENSION_ID}/sidepanel.html`);

const peek = () =>
  panel.evaluate(() => ({
    origin: document.getElementById("origin").textContent,
    label: document.getElementById("page-label").textContent,
    rows: document.getElementById("page-list").children.length,
    tray: document.getElementById("tray-list").children.length,
    send: document.getElementById("send").textContent,
    status: document.getElementById("status").textContent,
  }));

/** Chrome draws a hairline where the panel meets the page. Without one the two
 *  captures read as a single confusing page. */
async function compose(name, site) {
  const before = JSON.stringify(await peek());
  const panelShot = await panel.screenshot();
  await site.bringToFront();
  await sleep(400);
  const siteShot = await site.screenshot();
  const after = JSON.stringify(await peek());
  if (before !== after)
    throw new Error(`${name}: the panel changed under the capture\n  ${before}\n  ${after}`);

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(
    `<style>*{margin:0}body{width:1280px;height:800px;display:flex;background:#fff}
     img{display:block;height:800px}.d{width:1px;height:800px;background:#dadce0}</style>
     <img src="data:image/png;base64,${siteShot.toString("base64")}" />
     <div class="d"></div>
     <img src="data:image/png;base64,${panelShot.toString("base64")}" />`,
  );
  await page.screenshot({ path: `${ASSETS}/${name}.png` });
  await page.close();
  console.log(`${name}: ${before}`);
}

const settled = async () => {
  for (let attempt = 0; attempt < 40; attempt++) {
    await sleep(750);
    const rows = await panel.evaluate(() =>
      chrome.storage.local.get("tray").then((s) => s.tray ?? []),
    );
    if (rows.length && rows.every((row) => row.state === "done" || row.state === "failed"))
      return rows;
  }
  throw new Error("clipping never settled");
};

const tick = (count) =>
  panel.evaluate((n) => {
    for (const box of [...document.querySelectorAll("#page-list input")].slice(0, n)) {
      box.checked = true;
      box.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, count);

try {
  await panel.evaluate(() => chrome.storage.local.set({ tray: [], status: null }));

  // 1. Any article, the catch-all handler.
  const wiki = await context.newPage();
  await wiki.goto("https://en.wikipedia.org/wiki/Markdown", { waitUntil: "domcontentloaded" });
  await wiki.bringToFront();
  await sleep(3500);
  await panel.evaluate(() => document.getElementById("clip").click());
  await settled();
  await wiki.bringToFront();
  await sleep(600);
  await compose("screenshot-1-article", wiki);

  // 2. A list page, which is the multi-select story and the comments toggle.
  //    A YouTube channel rather than the Hacker News front page: the listing
  //    names transcripts first, and HN's front page is whatever HN is today.
  const yt = await context.newPage();
  await yt.goto("https://www.youtube.com/@Fireship/videos", { waitUntil: "domcontentloaded" });
  await yt.bringToFront();
  await sleep(6000);
  await panel.evaluate(() => chrome.storage.local.set({ tray: [], status: null }));
  await tick(3);
  await yt.bringToFront();
  await sleep(800);
  await compose("screenshot-2-youtube", yt);

  // 3. The payoff: several clippings landing in the app as one bundle.
  await panel.evaluate(() => document.getElementById("clip").click());
  await settled();
  const hn = await context.newPage();
  await hn.goto("https://news.ycombinator.com/", { waitUntil: "domcontentloaded" });
  await hn.bringToFront();
  await sleep(3000);
  await tick(2);
  await panel.evaluate(() => document.getElementById("clip").click());
  await settled();
  const app = await context.newPage();
  await app.goto("https://fileconcat.com/", { waitUntil: "domcontentloaded" });
  await app.bringToFront();
  await sleep(4000);
  await panel.evaluate(() => document.getElementById("send").click());
  await sleep(6000);
  await app.bringToFront();
  await sleep(1500);
  await compose("screenshot-3-bundle", app);

  // 4. The promo tile, rendered in the browser so it uses the site's own fonts.
  const logo = readFileSync(resolve(HERE, "../../web/public/logo.png")).toString("base64");
  const tile = await context.newPage();
  await tile.setViewportSize({ width: 440, height: 280 });
  await tile.setContent(`<!doctype html>
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700&family=Hanken+Grotesk:wght@400&display=swap" rel="stylesheet" />
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      html,body{width:440px;height:280px}
      body{background:#16130f;display:flex;flex-direction:column;justify-content:center;
           padding:0 34px;gap:14px;font-family:"Hanken Grotesk",system-ui,sans-serif;
           -webkit-font-smoothing:antialiased}
      img{width:56px;height:56px;border-radius:13px}
      h1{font-family:"Space Grotesk",sans-serif;font-weight:700;font-size:30px;color:#e7e0d2;
         letter-spacing:-.02em;line-height:1.05}
      h1 em{font-style:normal;color:#7acd8e}
      p{font-size:14.5px;line-height:1.45;color:#9c968c;max-width:340px}
    </style>
    <img src="data:image/png;base64,${logo}" alt="" />
    <h1>Clip the web<br />into <em>one Markdown bundle</em></h1>
    <p>Articles, YouTube transcripts, Reddit and HN threads, straight into fileconcat.com.</p>`);
  await tile.evaluate(() => document.fonts.ready);
  await sleep(1200);
  await tile.screenshot({ path: `${ASSETS}/promo-tile-440x280.png` });
  console.log("promo-tile-440x280");
} finally {
  await context.close();
}

// The store's 128x128 upload is the same image the package ships.
writeFileSync(
  `${ASSETS}/store-icon-128.png`,
  readFileSync(resolve(HERE, "../public/icon/128.png")),
);
console.log("store-icon-128");
