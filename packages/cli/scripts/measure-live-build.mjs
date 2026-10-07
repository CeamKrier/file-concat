/**
 * Drop a corpus into a running build of the web app, the way a visitor would,
 * and keep what the downloaded Plain bundle says about each file. Writes
 * extract-candidate's results shape, so the existing scorers read it:
 * score-against-reference.py, score-video.py, AEB's evaluate.py (after
 * reshaping) and, with --olmocr, olmOCR-bench's own scorer.
 *
 * Files are dropped in batches that never mix directories. A file that comes
 * back without text from a batch is dropped again alone: the app auto-reads at
 * most 3 scanned documents per drop, and an archive's members are bundled under
 * a folder named after it, which a batch cannot tell apart from its neighbours'.
 * Alone, every part bundled is the archive's: { members: [{ path, text }] }.
 *
 * --transcribe drops each recording alone beside a small text file (the offer
 * row shows only beside something read), clicks "Transcribe them", and writes
 * <out>-speech.json and <out>-frames.json for score-video.py. The browser's
 * language is taken from a "-xx." name suffix (build-video-corpus.py's naming),
 * English otherwise: it is what picks the speech and OCR models.
 *
 * Usage (build with `pnpm build`, serve with `pnpm vite preview --port 4719`
 * from apps/web):
 *   node packages/cli/scripts/measure-live-build.mjs <base url> <corpus dir> <out.json>
 *     [--batch 20] [--ext doc,xls] [--only sub/dir] [--olmocr <candidate dir>] [--transcribe]
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args.splice(args.indexOf(name), 2)[1] : null);
const transcribing = args.includes("--transcribe") && args.splice(args.indexOf("--transcribe"), 1);
const BATCH = Number(flag("--batch") ?? 20);
const exts = flag("--ext")?.split(",");
const only = flag("--only");
const olmocr = flag("--olmocr");
const [BASE, ROOT, OUT] = args;

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.join(here, "..", "..", "..", "apps", "web", "package.json"))("playwright-core");
const cache = path.join(os.homedir(), ".cache", "ms-playwright");
const exe = fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().at(-1);
const browser = await chromium.launch({ executablePath: path.join(cache, exe, "chrome-linux64", "chrome"), args: ["--no-sandbox"] });
const contexts = new Map();
async function contextFor(locale) {
  if (!contexts.has(locale)) {
    const context = await browser.newContext({ acceptDownloads: true, locale });
    await context.route("**clarity.ms**", (r) => r.abort());
    contexts.set(locale, context);
  }
  return contexts.get(locale);
}

const SEP = "=".repeat(72);
function splitPlain(text) {
  const out = {};
  const marks = [...text.matchAll(new RegExp(`^${SEP}\\nFILE: (.+)\\n${SEP}\\n`, "gm"))];
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    out[m[1]] = text.slice(m.index + m[0].length, end).trim();
  });
  return out;
}
const hasText = (s) => (s ?? "").split("\n").some((l) => /[\p{L}\p{N}]/u.test(l) && !/^# Page \d+$/.test(l.trim()));

/** One drop. `offer` clicks through "Transcribe them" before downloading. */
async function drop(paths, { locale = "en-US", offer = false } = {}) {
  const page = await (await contextFor(locale)).newPage();
  const started = Date.now();
  try {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.locator('input[aria-label="Browse files"]').setInputFiles(paths);
    const download = page.getByRole("button", { name: "Download", exact: true });
    // A drop with nothing readable ends on the empty screen, which has no Download.
    await download.or(page.getByRole("button", { name: "Start over" })).first().waitFor({ timeout: 600_000 });
    if (!(await download.isVisible())) return { parts: {}, ms: Date.now() - started, error: "empty screen" };
    await page.getByText("Reading scanned pages").waitFor({ state: "hidden", timeout: 1_800_000 });
    if (offer) {
      await page.getByRole("button", { name: "What happened to your files" }).click();
      await page.getByRole("button", { name: "Transcribe them" }).click();
      const go = page.getByRole("button", { name: /^Read \d+ files?$/ });
      if (!(await go.isVisible().catch(() => false))) await page.getByRole("button", { name: "Select all" }).click();
      await go.click();
      await page.getByRole("button", { name: "Done" }).waitFor({ timeout: 1_800_000 });
      await page.getByRole("button", { name: "Done" }).click();
    }
    await page.getByRole("radio", { name: "Plain" }).or(page.getByRole("button", { name: "Plain", exact: true })).first().click();
    const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
    return { parts: splitPlain(fs.readFileSync(await file.path(), "utf8")), ms: Date.now() - started };
  } catch (e) {
    return { parts: {}, ms: Date.now() - started, error: String(e).split("\n")[0].slice(0, 200) };
  } finally {
    await page.close();
  }
}

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(only ? path.join(ROOT, only) : ROOT)
  .map((f) => path.relative(ROOT, f))
  .filter((f) => !exts || exts.includes(path.extname(f).slice(1).toLowerCase()))
  .sort();

