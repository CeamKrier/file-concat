/**
 * Run one candidate extractor over the extraction corpus and write its output
 * in the shape `measure-extraction-quality.ts` reads with `--reader`.
 *
 * Producing outputs and scoring them are kept apart, the way olmOCR-bench,
 * OmniDocBench and docling-eval do it: every candidate writes its text per
 * fixture, and one scorer runs the same CHECKS over all of them. A Python
 * reader (`extract-pdf-with-pypdf.py`) writes the same shape, so the scorer
 * never knows or cares what language a candidate is in.
 *
 * A candidate here is the library as it ships, called the way its README says.
 * None of core's visitors run on it, so a check that core fixes on top of the
 * baseline reader (heading levels, link targets, footnote labels) can read
 * BROKEN for a candidate whose tree carries the structure. That is the right
 * question for choosing a reader, and the wrong one for scoring the product.
 *
 * Usage:
 *   pnpm --filter @fileconcat/cli extract-candidate <name> [--out <file>] [--force]
 *   pnpm --filter @fileconcat/cli extract-candidate <name> --olmocr-bench <bench_data dir>
 *   pnpm --filter @fileconcat/cli extract-candidate <name> --corpus <dir> --out <file>
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { type ChildProcess, fork } from "node:child_process";

import { createHash } from "node:crypto";

import { canExpandArchive, expandArchive, ROUTER_SNIFF_BYTES, routeBytes, stripArchiveSuffix } from "@fileconcat/core";

import { parsers } from "../src/parsers.js";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CORPUS = path.join(REPO_ROOT, "packages", "core", "tests", "fixtures", "real");

interface Candidate {
  /** Fixture extensions the candidate claims to read. */
  formats: string[];
  extract: (bytes: Uint8Array) => Promise<string>;
}

/** officeparser 8 as shipped, with or without its layout-faithful text renderer. */
function officeparser8(config: Record<string, unknown>): Candidate {
  return {
    formats: ["pdf", "docx", "xlsx", "pptx", "odt", "ods", "odp", "rtf"],
    extract: async (bytes) => {
      const { parseOffice } = await import("officeparser8");
      const ast = await parseOffice(Buffer.from(bytes), config);
      const { value } = await ast.to("text");
      return typeof value === "string" ? value : new TextDecoder().decode(value);
    },
  };
}

const require = createRequire(import.meta.url);

/** A wasm-bindgen web build initialised from its file, as Node has no fetch for it. */
function wasmFile(specifier: string): Buffer {
  return fs.readFileSync(require.resolve(specifier));
}

/** Load and initialise a module once, not once per file. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let loaded: Promise<T> | undefined;
  return () => (loaded ??= load());
}

const anydocModule = once(async () => {
  const anydoc = await import("@firecrawl/anydoc-wasm");
  anydoc.initSync({ module: wasmFile("@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm") });
  return anydoc;
});
const doclingModule = once(async () => {
  const docling = await import("docling.rs-wasm/web");
  docling.initSync({ module: wasmFile("docling.rs-wasm/web/docling_wasm_bg.wasm") });
  return docling;
});
const liteparseModule = once(async () => {
  const lite = await import("@llamaindex/liteparse-wasm");
  lite.initSync({ module: wasmFile("@llamaindex/liteparse-wasm/liteparse_wasm_bg.wasm") });
  return lite;
});

/** Archive extensions; `.tar.gz` and friends end in their compressor's. */
const ARCHIVES = ["zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar"];

/**
 * An archive reader's answer, as text so the runner treats it like any other:
 * every regular file with its size and digest, sorted by path. Directories,
 * links and devices are left out, as the answer key leaves them out.
 */
function listing(files: [string, Uint8Array][]): string {
  const rows = files.map(([p, b]) => ({ path: p, size: b.length, sha256: createHash("sha256").update(b).digest("hex") }));
  return JSON.stringify(rows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)));
}

const libarchiveModule = once(async () => (await import("libarchive-wasm")).libarchiveWasm());

/** Every regular file under a directory of 7-Zip's in-memory file system. */
function walk7z(fs7: { readdir(p: string): string[]; isDir(mode: number): boolean; stat(p: string): { mode: number }; readFile(p: string): Uint8Array }, dir: string, rel = ""): [string, Uint8Array][] {
  return fs7.readdir(dir).flatMap((name): [string, Uint8Array][] => {
    if (name === "." || name === "..") return [];
    const full = `${dir}/${name}`;
    return fs7.isDir(fs7.stat(full).mode) ? walk7z(fs7, full, `${rel}${name}/`) : [[`${rel}${name}`, fs7.readFile(full)]];
  });
}

