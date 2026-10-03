/**
 * Run a browser-only reader (a WebGPU model) over a corpus of page images, in a
 * real Chrome, and write the same results file `extract-candidate.ts` writes.
 *
 * Some candidates exist only as browser builds: transformers.js on WebGPU has
 * no Node path that matches what a visitor's tab would run. So this drives a
 * Chrome started with `--remote-debugging-port=9222`, serves the corpus from a
 * fake origin routed to the filesystem, and runs the model in that page. The
 * model files come from the Hugging Face hub and stay in the profile's cache.
 *
 * Progress is written to `<out>.partial` after every page, so a crashed or
 * stopped run resumes where it stopped; the final file is written once.
 *
 * Usage:
 *   pnpm --filter @fileconcat/cli exec tsx scripts/browser-candidate.ts <candidate> --corpus <dir> --out <file> [--limit n]
 *   pnpm --filter @fileconcat/cli exec tsx scripts/browser-candidate.ts <candidate> --retext <results> --out <file>
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
interface Route {
  request(): { url(): string };
  fulfill(response: { contentType: string; body?: string; path?: string }): Promise<void>;
}
interface Page {
  route(url: string, handler: (route: Route) => unknown): Promise<void>;
  on(event: "console", handler: (msg: { type(): string; text(): string }) => void): void;
  goto(url: string): Promise<unknown>;
  evaluate(expression: string): Promise<unknown>;
  close(): Promise<void>;
}
// playwright-core is the web app's dependency; types kept to what is used here.
const { chromium } = createRequire(path.join(REPO_ROOT, "apps", "web", "package.json"))("playwright-core") as {
  chromium: { connectOverCDP(url: string): Promise<{ contexts(): { newPage(): Promise<Page> }[] }> };
};

const ORIGIN = "https://probe.test";
const TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/+esm";

interface Candidate {
  /** Runs once in the page; leaves whatever `read` needs on `window`. */
  setup: string;
  /** Runs per image in the page; `url` is the image's URL, returns the raw output. */
  read: string;
  /** Raw model output to the text the scorer reads. */
  toText(raw: string): string;
}

/**
 * Granite-Docling answers in DocTags: one element per tag with `<loc_n>`
 * boxes. Turned into markdown the plain way: headings, list items, tables
 * from OTSL cells, formulas in `$$`. Page headers and footers are dropped,
 * because the model labels them and a router would use the label.
 *
 * The model can loop until the token cap (60 of 181 scanned pages, 2026-10-03):
 * a unit repeated 16+ times in a row is kept once, a block already emitted is
 * not emitted again, and the element the cap cut open is kept as text.
 */
export function docTagsToMarkdown(raw: string): string {
  const body = raw
    .replace(/<\|end_of_text\|>|<end_of_utterance>/g, "")
    .replace(/<\/?doctag>/g, "")
    .replace(/<loc_\d+>/g, "")
    // ponytail: also folds a genuine dot leader of 16+ dots to one; fine for reading.
    .replace(/([\s\S]{1,20}?)\1{15,}/g, "$1");
  const blocks: string[] = [];
  const seen = new Set<string>();
  const push = (block: string) => {
    if (block && !seen.has(block)) blocks.push(block);
    seen.add(block);
  };
  let end = 0;
  for (const m of body.matchAll(/<([a-z_0-9]+)>([\s\S]*?)<\/\1>/g)) {
    end = m.index + m[0].length;
    const [, tag, inner] = m;
    if (tag === "page_header" || tag === "page_footer") continue;
    if (tag === "otsl" || inner.includes("<otsl>")) {
      const caption = /<caption>([\s\S]*?)<\/caption>/.exec(inner)?.[1];
      if (caption) push(plain(caption));
      push(otsl(inner.replace(/<caption>[\s\S]*?<\/caption>/g, "").replace(/<\/?otsl>/g, "")));
      continue;
    }
    const text = plain(inner);
    if (!text) continue;
    if (tag === "title") push(`# ${text}`);
    else if (tag.startsWith("section_header")) push(`## ${text}`);
    else if (tag === "list_item") push(`- ${text}`);
    else if (tag === "formula") push(`$$\n${text}\n$$`);
    else push(text);
  }
  const cut = /^\s*<([a-z_0-9]+)>([\s\S]*)$/.exec(body.slice(end));
  if (cut && cut[1] !== "page_header" && cut[1] !== "page_footer") push(plain(cut[2]));
  return blocks.join("\n\n");
}

const plain = (s: string): string => s.replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").trim();

function otsl(inner: string): string {
  const rows = inner
    .split("<nl>")
    .map((row) =>
      row
        .split(/<(?:fcel|ecel|lcel|ucel|xcel|ched|rhed|srow)>/)
        .slice(1)
        .map((cell) => cell.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/\|/g, "\\|").trim()),
    )
    .filter((cells) => cells.length);
  if (!rows.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const line = (cells: string[]) => `| ${[...cells, ...Array(width - cells.length).fill("")].join(" | ")} |`;
  return [line(rows[0]), line(Array(width).fill("---")), ...rows.slice(1).map(line)].join("\n");
}

function granite(dtype: string): Candidate {
  return {
    setup: `
      const t = await import(${JSON.stringify(TRANSFORMERS)});
      const id = "onnx-community/granite-docling-258M-ONNX";
      window.__processor = await t.AutoProcessor.from_pretrained(id);
      window.__model = await t.AutoModelForVision2Seq.from_pretrained(id, { dtype: ${JSON.stringify(dtype)}, device: "webgpu" });
      window.__load = t.load_image;`,
    read: `
      const image = await window.__load(url);
      const messages = [{ role: "user", content: [{ type: "image" }, { type: "text", text: "Convert this page to docling." }] }];
      const prompt = window.__processor.apply_chat_template(messages, { add_generation_prompt: true });
      const inputs = await window.__processor(prompt, [image], { do_image_splitting: true });
      const ids = await window.__model.generate({ ...inputs, max_new_tokens: 4096 });
      return window.__processor.batch_decode(ids.slice(null, [inputs.input_ids.dims.at(-1), null]), { skip_special_tokens: false })[0];`,
    toText: docTagsToMarkdown,
  };
}

