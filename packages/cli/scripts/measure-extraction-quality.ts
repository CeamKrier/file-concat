/**
 * What survives PDF, DOCX and XLSX conversion?
 *
 * Runs every fixture in the extraction corpus through the exact path the
 * product uses -- `routeBytes` decides what the file is from its leading bytes
 * (ADR-0011), then the CLI's own parser registry pulls the text -- and records
 * what came out. It replaces the by-hand reading of 2026-08-15, which produced
 * numbers nobody can reproduce.
 *
 * Four rules this script exists to obey:
 *
 *  1. **Every decision comes from the product.** The router is core's, the
 *     parsers are the registry `packages/cli/src/parsers.ts` builds, and the
 *     bytes are read whole. There is no second extraction implementation here.
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
 *  - **This is the node path, and the web has one more layer.** The browser
 *    renders pages a reader could not decode and runs the OCR the app already
 *    ships, so a scanned PDF that extracts empty here is recovered there. Every
 *    scan result below is the floor, not what a user of the web app sees.
 *    Which half of a finding is platform-specific has to be said: `pdf-1.7`
 *    is two claims, and only one of them moves. The missing note is core's
 *    (`toNotes` raises `pages-skipped` for a page that failed to load, never
 *    for one that loaded carrying no text), so silence is what both platforms
 *    do. The recovery is the web's, and only when the reader accepts OCR.
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
 *   --dump <name>   print one fixture's extracted text and exit
 *   --pypdf <file>  the independent reader's output (default
 *                   docs/measurements/extraction-pypdf.json, written by
 *                   extract-pdf-with-pypdf.py). Absent means the comparison
 *                   column reports "not run" rather than assuming anything.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { ROUTER_SNIFF_BYTES, isPasswordProtected, routeBytes } from "@fileconcat/core";

import { parsers } from "../src/parsers.js";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CORPUS = path.join(REPO_ROOT, "packages", "core", "tests", "fixtures", "real");

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
   * Run this check against the independent reader too. Only for checks whose
   * predicate reads the text: one that reads `error` or `notes` is asking about
   * our own contract, which another library has no opinion on.
   *
   * The comparison is what turns a defect into an attribution. A structure
   * pypdf loses as well is inherent to the format and no library swap fixes it;
   * one it recovers is our reader's choice and therefore ours.
   */
  compareReader?: boolean;
  /** Set where the defect may be an artifact of a generated file. */
  generatedOnly?: boolean;
}

/** Lines of `text`, trimmed of the trailing empty one. */
const lines = (r: Result): string[] => r.text.split("\n");

/** How many times `needle` appears in the extracted text. */
const count = (r: Result, needle: string): number => r.text.split(needle).length - 1;