/** One `7zz x` in a fresh module: emscripten's callMain runs once per instance. */
async function sevenZip(name: string, bytes: Uint8Array): Promise<[string, Uint8Array][]> {
  const { default: SevenZip } = await import("7z-wasm");
  const errors: string[] = [];
  const sz = await SevenZip({ print: () => {}, printErr: (line: string) => errors.push(line) });
  sz.FS.mkdir("/in");
  sz.FS.writeFile(`/in/${name}`, bytes);
  try {
    sz.callMain(["x", "-y", "-o/out", `/in/${name}`]);
  } catch (err) {
    errors.push(String(err));
  }
  let out: [string, Uint8Array][] = [];
  try {
    out = walk7z(sz.FS as never, "/out");
  } catch {
    // No /out: 7-Zip wrote nothing.
  }
  if (out.length === 0 && errors.length) throw new Error(errors.join(" ").slice(0, 300));
  return out;
}

/**
 * OCR candidates read page images (`render-pdf-pages.ts` draws them the way the
 * product does). tesseract.js is the product's reader, English here because
 * the benchmark is; PP-OCR runs through onnxruntime-node, the same models the
 * browser build would load through onnxruntime-web.
 */
const tesseractWorker = once(async () => (await import("tesseract.js")).createWorker("eng"));
function paddle(model: "V6_TINY_MODEL" | "V6_SMALL_MODEL" | "V6_MEDIUM_MODEL" | "V5_EN_MOBILE_MODEL"): Candidate {
  const service = once(async () => {
    const ocr = await import("ppu-paddle-ocr");
    const instance = new ocr.PaddleOcrService({ model: ocr[model] });
    await instance.initialize();
    return instance;
  });
  return {
    formats: ["png"],
    extract: async (bytes) => (await (await service()).recognize(bytes.slice().buffer)).text,
  };
}

/** A page as the browser would see it; jsdom stands in for DOMParser under Node. */
async function htmlDocument(bytes: Uint8Array): Promise<Document> {
  const { JSDOM } = await import("jsdom");
  return new JSDOM(new TextDecoder().decode(bytes), { url: "https://example.com/" }).window.document;
}

