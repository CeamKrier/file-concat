// Records the VD1 demo loops (spec 2026-11-07, section 6) into
// `apps/web/public/demo/<cut>.mp4` and `<cut>.webp`.
//
//   pnpm build && pnpm --filter @fileconcat/web start -- --port 8799   # the real app
//   node apps/web/scripts/demo-clips.mjs app claude        # steps 1-2, local Chromium
//   node apps/web/scripts/demo-clips.mjs app chatgpt
//   node apps/web/scripts/demo-clips.mjs composer claude   # step 3, the owner's debug Chrome
//   node apps/web/scripts/demo-clips.mjs composer chatgpt
//   node apps/web/scripts/demo-clips.mjs encode claude     # clip, poster, review sheets
//   node apps/web/scripts/demo-clips.mjs encode chatgpt
//   node apps/web/scripts/demo-clips.mjs clean             # delete the raw takes
//
// One capture route for every step: the CDP screencast (`Page.startScreencast`).
// Step 3 has to use it, because the owner's logged-in Chrome is reached over
// connectOverCDP and its default context cannot `recordVideo` (Playwright issue
// 29065). Using it for steps 1-2 as well means one frame format, one clock and
// one encode path. The screencast holds only the tab's page pixels, so the URL
// bar, other tabs and OS notifications cannot reach a frame. It has no cursor,
// so a pointer is drawn into the page, as in apps/extension/store/generate-clips.mjs.
//
// STEP 3 SHOWS ONLY THE COMPOSER (AC8, AC12). The recorder opens its own tab,
// waits for the temporary-chat URL, then hides everything in that tab except the
// composer box (`visibility`, set through the CSSOM so a strict CSP allows it),
// hides any model or plan label inside the box, and only then starts the
// screencast. The crop is the composer's own box, padded onto a plain canvas.
// A greeting with the account name, the sidebar, a toast or a popover therefore
// cannot be in a frame, however the vendor page lays itself out. The owner still
// reviews every distinct frame (`encode` writes the sheets) before a commit.
//
// The sample folder is generated here (AC7): no file from a real project. Its
// name is neutral because the bundle's file name, shown on the chip, comes
// from it. Raw takes live outside the repository (`DEMO_RAW`, default the OS
// temp dir) and `clean` removes them after the encode.
//
// ponytail: the loop closes with a hard cut from the last frame to the first,
// no crossfade. Add generate-clips.mjs's `xfade` if the seam reads as a jump.

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, "..");
/** Raw takes, the sample folder and the review sheets: outside the repository on purpose. */
const RAW = process.env.DEMO_RAW ?? join(tmpdir(), "fileconcat-demo-raw");
const OUT = join(WEB, "public/demo");
const PROBES = resolve(WEB, "../../packages/cli/scripts/coverage/probes");

const BASE = process.env.DEMO_BASE ?? "http://localhost:8799";
/** The page whose drop zone is filmed. Its title reads "Drop your folder here". */
const APP_PAGE = "/how-to/upload-folder-to-chatgpt";
const CDP = process.env.DEMO_CDP ?? "http://localhost:9222";

const FOLDER = "sample-project";
const BUNDLE = `${FOLDER}_fileconcat.txt`;
const VIEW = { width: 1280, height: 800 };
const DSF = 2;
/** The finished clip: 1280x800 (16:10, the box's aspect ratio), a band for the stepper at the bottom. */
const FRAME = { width: 1280, height: 800, band: 112, pad: 28 };
const BG = "#16130f";

/** Per cut: the temporary-chat URL, the check that the tab really reached it,
 *  the editor inside the composer, and the step-3 words. The step labels use
 *  the caption's words (spec section 4). */