/**
 * Florence-2's `<OCR_WITH_REGION>` task: one label per text line, in the
 * model's order, joined by newlines. The page is resized to 768x768 and the
 * decoder stops at 1024 tokens, both the model's own ceilings.
 */
function florence(id: string): Candidate {
  return {
    setup: `
      const t = await import(${JSON.stringify(TRANSFORMERS)});
      window.__processor = await t.AutoProcessor.from_pretrained(${JSON.stringify(id)});
      window.__model = await t.Florence2ForConditionalGeneration.from_pretrained(${JSON.stringify(id)}, { dtype: "fp32", device: "webgpu" });
      window.__load = t.load_image;`,
    read: `
      const image = await window.__load(url);
      const task = "<OCR_WITH_REGION>";
      const inputs = await window.__processor(image, window.__processor.construct_prompts(task));
      const ids = await window.__model.generate({ ...inputs, max_new_tokens: 1024 });
      const text = window.__processor.batch_decode(ids, { skip_special_tokens: false })[0];
      return JSON.stringify(window.__processor.post_process_generation(text, task, image.size)[task].labels);`,
    toText: (raw) => (JSON.parse(raw) as string[]).map((l) => l.replace(/<\/?s>/g, "").trim()).join("\n"),
  };
}

const CANDIDATES: Record<string, Candidate> = {
  "florence-2-base": florence("onnx-community/Florence-2-base-ft"),
  "granite-docling-fp16": granite("fp16"),
  "granite-docling-q4f16": granite("q4f16"),
  "granite-docling-fp32": granite("fp32"),
};

const at = (p: string): string => path.resolve(process.env.INIT_CWD ?? process.cwd(), p);
const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
};

const pngs = (dir: string): string[] =>
  fs
    .readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".png"))
    .map((f) => f.split(path.sep).join("/"))
    .sort();

async function evaluate(page: Page, body: string, url?: string): Promise<unknown> {
  return page.evaluate(`(async (url) => { ${body} })(${JSON.stringify(url ?? null)})`);
}

/** Closed on failure too: the Chrome is the user's, only our own tab goes. */
let openPage: Page | undefined;

async function main(): Promise<void> {
  const name = process.argv[2];
  const candidate = CANDIDATES[name];
  if (!candidate) throw new Error(`unknown candidate ${name}; one of ${Object.keys(CANDIDATES).join(", ")}`);
  const corpus = at(flag("--corpus") ?? "");
  const out = at(flag("--out") ?? "");
  if (fs.existsSync(out)) throw new Error(`${out} exists; a measurement is a record, pick a new name`);
  // The raw output is the measurement; `--retext <results>` reruns only toText over it.
  const retext = flag("--retext");
  if (retext) {
    const run = JSON.parse(fs.readFileSync(at(retext), "utf8")) as { results: { raw: string; error: string | null; text: string }[] };
    for (const r of run.results) r.text = r.error ? "" : candidate.toText(r.raw);
    fs.writeFileSync(out, JSON.stringify(run, null, 1));
    console.log(`wrote ${out}`);
    return;
  }
  const limit = Number(flag("--limit") ?? Infinity);
  const partial = `${out}.partial`;
  type Row = { fixture: string; text: string; raw: string; error: string | null; ms: number };
  const done: Row[] = fs.existsSync(partial) ? JSON.parse(fs.readFileSync(partial, "utf8")) : [];
  const seen = new Set(done.map((r) => r.fixture));

  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const page = await browser.contexts()[0].newPage();
  await page.route(`${ORIGIN}/**`, (route) => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
    if (!rel) return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>candidate</title>" });
    return route.fulfill({ path: path.join(corpus, rel), contentType: "image/png" });
  });
  page.on("console", (msg) => msg.type() === "error" && console.error(`page: ${msg.text()}`));
  openPage = page;
  await page.goto(`${ORIGIN}/`);
  const t0 = Date.now();
  await evaluate(page, candidate.setup);
  console.log(`setup ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  const todo = pngs(corpus).filter((f) => !seen.has(f)).slice(0, limit - done.length);
  for (const fixture of todo) {
    const start = Date.now();
    let raw = "";
    let error: string | null = null;
    try {
      raw = String(await evaluate(page, candidate.read, `${ORIGIN}/${encodeURIComponent(fixture).replace(/%2F/g, "/")}`));
    } catch (err) {
      error = err instanceof Error ? err.message.split("\n")[0] : String(err);
    }
    done.push({ fixture, text: error ? "" : candidate.toText(raw), raw, error, ms: Date.now() - start });
    fs.writeFileSync(partial, JSON.stringify(done));
    console.log(`${done.length} ${fixture} ${((Date.now() - start) / 1000).toFixed(1)} s${error ? ` ERROR ${error}` : ""}`);
  }
  await page.close();
  if (done.length >= pngs(corpus).length) {
    fs.writeFileSync(out, JSON.stringify({ reader: name, corpus: path.relative(REPO_ROOT, corpus), results: done }, null, 1));
    fs.rmSync(partial);
    console.log(`wrote ${out}`);
  }
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(async (err) => {
    console.error(err);
    await openPage?.close().catch(() => {});
    process.exit(1);
  });
}