const CANDIDATES: Record<string, Candidate> = {
  // An .html file goes into the bundle verbatim today.
  "fileconcat-html": { formats: ["html"], extract: async (bytes) => new TextDecoder().decode(bytes) },
  // The Clipper's own pair: Readability picks the article, Turndown writes markdown.
  readability: {
    formats: ["html"],
    extract: async (bytes) => {
      const { Readability } = await import("@mozilla/readability");
      const { default: TurndownService } = await import("turndown");
      const article = new Readability(await htmlDocument(bytes)).parse();
      return article?.content ? new TurndownService({ headingStyle: "atx" }).turndown(article.content) : "";
    },
  },
  defuddle: {
    formats: ["html"],
    extract: async (bytes) => {
      const { Defuddle } = await import("defuddle/node");
      return (await Defuddle(await htmlDocument(bytes), "https://example.com/", { markdown: true })).content;
    },
  },
  // The Node (NAPI) build of the same Rust converter a browser loads as wasm; `minimal` isolates the main content.
  mdream: {
    formats: ["html"],
    extract: async (bytes) => {
      const { htmlToMarkdown } = await import("mdream");
      return htmlToMarkdown(new TextDecoder().decode(bytes), { minimal: true });
    },
  },
  tesseract: {
    formats: ["png"],
    extract: async (bytes) => (await (await tesseractWorker()).recognize(Buffer.from(bytes))).data.text,
  },
  "paddle-v6-tiny": paddle("V6_TINY_MODEL"),
  "paddle-v6-small": paddle("V6_SMALL_MODEL"),
  "paddle-v6-medium": paddle("V6_MEDIUM_MODEL"),
  "paddle-v5-en": paddle("V5_EN_MOBILE_MODEL"),
  // The product's own node path, the same one measure-extraction scores:
  // the byte router, then the CLI's parser registry with core's visitors.
  fileconcat: {
    formats: ["pdf", "docx", "xlsx", "pptx", "odt", "ods", "odp", "rtf", "doc", "xls", "ppt", "docm", "dotx", "xlsm", "xlsb", "pptm", "eml", "msg", "epub"],
    extract: async (bytes) => {
      const route = await routeBytes(bytes.subarray(0, ROUTER_SNIFF_BYTES));
      if (route.kind !== "extract") throw new Error(`routed as ${route.kind}`);
      // The CLI registers no `cfb` loader; the web product does, and it is
      // the product this baseline stands for.
      if (route.parserId === "cfb") {
        const { extractCfb } = await import("../../../apps/web/src/lib/extract-cfb-client.js");
        return extractCfb(bytes).text;
      }
      return (await parsers.extract(route.parserId, bytes, route.format)).text;
    },
  },
  // The product's archive path: the byte router, then core's fflate expansion.
  // Entries come back under a folder named after the archive; the answer key
  // is relative to the archive root, so that folder is taken off.
  "fileconcat-archive": {
    formats: ARCHIVES,
    extract: async (bytes) => {
      const route = await routeBytes(bytes.subarray(0, ROUTER_SNIFF_BYTES));
      if (route.kind !== "expand") throw new Error(`routed as ${route.kind}`);
      if (!canExpandArchive(route.archive)) throw new Error(`${route.archive} is routed but not expandable`);
      const base = `${stripArchiveSuffix(currentName)}/`;
      const entries = expandArchive(bytes, route.archive, currentName);
      return listing(entries.map((e) => [e.path.startsWith(base) ? e.path.slice(base.length) : e.path, e.bytes]));
    },
  },
  "zip.js": {
    formats: ["zip"],
    extract: async (bytes) => {
      const zip = await import("@zip.js/zip.js");
      zip.configure({ useWebWorkers: false });
      const reader = new zip.ZipReader(new zip.Uint8ArrayReader(bytes));
      const files: [string, Uint8Array][] = [];
      for (const entry of await reader.getEntries()) {
        if (!entry.directory) files.push([entry.filename, await entry.getData(new zip.Uint8ArrayWriter())]);
      }
      await reader.close();
      return listing(files);
    },
  },
  libarchive: {
    formats: ARCHIVES,
    extract: async (bytes) => {
      const { ArchiveReader } = await import("libarchive-wasm");
      const reader = new ArchiveReader(await libarchiveModule(), new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length));
      try {
        const files: [string, Uint8Array][] = [];
        for (const entry of reader.entries()) {
          if (entry.getFiletype() !== "File") continue;
          const data = entry.readData() ?? new Int8Array();
          files.push([entry.getPathname(), new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))]);
        }
        return listing(files);
      } finally {
        reader.free();
      }
    },
  },
  // 7-Zip unpacks one layer at a time: a .tar.gz gives a .tar, which a router
  // would hand back to it, so a lone .tar out is unpacked once more.
  "7z": {
    formats: ARCHIVES,
    extract: async (bytes) => {
      let files = await sevenZip(currentName, bytes);
      if (files.length === 1 && files[0][0].endsWith(".tar")) files = await sevenZip(files[0][0], files[0][1]);
      return listing(files);
    },
  },
  "node-unrar-js": {
    formats: ["rar"],
    extract: async (bytes) => {
      const { createExtractorFromData } = await import("node-unrar-js");
      const extractor = await createExtractorFromData({ data: bytes.slice().buffer });
      const files: [string, Uint8Array][] = [];
      for (const file of extractor.extract().files) {
        if (!file.fileHeader.flags.directory && file.extraction) files.push([file.fileHeader.name, file.extraction]);
      }
      return listing(files);
    },
  },
  "officeparser-8.1": officeparser8({}),
  "officeparser-8.1-flow": officeparser8({ ignorePageGeometry: true }),
  // foliate-js (the Foliate reader's engine, browser-only) with jsdom's DOMParser
  // standing in for the browser's. Every section in spine order, through
  // Turndown like the HTML candidates.
  "foliate-js": {
    formats: ["epub", "mobi", "azw3"],
    extract: async (bytes) => {
      const { JSDOM } = await import("jsdom");
      const g = globalThis as Record<string, unknown>;
      const { window } = new JSDOM("");
      g.DOMParser ??= window.DOMParser;
      g.XMLSerializer ??= window.XMLSerializer;
      g.document ??= window.document;
      // jsdom has no CSS namespace; KF8 only asks it to escape selectors.
      g.CSS ??= { escape: (v: string) => v.replace(/[^\w-]/g, (c) => `\\${c}`) };
      const file = new File([bytes], currentName);
      let book: { sections: { createDocument?: () => Promise<Document> }[] };
      if (currentName.endsWith(".epub")) {
        const { ZipReader, BlobReader, TextWriter, BlobWriter } = await import("@zip.js/zip.js");
        const entries = await new ZipReader(new BlobReader(file), { useWebWorkers: false }).getEntries();
        const map = new Map(entries.flatMap((entry) => (entry.directory ? [] : [[entry.filename, entry] as const])));
        const loader = {
          entries,
          loadText: (name: string) => map.get(name)?.getData?.(new TextWriter()) ?? null,
          loadBlob: (name: string, type?: string) => map.get(name)?.getData?.(new BlobWriter(type)) ?? null,
          getSize: (name: string) => map.get(name)?.uncompressedSize ?? 0,
        };
        // @ts-expect-error untyped ESM
        const { EPUB } = await import("foliate-js/epub.js");
        book = await new EPUB(loader).init();
      } else {
        // @ts-expect-error untyped ESM
        const { MOBI } = await import("foliate-js/mobi.js");
        // The copy foliate-js vendors and its own viewer passes in.
        // @ts-expect-error untyped ESM
        const { unzlibSync } = await import("foliate-js/vendor/fflate.js");
        book = await new MOBI({ unzlib: unzlibSync }).open(file);
      }
      const { default: TurndownService } = await import("turndown");
      const turndown = new TurndownService({ headingStyle: "atx" });
      const parts: string[] = [];
      for (const section of book.sections) {
        const doc = await section.createDocument?.();
        if (doc?.body) parts.push(turndown.turndown(doc.body.innerHTML));
      }
      return parts.join("\n\n");
    },
  },
  // The product's .xls rendering (SheetJS, a csv per sheet) over every workbook
  // format, without the CFB stream-name gate in front of it.
  sheetjs: {
    formats: ["xls", "xlsx", "xlsm", "xlsb", "ods"],
    extract: async (bytes) => {
      const XLSX = createRequire(path.join(REPO_ROOT, "apps", "web", "package.json"))("xlsx") as typeof import("../../../apps/web/node_modules/xlsx");
      const workbook = XLSX.read(bytes, { type: "array" });
      return workbook.SheetNames.map((name) => ({ name, csv: XLSX.utils.sheet_to_csv(workbook.Sheets[name]).trim() }))
        .filter((sheet) => sheet.csv)
        .map((sheet) => `# Sheet: ${sheet.name}\n${sheet.csv}`)
        .join("\n\n");
    },
  },
  anydoc: {
    formats: ["pdf", "docx", "xlsx", "pptx", "odt", "ods", "odp", "rtf", "doc", "xls", "ppt", "docm", "dotx", "xlsm", "xlsb", "pptm", "epub"],
    extract: async (bytes) => (await anydocModule()).toMarkdownBytes(bytes),
  },
  "docling.rs": {
    formats: ["pdf", "docx", "xlsx", "pptx"],
    // The name only carries the format; docling sniffs nothing else from it.
    extract: async (bytes) => (await doclingModule()).convert(bytes, `input${path.extname(currentName)}`, "markdown"),
  },
  liteparse: {
    formats: ["pdf"],
    extract: async (bytes) => {
      const lite = await liteparseModule();
      const parser = new lite.LiteParse({ ocrEnabled: false, outputFormat: "markdown" });
      return (await parser.parse(bytes)).text;
    },
  },
  "pdf-oxide": {
    formats: ["pdf"],
    extract: async (bytes) => {
      const { WasmPdfDocument } = await import("pdf-oxide-wasm");
      return new WasmPdfDocument(bytes).toMarkdownAll(true);
    },
  },
  mammoth: {
    formats: ["docx"],
    extract: async (bytes) => {
      const mammoth = await import("mammoth");
      // Deprecated upstream in favour of HTML and missing from its types, but
      // still the library's own markdown.
      const { convertToMarkdown } = mammoth as unknown as { convertToMarkdown: typeof mammoth.convertToHtml };
      return (await convertToMarkdown({ buffer: Buffer.from(bytes) })).value;
    },
  },
};

