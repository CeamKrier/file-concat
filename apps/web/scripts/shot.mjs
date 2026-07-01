// Lightweight screenshot helper for the local dev feedback loop.
//
// Drives the chromium already cached under ~/.cache/ms-playwright via
// playwright-core (no browser download). Saves a PNG you can open/Read.
//
// Usage:
//   node scripts/shot.mjs --url http://localhost:5173/ --out /tmp/fc-shots/home.png
//   node scripts/shot.mjs --url http://localhost:5173/app --full
//   node scripts/shot.mjs --url http://localhost:5173/docs --selector "main" --width 1280
//
// Flags:
//   --url <url>        page to capture (required)
//   --out <path>       output PNG path (default /tmp/fc-shots/shot.png)
//   --full             full-page screenshot (default: viewport only)
//   --width <px>       viewport width (default 1280)
//   --height <px>      viewport height (default 900)
//   --dpr <n>          device scale factor (default 2 — crisp text)
//   --wait <ms>        extra settle delay after load (default 700 — fonts/anim)
//   --selector <css>   capture a single element instead of the page
//   --exec <path>      override chromium binary path

import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = true; // boolean flag
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function findChromium(override) {
  if (override) return override;
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  const base = join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(base)) {
    throw new Error(`No playwright cache at ${base}. Pass --exec <path-to-chrome>.`);
  }
  // Prefer the highest-numbered chromium-<rev> dir (skip headless_shell).
  const dirs = readdirSync(base)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const d of dirs) {
    const bin = join(base, d, "chrome-linux64", "chrome");
    if (existsSync(bin)) return bin;
    const bin2 = join(base, d, "chrome-linux", "chrome");
    if (existsSync(bin2)) return bin2;
  }
  throw new Error(`No chromium binary found under ${base}. Pass --exec <path>.`);
}

const args = parseArgs(process.argv.slice(2));
const url = args.url;
if (!url) {
  console.error("Missing --url. Example: --url http://localhost:5173/");
  process.exit(1);
}
const out = args.out || "/tmp/fc-shots/shot.png";
const width = Number(args.width || 1280);
const height = Number(args.height || 900);
const dpr = Number(args.dpr || 2);
const settle = Number(args.wait || 700);
const executablePath = findChromium(args.exec);

mkdirSync(dirname(out), { recursive: true });

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--force-color-profile=srgb"],
});

try {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: dpr,
  });
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 }).catch(async () => {
    // networkidle can hang on long-poll/HMR sockets — fall back to domcontentloaded.
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  });

  // Optionally drive the flow: feed real files into a (possibly hidden) input.
  if (args["set-files"]) {
    const sel = args["files-selector"] || 'input[aria-label="Browse files"]';
    const paths = String(args["set-files"])
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    await page.setInputFiles(sel, paths);
  }

  // Optionally wait for a text marker or selector before capturing.
  if (args["wait-for"]) {
    await page.waitForFunction(
      (t) => document.body && document.body.innerText.includes(t),
      String(args["wait-for"]),
      { timeout: 15000 },
    );
  }
  if (args["wait-for-selector"]) {
    await page.waitForSelector(String(args["wait-for-selector"]), { timeout: 15000 });
  }

  // Optionally click an element (by visible text or CSS) before capturing.
  if (args["click-text"]) {
    await page.getByText(String(args["click-text"]), { exact: false }).first().click();
    await page.waitForTimeout(350);
  }
  if (args["click"]) {
    await page.click(String(args["click"]));
    await page.waitForTimeout(350);
  }

  // Optionally type into an input (after any panel-opening click above).
  if (args["fill"] !== undefined) {
    const sel = args["fill-selector"] || 'input[inputmode="url"]';
    await page.fill(sel, String(args["fill"] === true ? "" : args["fill"]));
    await page.waitForTimeout(250);
  }

  // Optionally press a key (e.g. Enter to submit a focused form).
  if (args["press"]) {
    await page.keyboard.press(String(args["press"]));
    await page.waitForTimeout(350);
  }

  // Let webfonts paint and any entrance state settle.
  await page.waitForTimeout(settle);

  if (args.selector) {
    const el = await page.$(args.selector);
    if (!el) throw new Error(`Selector not found: ${args.selector}`);
    await el.screenshot({ path: out });
  } else {
    await page.screenshot({ path: out, fullPage: Boolean(args.full) });
  }
  console.log(`saved ${out}  (${width}x${height}@${dpr}x${args.full ? " fullpage" : ""})`);
  console.log(`chromium: ${executablePath}`);
} finally {
  await browser.close();
}
