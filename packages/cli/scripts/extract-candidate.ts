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
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

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

const CANDIDATES: Record<string, Candidate> = {
  "officeparser-8.1": officeparser8({}),
  "officeparser-8.1-flow": officeparser8({ ignorePageGeometry: true }),
};

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const name = argv[0];
  const candidate = CANDIDATES[name];
  if (!candidate) {
    console.error(`Usage: extract-candidate <name>. Candidates: ${Object.keys(CANDIDATES).join(", ")}`);
    process.exit(1);
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

  const fixtures = fs
    .readdirSync(CORPUS)
    .filter((f) => candidate.formats.includes(path.extname(f).slice(1)))
    .sort();
  const results = [];
  for (const fixture of fixtures) {
    const bytes = new Uint8Array(fs.readFileSync(path.join(CORPUS, fixture)));
    const start = performance.now();
    let text = "";
    let error: string | null = null;
    try {
      text = await candidate.extract(bytes);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    const ms = Math.round(performance.now() - start);
    results.push({ fixture, text, error, ms });
    console.log(`${fixture}: ${error ? `ERROR ${error}` : `${text.length} chars`} in ${ms} ms`);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ reader: name, results }, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
