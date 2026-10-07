/**
 * Build an olmOCR-bench candidate that behaves like a router: one text reader's
 * pages, with the pages it left empty replaced by an OCR reader's reading.
 *
 * That is the product's own flow (recognition runs over what extraction left
 * empty), so the composed score is what a user of that pair would get. The OCR
 * results come from `extract-candidate.ts --corpus <page images>`, whose
 * fixtures are `<category>/<name>.png`, the same names the bench uses.
 *
 * Usage:
 *   pnpm --filter @fileconcat/cli exec tsx scripts/compose-olmocr-candidate.ts \
 *     --bench <bench_data> --base <candidate> --ocr <results.json> --name <new candidate>
 */
import fs from "node:fs";
import path from "node:path";

const at = (p: string): string => path.resolve(process.env.INIT_CWD ?? process.cwd(), p);
const flag = (name: string): string => {
  const i = process.argv.indexOf(name);
  if (i === -1 || !process.argv[i + 1]) throw new Error(`${name} is required`);
  return process.argv[i + 1];
};

const bench = at(flag("--bench"));
const base = path.join(bench, flag("--base"));
const target = path.join(bench, flag("--name"));
if (fs.existsSync(target)) throw new Error(`${target} exists; a candidate is a record, pick a new name`);
const ocr = JSON.parse(fs.readFileSync(at(flag("--ocr")), "utf8")) as {
  results: { fixture: string; text: string; error: string | null }[];
};
const reading = new Map(ocr.results.filter((r) => !r.error).map((r) => [r.fixture.replace(/\.png$/, ""), r.text]));

let replaced = 0;
for (const rel of fs.readdirSync(base, { recursive: true, encoding: "utf8" })) {
  if (!rel.endsWith(".md")) continue;
  const text = fs.readFileSync(path.join(base, rel), "utf8");
  const page = rel.replace(/_pg1_repeat1\.md$/, "");
  const swap = !text.trim() && reading.has(page);
  if (swap) replaced++;
  fs.mkdirSync(path.dirname(path.join(target, rel)), { recursive: true });
  fs.writeFileSync(path.join(target, rel), swap ? reading.get(page)! : text);
}
console.log(`${target}: ${replaced} empty pages filled from ${reading.size} OCR readings`);