if (transcribing) {
  const companion = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fc-live-")), "companion.txt");
  fs.writeFileSync(companion, "A text file, so the recording's offer row shows.\n");
  const toSeconds = (t) => t.split(":").reduce((a, b) => a * 60 + Number(b), 0);
  const speech = [];
  const frames = [];
  for (const f of files) {
    const lang = path.basename(f).match(/-([a-z]{2})\.\w+$/)?.[1] ?? "en";
    const r = await drop([path.join(ROOT, f), companion], { locale: lang === "en" ? "en-US" : lang, offer: true });
    const body = r.parts[path.basename(f)] ?? "";
    // Speech lines read "[m:ss] text"; on-screen text follows a "[frame m:ss]" line.
    const said = [];
    const seen = [];
    let current = null;
    for (const line of body.split("\n")) {
      const s = line.match(/^\[(\d+(?::\d\d)+)\] (.*)$/);
      const fr = line.match(/^\[frame (\d+(?::\d\d)+)\]$/);
      if (s) (current = said).push(s[2]);
      else if (fr) (current = seen).push(`[frame ${toSeconds(fr[1])}s]`);
      else if (current) current.push(line);
    }
    const error = r.error ?? (body ? null : "absent");
    speech.push({ fixture: f, text: said.join(" "), error, ms: r.ms });
    frames.push({ fixture: f, text: seen.join("\n"), error, ms: r.ms });
    console.log(f, `${(r.ms / 1000).toFixed(0)}s`, said.length ? "speech" : "-", seen.length ? "frames" : "-", error ?? "");
  }
  const stem = OUT.replace(/\.json$/, "");
  fs.writeFileSync(`${stem}-speech.json`, JSON.stringify({ reader: "fileconcat-live-speech", results: speech }, null, 1));
  fs.writeFileSync(`${stem}-frames.json`, JSON.stringify({ reader: "fileconcat-live-frames", results: frames }, null, 1));
} else {
  const results = [];
  const record = (f, r, batch) => {
    const text = r.parts[path.basename(f)];
    const members = batch === 1 && text === undefined ? Object.entries(r.parts) : [];
    // Members carry their own text; repeating it in `text` overflows JSON.stringify on large archives.
    return {
      fixture: f,
      text: text ?? "",
      members: members.length ? members.map(([k, v]) => ({ path: k, text: v })) : undefined,
      error: r.error ?? (text === undefined && !members.length ? "absent" : null),
      ms: r.ms,
      batch,
    };
  };
  for (const list of Object.values(Object.groupBy(files, (f) => path.dirname(f)))) {
    for (let i = 0; i < list.length; i += BATCH) {
      const batch = list.slice(i, i + BATCH);
      const r = await drop(batch.map((f) => path.join(ROOT, f)));
      for (const f of batch) {
        let row = record(f, r, batch.length);
        if (batch.length > 1 && !hasText(row.text) && !row.members) row = record(f, await drop([path.join(ROOT, f)]), 1);
        results.push(row);
      }
      console.log(path.dirname(batch[0]), i + batch.length, "/", list.length, `${(r.ms / 1000).toFixed(0)}s`, r.error ?? "");
    }
  }
  fs.writeFileSync(OUT, JSON.stringify({ reader: "fileconcat-live", corpus: ROOT, results }, null, 1));
  // olmOCR-bench reads one Markdown file per PDF: <category>/<name>_pg1_repeat1.md.
  if (olmocr) {
    for (const r of results) {
      const dest = path.join(olmocr, r.fixture.replace(/\.pdf$/, "_pg1_repeat1.md"));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, r.text);
    }
  }
}
await browser.close();