const CHECKS: Check[] = [
  {
    id: "pdf-1.1",
    compareReader: true,
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
    compareReader: true,
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
    stillBroken: (r) => !/\|\s*APAC\s*\|\s*980\s*\|\s*\|\s*980\s*\|/.test(r.text),
  },
  {
    id: "pdf-1.3",
    compareReader: true,
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
    compareReader: true,
    format: "pdf",
    fixture: "gen-pdf-typography.pdf",
    anchor: "Claim needing support",
    severity: "DEGRADED",
    finding: "A superscript footnote marker sorts above the line it annotates",
    stillBroken: (r) => /^1$/m.test(r.text) && r.text.indexOf("\n1\n") < r.text.indexOf("Claim needing support"),
  },
  {
    id: "pdf-1.6",
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
    format: "pdf",
    fixture: "gen-pdf-mixed-scan.pdf",
    severity: "BROKEN",
    finding: "A page with no text layer is dropped with no note, so a partly-scanned document looks whole",
    stillBroken: (r) => r.notes.length === 0,
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
    stillBroken: (r) => /Kickoff,\s*\d{5}\b/.test(r.text),
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
    anchor: "# Slide 1",
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

function args(): { out?: string; force: boolean; dump?: string; pypdf?: string } {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i === -1 ? undefined : argv[i + 1];
  };
  return {
    out: flag("--out"),
    force: argv.includes("--force"),
    dump: flag("--dump"),
    pypdf: flag("--pypdf"),
  };
}

interface Reader {
  name: string;
  byFixture: Map<string, { text: string; error: string | null }>;
}

/**
 * What `extract-pdf-with-pypdf.py` wrote, if it was run. Absent is not an
 * error: the comparison column simply says so, because a missing second reader
 * is a gap in the evidence and never a verdict.
 */
function loadReader(file: string | undefined): Reader | undefined {
  const p = file ?? path.join(REPO_ROOT, "docs", "measurements", "extraction-pypdf.json");
  if (!fs.existsSync(p)) return undefined;
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
 * Run one check's predicate against the independent reader's text, so a defect
 * can be attributed. "loses it too" means both readers lose the structure, and
 * on the same bytes that points at the format rather than at either library.
 * "recovers it" means the bytes carried enough to do better, so whichever
 * reader lost it made a choice.
 */
function readerVerdict(c: Check, reader: Reader | undefined): string {
  if (!c.compareReader) return "not compared";
  if (!reader) return "not run";
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
  return c.stillBroken(asResult) ? "loses it too" : "recovers it";
}

async function extractOne(file: string): Promise<Result> {
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

  const route = await routeBytes(bytes.subarray(0, ROUTER_SNIFF_BYTES));
  base.route = route.kind;
  if (route.kind !== "extract") return base;
  base.parserId = route.parserId;

  try {
    const { text, notes } = await parsers.extract(route.parserId, bytes);
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
  const { out, force, dump, pypdf } = args();

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
    const r = await extractOne(match);
    console.log(`--- ${r.fixture} | ${r.route}${r.parserId ? `/${r.parserId}` : ""} | ${r.chars} chars | notes: ${r.notes.join(", ") || "-"}${r.error ? ` | ERROR: ${r.error}` : ""}`);
    console.log(r.text);
    return;
  }

  const results: Result[] = [];
  for (const f of fixtures) results.push(await extractOne(f));

  console.log(`\nExtraction over ${results.length} fixtures\n`);
  console.log("| fixture | route | chars | lines | notes |");
  console.log("| --- | --- | --- | --- | --- |");
  for (const r of results) {
    const route = r.error ? `ERROR: ${r.error}` : r.parserId ? `${r.route}/${r.parserId}` : r.route;
    console.log(`| ${r.fixture} | ${route} | ${r.chars} | ${r.lines} | ${r.notes.join(", ") || "-"} |`);
  }

  if (CHECKS.length > 0) {
    let broken = 0;
    let fixed = 0;
    let missing = 0;
    let absent = 0;
    const reader = loadReader(pypdf);
    console.log(`\nFindings from 2026-08-15, re-tested. Independent reader: ${reader?.name ?? "not run"}\n`);
    console.log("| id | format | severity | finding | status | independent reader |");
    console.log("| --- | --- | --- | --- | --- | --- |");
    for (const c of CHECKS) {
      const r = results.find((x) => x.fixture === c.fixture);
      let status: string;
      if (!r) {
        status = "MISSING FIXTURE";
        missing++;
      } else if (c.anchor !== undefined && !r.text.includes(c.anchor)) {
        // The structure the check reads is not in the output at all, so the
        // check proves nothing. Never a pass.
        status = "SIGNAL ABSENT";
        absent++;
      } else if (c.stillBroken(r)) {
        status = "STILL BROKEN";
        broken++;
      } else {
        status = "FIXED";
        fixed++;
      }
      const note = c.generatedOnly ? " [generated-only]" : "";
      const other = readerVerdict(c, reader);
      console.log(
        `| ${c.id} | ${c.format} | ${c.severity} | ${c.finding}${note} | ${status} | ${other} |`,
      );
    }
    console.log(
      `\n${fixed} fixed, ${broken} still broken, ${absent} signal absent, ${missing} missing fixture, of ${CHECKS.length}.`,
    );
  }

  const date = new Date().toISOString().slice(0, 10);
  const outPath = out ?? path.join(REPO_ROOT, "docs", "measurements", `extraction-quality-${date}.json`);
  if (fs.existsSync(outPath) && !force) {
    console.error(`\n${outPath} exists. Pass --out or --force; a measurement is a record, not a temp file.`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ date, corpus: CORPUS, results }, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