/** The fixture being read, for the candidates that want a file name. */
let currentName = "";

interface Run {
  text: string;
  error: string | null;
  ms: number;
}

/** Run a candidate over one file, timing it and keeping a failure as data. */
async function runOne(candidate: Candidate, file: string): Promise<Run> {
  const bytes = new Uint8Array(fs.readFileSync(file));
  currentName = path.basename(file);
  const start = performance.now();
  let text = "";
  let error: string | null = null;
  try {
    text = await candidate.extract(bytes);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    // A trap leaves a wasm-bindgen instance poisoned: every later call fails
    // with the same "unreachable" (anydoc, 2026-10-05). The prefix tells the
    // parent to start the next file in a fresh child.
    if (err instanceof WebAssembly.RuntimeError) error = `${WASM_TRAP}${error}`;
  }
  return { text, error, ms: Math.round(performance.now() - start) };
}

const WASM_TRAP = "wasm trap: ";

/** Longest one file may take before its reader is killed and the file failed. */
const FILE_LIMIT_MS = 120_000;

/**
 * Run a candidate over many files in a child process, the way Tika's
 * ForkParser and fuzzers do: a reader that hangs is killed at the limit, one
 * that crashes (anydoc's process died after 448 benchmark pages, 2026-10-03)
 * takes only its child down, and either way the file is recorded as failed and
 * the next one starts in a fresh child. A fork, not a worker thread, because
 * it inherits tsx's loader flags and survives a native abort too.
 */
