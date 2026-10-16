/**
 * What survives PDF, DOCX and XLSX conversion?
 *
 * Runs every fixture in the extraction corpus through the exact paths the
 * product uses -- `routeBytes` decides what the file is from its leading bytes
 * (ADR-0011), then the web's reader chain and the CLI's own parser registry
 * each pull the text -- and records what came out. Until 2026-10-14 only the
 * CLI's path ran, so after the web moved PDF, workbooks and RTF to other
 * readers (2026-10-05) the record kept reporting defects no browser user had. It replaces the by-hand reading of 2026-08-15, which produced
 * numbers nobody can reproduce.
 *
 * Four rules this script exists to obey:
 *
 *  1. **Every decision comes from the product.** The router is core's, the
 *     chains are core's `FIRST_READERS` and `extractWithFallback` over the web's
 *     own reader modules (see `webExtract`) and the registry
 *     `packages/cli/src/parsers.ts` builds, and the bytes are read whole. There
 *     is no second extraction implementation here.
 *  2. **The corpus is not publishable, the findings are.** The fixtures live in
 *     `packages/core/tests/fixtures/real/`, which is gitignored because a real
 *     document dropped there is somebody's. Only this script, the generator
 *     next to the corpus and the aggregate result may be published. The output
 *     JSON carries extracted text and goes to `docs/`, gitignored with it.
 *  3. **A finding is a predicate, not a memory.** Every defect the reading
 *     names is encoded in CHECKS below as a test over the current extracted
 *     text, so a rerun says FIXED or STILL BROKEN instead of a person deciding
 *     from a paragraph written a month ago.
 *  4. **A check that cannot find its fixture fails loudly.** A missing file
 *     reports MISSING, never a silent pass. A corpus that regenerated
 *     differently must not read as a fixed defect.
 *
 * Two caveats an article that drops them gets wrong:
 *
 *  - **Recognition does not run here.** The browser renders pages a reader
 *    could not decode and runs the OCR the app already ships, so a scanned PDF
 *    that extracts empty here is recovered there. Every scan result below is
 *    the floor, not what a user of the web app reads. On the web chain a page
 *    with no text layer raises `pages-scanned`, which is what sends it to OCR;
 *    on the CLI's chain it is still dropped with no note.
 *  - **Every fixture is generated** (`gen-*`), written with `docx`, `exceljs`,
 *    `pptxgenjs`, `pdfkit` and PIL because no real corpus was available. That is
 *    much closer to a real file than hand-written XML and it is still not a real
 *    file. A finding that could plausibly differ on a document Word itself wrote
 *    is marked `generatedOnly` and has to carry that caveat into the article.
 *
 * Usage:
 *   pnpm --filter @fileconcat/cli measure-extraction
 *   pnpm --filter @fileconcat/cli measure-extraction --dump gen-pdf-table.pdf
 *
 * Flags:
 *   --out <file>    output JSON (default docs/measurements/extraction-quality-<date>.json)
 *   --force         replace an existing output file instead of refusing
 *   --dump <name>   print one fixture's extracted text and exit (the CLI's)
 *   --web           with --dump, the web chain's text instead
 *   --pypdf <file>  the independent reader's output (default
 *                   docs/measurements/extraction-pypdf.json, written by
 *                   extract-pdf-with-pypdf.py). Absent means no pypdf column.
 *   --reader <file> another reader's output, repeatable; one column each.
 *                   Written by extract-candidate.ts for JS candidates.
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
const CORPUS = process.env.EXTRACTION_CORPUS ?? path.join(REPO_ROOT, "packages", "core", "tests", "fixtures", "real");

/** Tracked companions of the corpus, and the generator's own dependencies. */
const NOT_A_FIXTURE = new Set(["README.md", "generate.mjs", "manifest.json", "node_modules"]);