const CUTS = {
  claude: {
    url: "https://claude.ai/new?incognito",
    reached: (url) => url.includes("claude.ai/new") && url.includes("incognito"),
    editor: 'div[contenteditable="true"]',
    vendor: "Claude",
    note: "1 file, one of the 20",
    // No model: the app's default (the newest Sonnet) already names Claude.
  },
  chatgpt: {
    url: "https://chatgpt.com/?temporary-chat=true",
    reached: (url) => url.includes("temporary-chat=true"),
    // `#prompt-textarea` until late 2026; the editor now has no id.
    editor: 'form [contenteditable="true"]',
    vendor: "ChatGPT",
    note: "counts as one file",
    // Step 2 measures against a GPT model, picked off camera: the default
    // Sonnet would put "of Claude Sonnet context" on a ChatGPT page (Q184 O2).
    model: "GPT-6.1 Terra",
  },
};
const steps = (vendor) => [
  "A folder of 40 files dropped in",
  "Format set to Plain, the .txt downloaded",
  `Attached in ${vendor} as one file`,
];
/** A label inside the composer that names a model or a plan never reaches a frame (AC8). */
const MODEL_LABEL = /\b(opus|sonnet|haiku|claude|gpt|o\d|thinking|extended|plus|pro|max|team|free|plan|model)\b/i;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const ffmpeg = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

async function until(what, check, ms = 30_000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await sleep(250);
  }
  throw new Error(`gave up waiting for ${what}${last ? `: ${last.message}` : ""}`);
}

function chromiumPath() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  const base = join(homedir(), ".cache", "ms-playwright");
  const dirs = readdirSync(base)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const d of dirs) {
    const bin = join(base, d, "chrome-linux64", "chrome");
    if (existsSync(bin)) return bin;
  }
  throw new Error(`no chromium under ${base}; set PLAYWRIGHT_CHROMIUM`);
}

// ---------------------------------------------------------------- the folder

const TOPICS = [
  "accounts", "addresses", "audit-log", "billing", "calendar", "customers", "discounts", "exports",
  "imports", "invoices", "ledger", "locales", "messages", "notifications", "orders", "payments",
  "permissions", "receipts", "refunds", "reports", "schedule", "settings", "shipping", "taxes",
];
const pascal = (name) => name.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());

/** 40 files: 24 modules, 6 docs, 3 notes, 3 tables, a README, a manifest, a PDF and a .docx. */
function fixture() {
  const root = join(RAW, FOLDER);
  rmSync(root, { recursive: true, force: true });
  const put = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  for (const [i, topic] of TOPICS.entries()) {
    const type = pascal(topic);
    put(
      `src/${topic}.ts`,
      `// ${type}: an in-memory store for the sample project.\n\n` +
        `export interface ${type} {\n  id: string;\n  createdAt: Date;\n  label: string;\n  amount: number;\n}\n\n` +
        `const items = new Map<string, ${type}>();\n\n` +
        `export function add${type}(item: ${type}): void {\n  items.set(item.id, item);\n}\n\n` +
        `export function list${type}(limit = ${10 + i}): ${type}[] {\n` +
        `  return [...items.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);\n}\n\n` +
        `export function total${type}(): number {\n  let sum = 0;\n  for (const item of items.values()) sum += item.amount;\n  return sum;\n}\n`,
    );
  }
  const docs = {
    overview: "What the sample project does and how its modules fit together.",
    setup: "Install the dependencies, copy the example settings and start the server.",
    api: "Every module exports add, list and total functions over an in-memory map.",
    faq: "Answers to the questions new contributors ask in their first week.",
    changelog: "Version 0.3 added refunds and receipts. Version 0.2 added taxes.",
    glossary: "Ledger: the record of every amount. Receipt: what a customer keeps.",
  };
  for (const [name, line] of Object.entries(docs)) put(`docs/${name}.md`, `# ${pascal(name)}\n\n${line}\n`);
  for (const n of [1, 2, 3])
    put(`notes/standup-0${n}.txt`, `Standup ${n}\n- Finished: module ${TOPICS[n]}\n- Next: module ${TOPICS[n + 3]}\n- Blocked: nothing\n`);
  put("data/regions.csv", "code,name\neu,Europe\nus,United States\napac,Asia Pacific\n");
  put("data/plans.csv", "plan,seats,price\nstarter,3,0\nteam,10,49\nbusiness,50,199\n");
  put("data/usage.csv", "month,orders,refunds\n2026-08,412,9\n2026-09,455,7\n2026-10,498,11\n");
  put("README.md", "# Sample project\n\nA small invented codebase used to show FileConcat at work.\n");
  put("package.json", `${JSON.stringify({ name: FOLDER, version: "0.3.0", private: true, type: "module" }, null, 2)}\n`);
  // Our own synthetic probe documents, one construct each, already public in this repository.
  copyFileSync(join(PROBES, "pdf/pdf-main.pdf"), join(root, "docs/spec.pdf"));
  copyFileSync(join(PROBES, "docx/probe-docx.docx"), join(root, "notes/kickoff.docx"));
  const count = (dir) =>
    readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(join(dir, e.name)) : 1), 0);
  if (count(root) !== 40) throw new Error(`fixture holds ${count(root)} files, not 40`);
  return root;
}