async function runIsolated(name: string, files: string[], onRun: (file: string, run: Run) => void): Promise<void> {
  let worker: ChildProcess | undefined;
  for (const file of files) {
    const w = (worker ??= fork(fileURLToPath(import.meta.url), ["--child", name]));
    const run = await new Promise<Run>((resolve) => {
      const done = (r: Run, dead: boolean): void => {
        clearTimeout(timer);
        w.removeAllListeners();
        if (dead) {
          w.kill("SIGKILL");
          worker = undefined;
        }
        resolve(r);
      };
      const timer = setTimeout(
        () => done({ text: "", error: `timeout after ${FILE_LIMIT_MS} ms`, ms: FILE_LIMIT_MS }, true),
        FILE_LIMIT_MS,
      );
      w.on("message", (r: Run) => done(r, r.error?.startsWith(WASM_TRAP) ?? false));
      w.on("error", (err) => done({ text: "", error: `crashed: ${err.message}`, ms: 0 }, true));
      w.on("exit", (code) => done({ text: "", error: `worker exited ${code}`, ms: 0 }, true));
      w.send(file);
    });
    onRun(file, run);
  }
  worker?.disconnect();
}

/**
 * Write one candidate's output in the layout olmOCR-bench's own scorer reads:
 * `<bench_data>/<candidate>/<category>/<pdf>_pg1_repeat1.md`, every benchmark
 * PDF being a single page. A failure is written as an empty page, which the
 * scorer fails like any other miss, so the score never skips what broke.
 */
async function olmocrBench(name: string, benchData: string): Promise<void> {
  const pdfRoot = path.join(benchData, "pdfs");
  const pdfs = fs
    .readdirSync(pdfRoot, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".pdf"))
    .sort();
  const timing: { pdf: string; ms: number; error: string | null }[] = [];
  await runIsolated(name, pdfs.map((pdf) => path.join(pdfRoot, pdf)), (file, { text, error, ms }) => {
    const pdf = path.relative(pdfRoot, file);
    const out = path.join(benchData, name, pdf.replace(/\.pdf$/, "_pg1_repeat1.md"));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, text);
    timing.push({ pdf, ms, error });
    if (timing.length % 200 === 0) console.log(`${timing.length} of ${pdfs.length}`);
  });
  const failed = timing.filter((t) => t.error).length;
  const total = timing.reduce((a, t) => a + t.ms, 0);
  fs.writeFileSync(path.join(benchData, `timing-${name}.json`), JSON.stringify(timing, null, 2));
  console.log(`${name}: ${pdfs.length} pdfs, ${failed} failed, ${total} ms total`);
}

/**
 * Characters no reader should hand a model: the replacement character, C0
 * controls other than tab and newlines, and the private use area a font
 * without a usable map decodes into.
 */
const GARBAGE = /[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F\uE000-\uF8FF]/g;