/**
 * What the reading found, one entry per defect, each a predicate over the text
 * the current build extracts. `stillBroken` returning true means the defect is
 * present now.
 *
 * The severities are the reading's own: BROKEN means the bundle says something
 * false or loses data invisibly, DEGRADED means it is poorer than it should be
 * but not misleading.
 */
interface Check {
  id: string;
  format: string;
  fixture: string;
  severity: "BROKEN" | "DEGRADED";
  finding: string;
  /** True when the 2026-08-15 defect is still present in this result. */
  stillBroken: (r: Result) => boolean;
  /**
   * Text the fixture must produce for the check to mean anything. Required
   * wherever `stillBroken` looks for the *defect* rather than for the fix,
   * because there a fixture that stopped carrying the structure would read as
   * FIXED. Absent anchor is reported as SIGNAL ABSENT, never as a pass.
   */
  anchor?: string;
  /**
   * The predicate reads `error` or `notes`, which is our own contract, so other
   * readers are not scored on it. Every other check runs against every reader.
   *
   * The comparison is what turns a defect into an attribution. A structure
   * every reader loses is inherent to the format and no library swap fixes it;
   * one another reader recovers is our reader's choice and therefore ours.
   */
  contract?: boolean;
  /** Set where the defect may be an artifact of a generated file. */
  generatedOnly?: boolean;
  /**
   * Not a defect the reading found, but a correctness property checked every
   * run. It has always passed, so counting it among the fixed ones would
   * inflate the headline by one. Reported on its own line instead.
   */
  guard?: boolean;
  /**
   * The date a later reading found the defect, for one the 2026-08-15 reading
   * did not have. Counted on its own line, so the August tally keeps meaning
   * what it meant.
   */
  since?: string;
}

/** Lines of `text`, trimmed of the trailing empty one. */
const lines = (r: Result): string[] => r.text.split("\n");

/** How many times `needle` appears in the extracted text. */
const count = (r: Result, needle: string): number => r.text.split(needle).length - 1;