// ---------------------------------------------------------------- in the page

/** Pointer and drag ghost, drawn into the page. Stepped from Node, one
 *  evaluate per frame, so the motion recorded is the motion written. */
function cursor(page) {
  let at = { x: VIEW.width - 120, y: VIEW.height - 60 };
  const paint = (x, y, scale, ghost) =>
    page.evaluate(
      ([px, py, s, g]) => {
        let dot = document.getElementById("fc-demo-dot");
        if (!dot) {
          dot = document.createElement("div");
          dot.id = "fc-demo-dot";
          dot.style.cssText =
            "position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;" +
            "background:rgba(241,235,224,.28);border:1.5px solid rgba(241,235,224,.95);" +
            "box-shadow:0 0 0 1px rgba(0,0,0,.55),0 2px 12px rgba(0,0,0,.45);pointer-events:none;" +
            "z-index:2147483647;visibility:visible";
          document.documentElement.append(dot);
        }
        dot.style.transform = `translate(${px}px, ${py}px) scale(${s})`;
        let pill = document.getElementById("fc-demo-ghost");
        if (g && !pill) {
          pill = document.createElement("div");
          pill.id = "fc-demo-ghost";
          pill.style.cssText =
            "position:fixed;left:0;top:0;padding:8px 12px;border-radius:8px;background:#221d16;" +
            "border:1px solid #342d22;color:#f1ebe0;font:500 14px/1.2 system-ui,sans-serif;white-space:nowrap;" +
            "box-shadow:0 8px 24px rgba(0,0,0,.45);pointer-events:none;z-index:2147483646;visibility:visible;opacity:.96";
          pill.textContent = g;
          document.documentElement.append(pill);
        }
        if (pill) {
          // Centred under the pointer, so a tight crop never cuts it off at one side.
          if (g) pill.style.transform = `translate(${px}px, ${py + 18}px) translateX(-50%)`;
          else pill.remove();
        }
      },
      [x, y, scale, ghost],
    );
  return {
    async show(ghost = null) {
      await paint(at.x, at.y, 1, ghost);
    },
    async moveTo(to, ms = 900, ghost = null) {
      const n = Math.max(2, Math.round(ms / 40));
      const from = at;
      for (let i = 1; i <= n; i++) {
        const e = 1 - (1 - i / n) ** 3;
        await paint(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e, 1, ghost);
        await sleep(40);
      }
      at = to;
    },
    async press(ghost = null) {
      await paint(at.x, at.y, 0.62, ghost);
      await sleep(110);
      await paint(at.x, at.y, 1, null);
    },
  };
}