/** Per extension: files, failed, empty, garbage share, median and p95 time. */
function printRobustness(results: (Run & { fixture: string })[]): void {
  const byExt = new Map<string, (Run & { fixture: string })[]>();
  for (const r of results) {
    const ext = path.extname(r.fixture).slice(1).toLowerCase();
    byExt.set(ext, [...(byExt.get(ext) ?? []), r]);
  }
  console.log("| ext | files | failed | empty | garbage | p50 ms | p95 ms |");
  console.log("| --- | --- | --- | --- | --- | --- | --- |");
  for (const [ext, rows] of [...byExt].sort((a, b) => b[1].length - a[1].length)) {
    const ok = rows.filter((r) => !r.error);
    const chars = ok.reduce((a, r) => a + r.text.length, 0);
    const garbage = ok.reduce((a, r) => a + (r.text.match(GARBAGE)?.length ?? 0), 0);
    const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
    const q = (p: number): number => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))];
    const share = chars === 0 ? "-" : `${((100 * garbage) / chars).toFixed(2)}%`;
    const empty = ok.filter((r) => !r.text.trim()).length;
    console.log(`| ${ext} | ${rows.length} | ${rows.length - ok.length} | ${empty} | ${share} | ${q(0.5)} | ${q(0.95)} |`);
  }
}

/**
 * Against `build-archive-corpus.py`'s answer key: "exact" is every file under
 * its path with its bytes, "content" every file's bytes under any path (a
 * name decoded differently), otherwise how many of the files came back whole.
 */
function printArchiveScore(root: string, results: (Run & { fixture: string })[]): void {
  type Row = { path: string; sha256: string };
  const key = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8")) as Record<string, Row[]>;
  const tally: Record<string, number> = {};
  for (const r of results) {
    const want = key[r.fixture];
    if (!want) continue;
    let verdict: string;
    if (r.error) verdict = `failed: ${r.error.slice(0, 80)}`;
    else {
      const got = JSON.parse(r.text) as Row[];
      const pairs = (rows: Row[]) => rows.map((x) => `${x.path}\0${x.sha256}`).sort().join("\n");
      const shas = (rows: Row[]) => rows.map((x) => x.sha256).sort().join("\n");
      if (pairs(got) === pairs(want)) verdict = "exact";
      else if (shas(got) === shas(want)) verdict = "content";
      else verdict = `${want.filter((w) => got.some((g) => g.sha256 === w.sha256)).length} of ${want.length} files, ${got.length} returned`;
    }
    const label = verdict.split(":")[0].replace(/^\d+ of.*/, "partial");
    tally[label] = (tally[label] ?? 0) + 1;
    console.log(`${r.fixture}: ${verdict}`);
  }
  console.log(Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(", "));
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const name = argv[0];
  const candidate = CANDIDATES[name];
  if (!candidate) {
    console.error(`Usage: extract-candidate <name>. Candidates: ${Object.keys(CANDIDATES).join(", ")}`);
    process.exit(1);
  }
  const bench = argv.indexOf("--olmocr-bench");
  if (bench !== -1) {
    await olmocrBench(name, path.resolve(process.env.INIT_CWD ?? process.cwd(), argv[bench + 1]));
    return;
  }
  const i = argv.indexOf("--out");
  const outPath =
    i === -1
      ? path.join(REPO_ROOT, "docs", "measurements", `extraction-${name}.json`)
      : path.resolve(process.env.INIT_CWD ?? process.cwd(), argv[i + 1]);
  if (fs.existsSync(outPath) && !argv.includes("--force")) {
    console.error(`${outPath} exists. Pass --out or --force; a measurement is a record, not a temp file.`);
    process.exit(1);
  }

  // `--corpus <dir>` reads a real-file corpus (Kind B: no answers, scored for
  // robustness only) instead of the generated fixtures.
  const c = argv.indexOf("--corpus");
  const root = c === -1 ? CORPUS : path.resolve(process.env.INIT_CWD ?? process.cwd(), argv[c + 1]);
  const fixtures = fs
    .readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((f) => candidate.formats.includes(path.extname(f).slice(1).toLowerCase()))
    .sort();
  const results: (Run & { fixture: string })[] = [];
  await runIsolated(name, fixtures.map((f) => path.join(root, f)), (file, run) => {
    const fixture = path.relative(root, file);
    results.push({ fixture, ...run });
    if (c === -1) console.log(`${fixture}: ${run.error ? `ERROR ${run.error}` : `${run.text.length} chars`} in ${run.ms} ms`);
  });
  if (c !== -1) printRobustness(results);
  if (fs.existsSync(path.join(root, "manifest.json"))) printArchiveScore(root, results);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ reader: name, corpus: root, results }, null, 2));
  console.log(`Wrote ${outPath}`);
}

if (process.argv[2] === "--child") {
  const candidate = CANDIDATES[process.argv[3]];
  process.on("message", async (file: string) => process.send!(await runOne(candidate, file)));
  // A reader's own workers (tesseract's) would otherwise keep the child alive.
  process.on("disconnect", () => process.exit(0));
} else {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
