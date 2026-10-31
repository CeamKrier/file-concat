/**
 * The web's reader chain and the CLI's, under node, for one file at a time.
 * measure-extraction-quality.ts scores the defect corpus with it, and
 * tests/probes.test.ts holds the probe files' output to a snapshot.
 */

import * as fs from "node:fs";
import { createRequire, findPackageJSON } from "node:module";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  FIRST_READERS,
  ROUTER_SNIFF_BYTES,
  assemblePdfPages,
  extractWithFallback,
  isPasswordProtected,
  noteLayersOff,
  pdfMayHoldFormsOrFiles,
  pdfTitle,
  routeBytes,
  rtfTitle,
  withTitle,
  withoutHiddenText,
  withRtfChoices,
  withRtfComments,
  withRtfFurniture,
  type ExtractionNote,
  type ExtractionResult,
  type FirstReaderId,
  type ParserId,
  type ParserLoader,
} from "@fileconcat/core";

import { extractCfb, extractWorkbook } from "../../../apps/web/src/lib/extract-cfb-client.js";
import { parsePdfPages } from "../../../apps/web/src/lib/liteparse-pages.js";
import { readPdfForms, withPdfForms, type PdfJs } from "../../../apps/web/src/lib/pdf-forms.js";
import { parsers } from "../src/parsers.js";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * The browser's reader chain, run under node: core's `FIRST_READERS` picks the
 * first reader and core's `extractWithFallback` walks the rest, as
 * `apps/web/src/lib/parsers.ts` does. liteparse and anydoc are the same wasm
 * the web workers load, called with the web's own options; SheetJS and the
 * compound-file reader are the web's own modules. officeparser and the parsers
 * with no browser-only reader (email, notebook, subtitles) are the CLI's
 * registry, which is the same core code over the node build of each library.
 * Recognition is not run: a page the web would send to OCR shows here as its
 * `pages-scanned` note, so a scan result is still the floor.
 */
const require = createRequire(import.meta.url);
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let loaded: Promise<T> | undefined;
  return () => (loaded ??= load());
}
const liteparseModule = once(async () => {
  const lite = await import("@llamaindex/liteparse-wasm");
  lite.initSync({ module: fs.readFileSync(require.resolve("@llamaindex/liteparse-wasm/liteparse_wasm_bg.wasm")) });
  return lite;
});
// The web's own pdf.js, in its node build, for a form's fields and attached files.
const pdfjsModule = once(async (): Promise<PdfJs> => {
  const manifest = findPackageJSON("pdfjs-dist", pathToFileURL(path.join(REPO_ROOT, "apps", "web", "package.json")));
  if (!manifest) throw new Error("pdfjs-dist is not installed for apps/web");
  return import(pathToFileURL(path.join(path.dirname(manifest), "legacy", "build", "pdf.mjs")).href);
});
const anydocModule = once(async () => {
  const anydoc = await import("@firecrawl/anydoc-wasm");
  anydoc.initSync({ module: fs.readFileSync(require.resolve("@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm")) });
  return anydoc;
});

const officeparser: ParserLoader = (bytes, format) => parsers.extract("office", bytes, format);
// As `extract-anydoc-client.ts` reads: comments and page furniture in, hidden text out, then the notes.
const anydoc: ParserLoader = async (bytes) => {
  // officeparser reads an RTF comment itself; anydoc skips it, so it is
  // written into the text first, where hidden text inside it goes too.
  const { bytes: commented, comments } = withRtfComments(withRtfChoices(bytes));
  const { bytes: readable, hidden } = withoutHiddenText(withRtfFurniture(commented));
  const text = (await anydocModule()).toMarkdownBytes(readable).trim();
  if (!text) return { text };
  const notes: ExtractionNote[] = [];
  if (hidden > 0) notes.push({ kind: "hidden-left-out", count: hidden });
  if (comments > 0) notes.push({ kind: "comments-included", count: comments });
  const title = rtfTitle(bytes);
  return { text, ...(notes.length ? { notes } : {}), ...(title ? { title } : {}) };
};
const webReaders: Record<FirstReaderId, ParserLoader> = {
  liteparse: async (bytes) => {
    const { pages, skipped } = await parsePdfPages((await liteparseModule()).LiteParse, bytes);
    const extra = pdfMayHoldFormsOrFiles(bytes) ? await readPdfForms(await pdfjsModule(), bytes).catch(() => undefined) : undefined;
    const title = pdfTitle(bytes);
    const assembled = extra ? assemblePdfPages(withPdfForms(pages, extra), skipped, extra.files) : assemblePdfPages(pages, skipped);
    return { ...noteLayersOff(assembled, bytes), ...(title ? { title } : {}) };
  },
  sheetjs: async (bytes) => extractWorkbook(bytes),
  anydoc,
};
const webFallbacks: Record<string, ParserLoader> = { anydoc, officeparser };

export function webExtract(parserId: ParserId, bytes: Uint8Array, format?: string): Promise<ExtractionResult> {
  if (parserId === "office") {
    const id = FIRST_READERS[format ?? ""];
    const first = id ? { id, read: webReaders[id] } : { id: "officeparser", read: officeparser };
    return extractWithFallback(first, webFallbacks, bytes, format);
  }
  if (parserId === "cfb") {
    return extractWithFallback({ id: "cfb", read: async (b) => extractCfb(b) }, webFallbacks, bytes, format);
  }
  return parsers.extract(parserId, bytes, format);
}

export type Extract = (parserId: ParserId, bytes: Uint8Array, format?: string) => Promise<ExtractionResult>;
export const cliExtract: Extract = (parserId, bytes, format) => parsers.extract(parserId, bytes, format);

export interface Result {
  fixture: string;
  ext: string;
  bytes: number;
  route: string;
  parserId?: string;
  chars: number;
  lines: number;
  notes: string[];
  error?: string;
  text: string;
}

/** One file through `extract`, named `file` relative to `dir`. */
export async function extractOne(dir: string, file: string, extract: Extract = cliExtract): Promise<Result> {
  const full = path.join(dir, file);
  const bytes = new Uint8Array(fs.readFileSync(full));
  const base: Result = {
    fixture: file,
    ext: path.extname(file).slice(1),
    bytes: bytes.length,
    route: "unknown",
    chars: 0,
    lines: 0,
    notes: [],
    text: "",
  };

  let route = await routeBytes(bytes.subarray(0, ROUTER_SNIFF_BYTES));
  // The product re-routes a zip whose package tell sits past the sniff window
  // on the whole file (prepare-batch-client); without it a document with its
  // thumbnail first would count as declined here.
  if (route.kind === "expand") {
    const whole = await routeBytes(bytes);
    if (whole.kind !== "expand") route = whole;
  }
  base.route = route.kind;
  if (route.kind !== "extract") return base;
  base.parserId = route.parserId;

  try {
    const { text: read, notes, reader, title } = await extract(route.parserId, bytes, route.format);
    // As the product writes it: the title above the text (Q30 O2).
    const text = withTitle(read, title, file);
    if (reader) base.parserId = `${route.parserId}:${reader}`;
    base.text = text;
    base.chars = text.length;
    base.lines = text ? text.split("\n").length : 0;
    base.notes = (notes ?? []).map((n) => (n.count ? `${n.kind} x${n.count}` : n.kind));
  } catch (err) {
    base.error = isPasswordProtected(err)
      ? "password protected"
      : err instanceof Error
        ? err.message
        : String(err);
  }
  return base;
}