const CHECKS: Check[] = [
  {
    id: "pdf-1.1",
    format: "pdf",
    fixture: "gen-pdf-two-column.pdf",
    anchor: "Section 1.",
    severity: "BROKEN",
    finding: "Multi-column pages merged line by line across the gutter",
    // The defect put the left column's line and the right column's line from
    // the same vertical position on one output line, so both section markers
    // land in a single line.
    stillBroken: (r) => lines(r).some((l) => l.includes("Section 1.") && l.includes("Section 2.")),
  },
  {
    id: "pdf-1.1b",
    format: "pdf",
    fixture: "gen-pdf-two-column-interleaved.pdf",
    anchor: "Right column line",
    severity: "BROKEN",
    finding: "Column order ignores the content stream, on the same layout written the other way round",
    // Same visual layout, opposite content-stream order. Correct reading order
    // finishes the left column before the right one starts.
    stillBroken: (r) => {
      const ls = lines(r);
      let lastLeft = -1;
      ls.forEach((l, i) => {
        if (l.includes("Left column line")) lastLeft = i;
      });
      const firstRight = ls.findIndex((l) => l.includes("Right column line"));
      return firstRight < lastLeft;
    },
  },
  {
    id: "pdf-1.2",
    format: "pdf",
    fixture: "gen-pdf-table.pdf",
    severity: "BROKEN",
    finding: "A table's empty cell shifts every later value one column left",
    // Source row is APAC | 980 | (empty) | 980. The defect printed
    // `APAC 980 980`, which reads as Q2=980 and no total.
    //
    // Deliberately not compared against the independent reader. This predicate
    // looks for our own pipe rendering, which no other library emits, so the
    // comparison would score output shape rather than whether the cell's
    // position survived. Attributing this one needs a renderer-agnostic
    // predicate, and it does not have one.
    contract: true,
    stillBroken: (r) => !/\|\s*APAC\s*\|\s*980\s*\|\s*\|\s*980\s*\|/.test(r.text),
  },
  {
    id: "pdf-1.3",
    format: "pdf",
    fixture: "gen-pdf-prose.pdf",
    anchor: "router reads the leading bytes",
    severity: "DEGRADED",
    finding: "Running headers and footers repeated into the prose at every page seam",
    // The generator stamps the header on all three pages and a footer under
    // each. Repeating them in the output is the defect; one copy is not.
    stillBroken: (r) => count(r, "FileConcat Technical Note") > 1 || count(r, "Page 1 of 3") > 0,
  },
  {
    id: "pdf-1.5",
    format: "pdf",
    fixture: "gen-pdf-typography.pdf",
    anchor: "Claim needing support",
    severity: "DEGRADED",
    finding: "A superscript footnote marker sorts above the line it annotates",
    // The fix, not the defect's old shape: the marker follows the claim it
    // annotates. Read as "a line that is only 1, above the claim", a marker
    // indented on its line or inline in front ("1 Claim needing support")
    // passed. `(?!\.)` keeps the footnote body's own "1." from counting.
    stillBroken: (r) => !/Claim needing support\s*(\[\^)?1\b(?!\.)/.test(r.text),
  },
  {
    id: "pdf-1.6",
    contract: true,
    format: "pdf",
    fixture: "gen-pdf-encrypted.pdf",
    severity: "DEGRADED",
    finding: "An encrypted PDF fails under the same wording as any parse error",
    // The reader's own `[OfficeParser]: No password given` is the thing the
    // person running this cannot act on. `isPasswordProtected` is what lets
    // both platforms name it.
    stillBroken: (r) => r.error !== "password protected",
  },
  {
    id: "pdf-1.7",
    contract: true,
    format: "pdf",
    fixture: "gen-pdf-mixed-scan.pdf",
    severity: "BROKEN",
    finding: "A page with no text layer is dropped with no note, so a partly-scanned document looks whole",
    stillBroken: (r) => r.notes.length === 0,
  },
  {
    // Found 2026-10-14: liteparse strips repeated page-band lines, so pdf-1.3
    // passed on the web chain by losing the header altogether. Fixed the same
    // day by keeping them and thinning them in core, as officeparser's are.
    id: "pdf-1.8",
    since: "2026-10-14",
    format: "pdf",
    fixture: "gen-pdf-prose.pdf",
    anchor: "router reads the leading bytes",
    severity: "DEGRADED",
    finding: "A running header is dropped entirely, so a title or marking printed on every page never reaches the bundle",
    stillBroken: (r) => count(r, "FileConcat Technical Note") === 0,
  },
  {
    // Found 2026-10-14 on the web chain, in every liteparse output format.
    id: "pdf-1.9",
    since: "2026-10-14",
    format: "pdf",
    fixture: "gen-pdf-typography.pdf",
    anchor: "Curly quotes",
    severity: "DEGRADED",
    finding: "Curly quotes and the en dash are flattened to their ASCII forms",
    stillBroken: (r) => !/[\u201c\u201d]/.test(r.text) || !r.text.includes("\u2013"),
  },
  {
    id: "docx-3.2",
    format: "docx",
    fixture: "gen-docx-tables.docx",
    severity: "BROKEN",
    finding: "A horizontally merged cell collapses its row to one cell",
    generatedOnly: true,
    // The header spans all three columns. The defect emitted a one-cell row
    // inside a three-column table, so the rows no longer align.
    stillBroken: (r) => {
      const row = lines(r).find((l) => l.includes("Half-year totals"));
      return row === undefined || row.split("|").length - 2 < 3;
    },
  },
  {
    id: "docx-3.3",
    format: "docx",
    fixture: "gen-docx-references.docx",
    severity: "BROKEN",
    finding: "Hyperlink destinations dropped, leaving only the anchor text",
    stillBroken: (r) => !r.text.includes("https://fileconcat.com/docs/introduction"),
  },
  {
    id: "docx-3.4",
    format: "docx",
    fixture: "gen-docx-references.docx",
    severity: "BROKEN",
    finding: "Footnote markers stripped, detaching each note from its claim",
    stillBroken: (r) => !r.text.includes("[^1]") || !r.text.includes("[^2]"),
  },
  {
    id: "docx-3.5",
    format: "docx",
    fixture: "gen-docx-furniture.docx",
    severity: "DEGRADED",
    finding: "Headers and footers dropped entirely, including a confidentiality marking",
    stillBroken: (r) => !r.text.includes("CONFIDENTIAL"),
  },
  {
    id: "docx-3.6",
    format: "docx",
    fixture: "gen-docx-structure.docx",
    severity: "DEGRADED",
    finding: "Heading levels lost, flattening document hierarchy",
    stillBroken: (r) => !/^# Annual Review$/m.test(r.text) || !/^### EMEA Detail$/m.test(r.text),
  },
  {
    id: "docx-3.1",
    format: "docx",
    fixture: "gen-docx-revisions.docx",
    anchor: "INSERTED-REPLACEMENT-TEXT",
    severity: "BROKEN",
    guard: true,
    finding: "A tracked deletion reaches the bundle as current text",
    // Never broken, and checked every run because it is the one defect here
    // that would put words in a document's mouth.
    stillBroken: (r) => r.text.includes("DELETED-SENTENCE-DO-NOT-SHIP"),
  },
  {
    id: "xlsx-4.1",
    format: "xlsx",
    fixture: "gen-xlsx-sheets.xlsx",
    anchor: "Kickoff",
    severity: "BROKEN",
    finding: "Dates arrive as raw serial numbers",
    // The date itself, in any format and after any separator. Asking only
    // "is there no serial number" passed a tab-separated serial once, and
    // would pass a reader that dropped the date.
    stillBroken: (r) => !/Kickoff\W+[^\n]*2026/.test(r.text),
  },
  {
    id: "rtf-4.2",
    format: "rtf",
    fixture: "gen-rtf-document.rtf",
    anchor: "Closing prose",
    severity: "BROKEN",
    finding: "Words joined across a formatting boundary",
    stillBroken: (r) => r.text.includes("boldand"),
  },
  {
    id: "pptx-4.3",
    format: "pptx",
    fixture: "gen-pptx-deck.pptx",
    // The deck's own text, not our `# Slide n` marker, so another reader can be
    // scored too.
    anchor: "Extraction Quality",
    severity: "BROKEN",
    finding: "A bare slide number injected into every slide's body text",
    // A line that is nothing but digits. The deck's own `# Slide 99` text is
    // deliberately not one: it proves the real marker comes from the tree.
    stillBroken: (r) => lines(r).some((l) => /^\d+$/.test(l.trim())),
  },
  {
    id: "vtt-4.4",
    format: "vtt",
    fixture: "gen-subtitles.vtt",
    anchor: "First cue",
    severity: "BROKEN",
    finding: "Cue identifiers and NOTE comments emitted as if they were dialogue",
    stillBroken: (r) => /^intro$/m.test(r.text) || r.text.includes("NOTE This comment"),
  },
];

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

function webExtract(parserId: ParserId, bytes: Uint8Array, format?: string): Promise<ExtractionResult> {
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

type Extract = (parserId: ParserId, bytes: Uint8Array, format?: string) => Promise<ExtractionResult>;
const cliExtract: Extract = (parserId, bytes, format) => parsers.extract(parserId, bytes, format);

interface Result {
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

function args(): { out?: string; force: boolean; dump?: string; pypdf?: string; web: boolean; readers: string[] } {
  const argv = process.argv.slice(2);
  // pnpm runs the script inside packages/cli, so a relative path is resolved
  // against the directory the command was typed in, not the package's.
  const at = (p: string): string => path.resolve(process.env.INIT_CWD ?? process.cwd(), p);
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i === -1 ? undefined : argv[i + 1];
  };
  return {
    out: flag("--out") && at(flag("--out")!),
    force: argv.includes("--force"),
    web: argv.includes("--web"),
    dump: flag("--dump"),
    pypdf: flag("--pypdf") && at(flag("--pypdf")!),
    readers: argv.flatMap((a, i) => (a === "--reader" && argv[i + 1] ? [at(argv[i + 1])] : [])),
  };
}

interface Reader {
  name: string;
  byFixture: Map<string, { text: string; error: string | null }>;
}

/**
 * What another reader wrote: `extract-pdf-with-pypdf.py`, or a candidate run
 * by `extract-candidate.ts`. The default pypdf file may be absent, and then
 * its column is simply missing, because a reader that was not run is a gap in
 * the evidence and never a verdict. A file named with `--reader` must exist.
 */
function loadReader(p: string): Reader {
  const raw = JSON.parse(fs.readFileSync(p, "utf8")) as {
    reader: string;
    results: { fixture: string; text: string; error: string | null }[];
  };
  return {
    name: raw.reader,
    byFixture: new Map(raw.results.map((r) => [r.fixture, { text: r.text, error: r.error }])),
  };
}

/**
 * Run one check's predicate against another reader's text, so a defect can be
 * attributed. BROKEN in every column means every reader loses the structure,
 * and on the same bytes that points at the format rather than at any library.
 * ok somewhere means the bytes carried enough to do better.
 */
function readerVerdict(c: Check, reader: Reader): string {
  if (c.contract) return "-";
  const row = reader.byFixture.get(c.fixture);
  if (!row) return "no row";
  if (row.error) return `failed: ${row.error}`;
  if (c.anchor !== undefined && !row.text.includes(c.anchor)) return "signal absent";
  const asResult: Result = {
    fixture: c.fixture,
    ext: "pdf",
    bytes: 0,
    route: "extract",
    chars: row.text.length,
    lines: row.text.split("\n").length,
    notes: [],
    text: row.text,
  };
  return c.stillBroken(asResult) ? "BROKEN" : "ok";
}

async function extractOne(file: string, extract: Extract = cliExtract): Promise<Result> {
  const full = path.join(CORPUS, file);
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

async function main(): Promise<void> {
  const { out, force, dump, pypdf, web, readers: readerFiles } = args();

  if (!fs.existsSync(CORPUS)) {
    console.error(`No corpus at ${CORPUS}. Run \`node generate.mjs\` there first.`);
    process.exit(1);
  }

  const fixtures = fs
    .readdirSync(CORPUS)
    .filter((f) => !NOT_A_FIXTURE.has(f))
    .sort();

  if (dump) {
    const match = fixtures.find((f) => f === dump || f.includes(dump));
    if (!match) {
      console.error(`No fixture matching "${dump}". Have: ${fixtures.join(", ")}`);
      process.exit(1);
    }
    const r = await extractOne(match, web ? webExtract : cliExtract);
    console.log(`--- ${r.fixture} | ${r.route}${r.parserId ? `/${r.parserId}` : ""} | ${r.chars} chars | notes: ${r.notes.join(", ") || "-"}${r.error ? ` | ERROR: ${r.error}` : ""}`);
    console.log(r.text);
    return;
  }

  const results: Result[] = [];
  const webResults: Result[] = [];
  for (const f of fixtures) {
    results.push(await extractOne(f));
    webResults.push(await extractOne(f, webExtract));
  }

  console.log(`\nExtraction over ${results.length} fixtures\n`);
  console.log("| fixture | surface | route | chars | lines | notes |");
  console.log("| --- | --- | --- | --- | --- | --- |");
  for (const [surface, rows] of [["web", webResults], ["cli", results]] as const) {
    for (const r of rows) {
      const route = r.error ? `ERROR: ${r.error}` : r.parserId ? `${r.route}/${r.parserId}` : r.route;
      console.log(`| ${r.fixture} | ${surface} | ${route} | ${r.chars} | ${r.lines} | ${r.notes.join(", ") || "-"} |`);
    }
  }

  const checks: { id: string; web: string; status: string; readers: Record<string, string> }[] = [];
  if (CHECKS.length > 0) {
    const tally = { web: { broken: 0, fixed: 0, missing: 0, absent: 0 }, cli: { broken: 0, fixed: 0, missing: 0, absent: 0 } };
    const pypdfFile = pypdf ?? path.join(REPO_ROOT, "docs", "measurements", "extraction-pypdf.json");
    const readers = [...(fs.existsSync(pypdfFile) ? [pypdfFile] : []), ...readerFiles].map(loadReader);
    const names = readers.map((r) => r.name);
    console.log(`\nFindings from 2026-08-15, re-tested. Other readers: ${names.join(", ") || "none"}\n`);
    // The web is what a user gets, so it is the headline; the CLI column is
    // the node product, kept because the 2026-09-07 article was measured on it.
    console.log(`| id | format | severity | finding | web | cli |${names.map((n) => ` ${n} |`).join("")}`);
    console.log(`| --- | --- | --- | --- | --- | --- |${names.map(() => " --- |").join("")}`);
    const verdict = (c: Check, rows: Result[], t: (typeof tally)["web"]): string => {
      const r = rows.find((x) => x.fixture === c.fixture);
      if (!r) {
        t.missing++;
        return "MISSING FIXTURE";
      }
      if (c.anchor !== undefined && !r.text.includes(c.anchor)) {
        // The structure the check reads is not in the output at all, so the
        // check proves nothing. Never a pass.
        t.absent++;
        return "SIGNAL ABSENT";
      }
      if (c.stillBroken(r)) {
        t.broken++;
        return "STILL BROKEN";
      }
      t.fixed++;
      return "FIXED";
    };
    // A later finding gets its own line below, never the August tally.
    const untallied = () => ({ broken: 0, fixed: 0, missing: 0, absent: 0 });
    for (const c of CHECKS) {
      const web = verdict(c, webResults, c.since ? untallied() : tally.web);
      const status = verdict(c, results, c.since ? untallied() : tally.cli);
      const note = c.generatedOnly ? " [generated-only]" : "";
      const others = readers.map((reader) => readerVerdict(c, reader));
      checks.push({ id: c.id, web, status, readers: Object.fromEntries(names.map((n, i) => [n, others[i]])) });
      console.log(
        `| ${c.id} | ${c.format} | ${c.severity} | ${c.finding}${note} | ${web} | ${status} |${others.map((o) => ` ${o} |`).join("")}`,
      );
    }
    const guards = CHECKS.filter((c) => c.guard).length;
    const august = CHECKS.filter((c) => !c.since).length;
    const later = checks.filter((row) => CHECKS.find((c) => c.id === row.id)?.since);
    for (const [surface, t] of Object.entries(tally)) {
      console.log(
        `\n${surface}: ${t.fixed - guards} of ${august - guards} defects from 2026-08-15 closed, ${t.broken} still broken, ` +
          `${t.absent} signal absent, ${t.missing} missing fixture. ` +
          `${guards} standing guard(s) passing, counted separately because they were never broken.`,
      );
    }
    for (const row of later) console.log(`found later, ${row.id}: web ${row.web}, cli ${row.status}`);
    for (const n of names) {
      const verdicts = checks.map((c) => c.readers[n]).filter((v) => v === "ok" || v === "BROKEN");
      console.log(`${n}: ${verdicts.filter((v) => v === "ok").length} of ${verdicts.length} scored checks ok`);
    }
  }

  const date = new Date().toISOString().slice(0, 10);
  const outPath = out ?? path.join(REPO_ROOT, "docs", "measurements", `extraction-quality-${date}.json`);
  if (fs.existsSync(outPath) && !force) {
    console.error(`\n${outPath} exists. Pass --out or --force; a measurement is a record, not a temp file.`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ date, corpus: CORPUS, results, webResults, checks }, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