const centerOf = (page, selector) =>
  page.evaluate((s) => {
    const b = document.querySelector(s).getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, selector);

/** Frames arrive only when the page changes; each is acked, stamped with
 *  Node's clock on arrival, and written as it comes. */
async function screencast(cdp, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const frames = [];
  cdp.on("Page.screencastFrame", ({ data, sessionId }) => {
    const file = join(dir, `f${String(frames.length).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ t: Date.now(), file });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 92,
    maxWidth: VIEW.width * DSF,
    maxHeight: VIEW.height * DSF,
  });
  return {
    frames,
    async stop() {
      await cdp.send("Page.stopScreencast");
      return frames;
    },
  };
}

// ---------------------------------------------------------------- steps 1-2

async function recordApp(name) {
  const cut = CUTS[name];
  if (!cut) throw new Error(`cut is claude or chatgpt, not ${name}`);
  const folder = fixture();
  const browser = await chromium.launch({ executablePath: chromiumPath(), args: ["--no-sandbox"] });
  try {
    const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DSF, acceptDownloads: true });
    const page = await context.newPage();
    await page.goto(BASE + APP_PAGE, { waitUntil: "networkidle" });
    const zone = 'input[aria-label="Browse folder"]';
    await page.waitForSelector(zone, { state: "attached" });
    // The drop zone root carries the drag handlers; mark it so the crop and the events find it.
    await page.evaluate((s) => document.querySelector(s).closest(".border-dashed").setAttribute("data-fc-demo", "zone"), zone);
    const zoneBox = await rectOf(page, '[data-fc-demo="zone"]');

    const cdp = await context.newCDPSession(page);
    const cast = await screencast(cdp, join(RAW, `app-${name}/frames`));
    const hand = cursor(page);
    const marks = [];
    await hand.show();
    await sleep(600);
    const start1 = Date.now();

    // Step 1: the folder is carried onto the zone, which lights up, then let go.
    // The files go in through the folder input: a synthetic drop cannot carry a
    // directory, and the picker reads the same tree the drop walk does.
    const ghost = `${FOLDER}/  (40 files)`;
    await hand.moveTo({ x: zoneBox.x + zoneBox.w * 0.62, y: zoneBox.y + zoneBox.h * 0.8 }, 300, ghost);
    const target = await centerOf(page, '[data-fc-demo="zone"]');
    const drag = (type) =>
      page.evaluate((t) => {
        document.querySelector('[data-fc-demo="zone"]').dispatchEvent(
          new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }),
        );
      }, type);
    await hand.moveTo({ x: target.x * 0.6 + zoneBox.x * 0.4, y: target.y }, 500, ghost);
    await drag("dragenter");
    await hand.moveTo(target, 600, ghost);
    await sleep(500);
    await drag("dragleave");
    await hand.press(null);
    await page.setInputFiles(zone, folder);
    await sleep(900);
    marks.push({ step: 1, from: start1, to: Date.now(), box: zoneBox });

    // Step 2: the result card. Plain, then Download.
    await until("the result card", () =>
      page.evaluate(() => {
        const button = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Download");
        const box = button?.closest(".rounded-card");
        if (!box || !/files combined/.test(box.textContent)) return null;
        box.setAttribute("data-fc-demo", "card");
        box.scrollIntoView({ block: "center" });
        return true;
      }),
      90_000,
    );
    if (cut.model) {
      // Off camera: these frames fall between the step 1 and step 2 marks, which
      // the encode drops. The last frame before step 2 is the settled card.
      await page.click('[data-fc-demo="card"] button[title^="Change model"]');
      await page.click('[role="dialog"] [role="combobox"]');
      await page.fill('input[placeholder="Search models..."]', cut.model);
      await page.locator('[role="dialog"] div.cursor-pointer', { hasText: cut.model }).first().click();
      // The first Escape can land on the closing popover; press until the drawer is gone too.
      await until("the drawer to close", async () => {
        if ((await page.locator('[role="dialog"]').count()) === 0) return true;
        await page.keyboard.press("Escape");
        await sleep(400);
        return null;
      }, 10_000);
      const named = await page.evaluate(() => document.querySelector('[data-fc-demo="card"]').textContent);
      if (!named.includes(cut.model)) throw new Error(`the card does not name ${cut.model}`);
    }
    await sleep(1200);
    const combined = await page.evaluate(() => document.querySelector('[data-fc-demo="card"]').textContent);
    if (!/(?<!\d)40\s*files combined/.test(combined)) throw new Error(`the card does not say 40 files combined: ${combined.slice(0, 200)}`);
    const cardBox = await rectOf(page, '[data-fc-demo="card"]');
    const start2 = Date.now();
    await sleep(700);
    const plain = await page.evaluate(() => {
      const group = document.querySelector('[aria-label="Output format"]');
      const option = [...group.querySelectorAll("button, [role=radio]")].find((b) => b.textContent.trim() === "Plain");
      option.setAttribute("data-fc-demo", "plain");
      return true;
    });
    if (!plain) throw new Error("no Plain option");
    await hand.moveTo(await centerOf(page, '[data-fc-demo="plain"]'), 800);
    await hand.press();
    await page.click('[data-fc-demo="plain"]');
    await sleep(900);
    await page.evaluate(() =>
      [...document.querySelectorAll('[data-fc-demo="card"] button')]
        .find((b) => b.textContent.trim() === "Download")
        .setAttribute("data-fc-demo", "download"),
    );
    await hand.moveTo(await centerOf(page, '[data-fc-demo="download"]'), 800);
    const download = page.waitForEvent("download");
    await hand.press();
    await page.click('[data-fc-demo="download"]');
    const file = await download;
    if (file.suggestedFilename() !== BUNDLE) throw new Error(`download is ${file.suggestedFilename()}, not ${BUNDLE}`);
    await file.saveAs(join(RAW, BUNDLE));
    await sleep(1400);
    marks.push({ step: 2, from: start2, to: Date.now(), box: cardBox });

    const frames = await cast.stop();
    writeFileSync(join(RAW, `app-${name}/take.json`), JSON.stringify({ frames, marks }, null, 2));
    console.log(`app ${name}: ${frames.length} frames, bundle ${statSync(join(RAW, BUNDLE)).size} bytes`);
  } finally {
    await browser.close();
  }
}

const rectOf = (page, selector) =>
  page.evaluate((s) => {
    const b = document.querySelector(s).getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height };
  }, selector);

// ---------------------------------------------------------------- step 3

async function recordComposer(name) {
  const cut = { ...CUTS[name] };
  if (!CUTS[name]) throw new Error(`cut is claude or chatgpt, not ${name}`);
  // Rehearsal only: a local mock composer in place of the vendor page.
  if (process.env.DEMO_COMPOSER_URL) {
    cut.url = process.env.DEMO_COMPOSER_URL;
    cut.reached = (url) => url.startsWith(cut.url);
  }
  const bundle = readFileSync(join(RAW, BUNDLE));
  const browser = await chromium.connectOverCDP(CDP);
  const context = browser.contexts()[0];
  // Our own tab (Target.createTarget), never one the owner has open (AC12).
  const page = await context.newPage();
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setDeviceMetricsOverride", { ...VIEW, deviceScaleFactor: DSF, mobile: false });
    // The pages are in English, so the vendor UI is asked for in English, in
    // this tab only. An account-level language setting can still win; the
    // review sheets show which did.
    const userAgent = await page.evaluate(() => navigator.userAgent);
    await cdp.send("Network.enable");
    await cdp.send("Network.setUserAgentOverride", { userAgent, acceptLanguage: "en-US,en" });
    await cdp.send("Emulation.setLocaleOverride", { locale: "en-US" });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(cut.url, { waitUntil: "domcontentloaded" });
    await until("the temporary-chat URL", () => cut.reached(page.url()), 20_000).catch(() => {
      throw new Error(`the tab is at ${page.url()}, not a temporary chat; nothing was recorded`);
    });
    await page.waitForSelector(cut.editor, { state: "visible", timeout: 30_000 });
    await sleep(1500);

    // Everything but the composer is hidden before the first frame.
    const hidden = await page.evaluate(
      ([editor, label]) => {
        const box = document.querySelector(editor).closest("form, fieldset");
        if (!box) return null;
        box.setAttribute("data-fc-demo", "composer");
        document.body.style.setProperty("visibility", "hidden", "important");
        box.style.setProperty("visibility", "visible", "important");
        const pattern = new RegExp(label, "i");
        const named = [...box.querySelectorAll("button, [role=button], [aria-haspopup]")].filter((el) =>
          pattern.test(`${el.textContent} ${el.getAttribute("aria-label") ?? ""}`),
        );
        for (const el of named) el.style.setProperty("visibility", "hidden", "important");
        return named.map((el) => (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40));
      },
      [cut.editor, MODEL_LABEL.source],
    );
    if (!hidden) throw new Error("no form or fieldset around the editor; nothing was recorded");
    console.log(`composer: hid ${hidden.length} labelled control(s): ${JSON.stringify(hidden)}`);
    const before = await rectOf(page, '[data-fc-demo="composer"]');

    const cast = await screencast(cdp, join(RAW, `${name}/frames`));
    const hand = cursor(page);
    await hand.show(BUNDLE);
    await hand.moveTo({ x: before.x + before.w * 0.72, y: before.y + before.h * 0.5 }, 200, BUNDLE);
    await sleep(500);
    const start = Date.now();
    await hand.moveTo({ x: before.x + before.w * 0.45, y: before.y + before.h * 0.3 }, 1100, BUNDLE);
    await hand.press(null);
    const input = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input[type="file"]')];
      const pick = inputs.find((i) => !i.accept || !/^image\/\*?$/.test(i.accept.trim())) ?? inputs[0];
      pick?.setAttribute("data-fc-demo", "input");
      return Boolean(pick);
    });
    if (!input) throw new Error("no file input on the page");
    await page.setInputFiles('[data-fc-demo="input"]', { name: BUNDLE, mimeType: "text/plain", buffer: bundle });
    const chipAt = await until("the attachment chip inside the composer", () =>
      page.evaluate((file) => {
        const box = document.querySelector('[data-fc-demo="composer"]');
        const hit = [...box.querySelectorAll("*")].some(
          (el) => el.children.length === 0 && el.textContent.includes(file.slice(0, 12)),
        );
        return hit ? Date.now() : null;
      }, BUNDLE),
    );
    // Held until the upload is done (the send button wakes up), so the clip
    // ends on a settled chip rather than a spinner. Never pressed.
    await until(
      "the upload to finish",
      () =>
        page.evaluate(() =>
          [...document.querySelectorAll('[data-fc-demo="composer"] button')].some(
            (b) => /send/i.test(`${b.getAttribute("aria-label") ?? ""} ${b.dataset.testid ?? ""}`) && !b.disabled,
          ),
        ),
      20_000,
    ).catch(() => console.log("composer: no enabled send button seen; holding anyway"));
    await sleep(1800);
    const after =await rectOf(page, '[data-fc-demo="composer"]');
    const frames = await cast.stop();
    const box = union(before, after);
    writeFileSync(
      join(RAW, `${name}/take.json`),
      JSON.stringify({ frames, marks: [{ step: 3, from: start, to: Date.now(), box, noteAt: chipAt }] }, null, 2),
    );
    console.log(`${name}: ${frames.length} frames, composer ${Math.round(box.w)}x${Math.round(box.h)}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    // Only our tab closes. The temporary chat goes with it; nothing was sent.
    await page.close().catch(() => {});
    process.exit(process.exitCode ?? 0);
  }
}

function union(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

// ---------------------------------------------------------------- encode

/** The stepper band and the step-3 note, set in the site's own type and rendered to PNG. */
async function renderOverlays(name, dir) {
  const browser = await chromium.launch({ executablePath: chromiumPath(), args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: FRAME.width, height: FRAME.band } });
  const fonts =
    '<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@500;600&family=JetBrains+Mono:wght@500&display=block" rel="stylesheet">';
  const labels = steps(CUTS[name].vendor);
  const shot = async (html, size, file) => {
    await page.setViewportSize(size);
    await page.setContent(`${fonts}<body style="margin:0;background:transparent">${html}</body>`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(dir, file), omitBackground: true });
  };
  for (const [i, label] of labels.entries()) {
    const dots = labels
      .map(
        (_, j) =>
          `<span style="display:inline-flex;width:40px;height:40px;border-radius:50%;align-items:center;justify-content:center;` +
          `font:500 20px 'JetBrains Mono',monospace;margin-right:10px;` +
          (j === i ? "background:#7acd8e;color:#11261a" : j < i ? "background:#221d16;color:#9fdcb0" : "background:#221d16;color:#6f675a") +
          `">${j + 1}</span>`,
      )
      .join("");
    await shot(
      `<div style="height:${FRAME.band}px;box-sizing:border-box;border-top:1px solid #2c261d;background:#120f0a;display:flex;align-items:center;padding:0 40px">` +
        `${dots}<span style="margin-left:18px;font:600 34px 'Hanken Grotesk',sans-serif;color:#f1ebe0;letter-spacing:-0.01em">${label}</span></div>`,
      { width: FRAME.width, height: FRAME.band },
      `band-${i + 1}.png`,
    );
  }
  // The note is shot as its own element, so the PNG is exactly the pill and centres.
  await page.setViewportSize({ width: 1000, height: 200 });
  await page.setContent(
    `${fonts}<body style="margin:0;background:transparent"><div id="note" style="display:inline-block;padding:14px 26px;` +
      `border-radius:999px;background:#11261a;border:2px solid #7acd8e;font:600 36px 'Hanken Grotesk',sans-serif;` +
      `color:#9fdcb0">${CUTS[name].note}</div></body>`,
    { waitUntil: "networkidle" },
  );
  await page.evaluate(() => document.fonts.ready);
  await page.locator("#note").screenshot({ path: join(dir, "note.png"), omitBackground: true });
  const noteHeight = Math.ceil((await page.locator("#note").boundingBox()).height);
  await browser.close();
  return noteHeight;
}

/** One step as its own short mp4: the frames in [from, to], cropped to the
 *  element, fitted onto the canvas above the band, the note faded in at noteAt. */
function encodeStep(take, mark, dir, noteHeight) {
  const { frames } = take;
  const inRange = frames.filter((f) => f.t >= mark.from && f.t < mark.to);
  const before = frames.filter((f) => f.t < mark.from).at(-1);
  const list = before ? [{ ...before, t: mark.from }, ...inRange] : inRange;
  if (!list.length) throw new Error(`step ${mark.step}: no frames`);
  const lines = list.flatMap((f, i) => [`file '${f.file}'`, `duration ${(((list[i + 1]?.t ?? mark.to) - f.t) / 1000).toFixed(3)}`]);
  lines.push(`file '${list.at(-1).file}'`);
  writeFileSync(join(dir, `step${mark.step}.txt`), `${lines.join("\n")}\n`);

  const width = Number(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v", "-show_entries", "stream=width", "-of", "csv=p=0", list[0].file]).toString());
  const s = width / VIEW.width;
  const p = 16;
  const crop = {
    x: Math.max(0, Math.floor((mark.box.x - p) * s)),
    y: Math.max(0, Math.floor((mark.box.y - p) * s)),
  };
  crop.w = Math.min(width - crop.x, Math.ceil((mark.box.w + 2 * p) * s)) & ~1;
  crop.h = Math.min(Math.round(VIEW.height * s) - crop.y, Math.ceil((mark.box.h + 2 * p) * s)) & ~1;
  // The note gets its own row above the content, so it never sits on the composer.
  const reserve = mark.noteAt ? noteHeight + 20 : 0;
  const area = { w: FRAME.width - 2 * FRAME.pad, h: FRAME.height - FRAME.band - 2 * FRAME.pad - reserve };
  const k = Math.min(area.w / crop.w, area.h / crop.h);
  const fit = { w: Math.round((crop.w * k) / 2) * 2, h: Math.round((crop.h * k) / 2) * 2 };
  const top = FRAME.pad + reserve + Math.round((area.h - fit.h) / 2);
  const graph = [
    `[0:v]fps=25,crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale=${fit.w}:${fit.h}:flags=lanczos,` +
      `pad=${FRAME.width}:${FRAME.height}:(ow-iw)/2:${top}:color=${BG}[c]`,
    `[c][1:v]overlay=0:${FRAME.height - FRAME.band}[b]`,
  ];
  const inputs = ["-f", "concat", "-safe", "0", "-i", join(dir, `step${mark.step}.txt`), "-i", join(dir, `band-${mark.step}.png`)];
  if (mark.noteAt) {
    const at = Math.max(0, (mark.noteAt - mark.from) / 1000 + 0.3);
    inputs.push("-loop", "1", "-i", join(dir, "note.png"));
    graph.push(
      `[2:v]format=rgba,fade=t=in:st=${at.toFixed(2)}:d=0.3:alpha=1[n]`,
      `[b][n]overlay=(W-w)/2:${top - noteHeight - 20}:shortest=1[v]`,
    );
  } else graph.push("[b]null[v]");
  const out = join(dir, `step${mark.step}.mp4`);
  ffmpeg([...inputs, "-filter_complex", graph.join(";"), "-map", "[v]", "-an", "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", "-r", "25", out]);
  return out;
}

async function encode(name) {
  if (!CUTS[name]) throw new Error(`cut is claude or chatgpt, not ${name}`);
  const dir = join(RAW, `${name}/encode`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const noteHeight = await renderOverlays(name, dir);
  const app = JSON.parse(readFileSync(join(RAW, `app-${name}/take.json`), "utf8"));
  const composer = JSON.parse(readFileSync(join(RAW, `${name}/take.json`), "utf8"));
  const parts = [...app.marks.map((m) => encodeStep(app, m, dir)), encodeStep(composer, composer.marks[0], dir, noteHeight)];
  writeFileSync(join(dir, "parts.txt"), parts.map((p) => `file '${p}'`).join("\n"));

  mkdirSync(OUT, { recursive: true });
  const mp4 = join(OUT, `${name}.mp4`);
  const webp = join(OUT, `${name}.webp`);
  // AC9: no metadata, and the bitexact flags keep the muxer's own encoder tag out too.
  ffmpeg([
    "-f", "concat", "-safe", "0", "-i", join(dir, "parts.txt"), "-an",
    "-c:v", "libx264", "-crf", "26", "-preset", "slow", "-tune", "animation", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:v", "+bitexact", mp4,
  ]);
  // The poster is frame 0, so the box does not jump when the loop starts.
  ffmpeg(["-i", mp4, "-frames:v", "1", "-c:v", "libwebp", "-quality", "80", "-map_metadata", "-1", webp]);

  // Every distinct frame, nine to a sheet, for the owner's review (AC8).
  const review = join(RAW, "review", name);
  rmSync(review, { recursive: true, force: true });
  mkdirSync(review, { recursive: true });
  ffmpeg(["-i", mp4, "-vf", "mpdecimate,scale=640:-2,tile=3x3:padding=6:color=white", "-fps_mode", "vfr", join(review, "sheet-%02d.png")]);
  const seconds = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4]).toString());
  const tags = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format_tags:stream_tags", "-of", "json", mp4]).toString();
  console.log(
    `${name}: ${seconds.toFixed(1)} s, mp4 ${(statSync(mp4).size / 1024).toFixed(0)} KiB (budget 1536), ` +
      `poster ${(statSync(webp).size / 1024).toFixed(0)} KiB (budget 60), sheets in ${review}`,
  );
  console.log(`tags: ${tags.replace(/\s+/g, " ")}`);
}

// ---------------------------------------------------------------- main

const [mode, arg] = process.argv.slice(2);
if (mode === "app") await recordApp(arg);
else if (mode === "composer") await recordComposer(arg);
else if (mode === "encode") await encode(arg);
else if (mode === "clean") {
  rmSync(RAW, { recursive: true, force: true });
  console.log(`removed ${RAW}`);
} else {
  console.error("usage: demo-clips.mjs app <claude|chatgpt> | composer <claude|chatgpt> | encode <claude|chatgpt> | clean");
  process.exit(1);
}
