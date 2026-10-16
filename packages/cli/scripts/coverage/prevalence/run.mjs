// Runs one format's prevalence detector (./<format>.mjs) over a corpus and
// prints TSV: file<TAB>comma-separated coverage-map rows present in it.
// Reads <corpus dir>/<format>/ when that folder exists, otherwise every file
// under <corpus dir> ending in .<format> (for corpora sorted another way).
// Usage: node run.mjs <corpus dir> <format>
import fs from "node:fs";
import path from "node:path";

const [dir, format] = process.argv.slice(2);
if (!dir || !format) {
  console.error("usage: node run.mjs <corpus dir> <format>");
  process.exit(2);
}
const { default: detect } = await import(new URL(`./${format}.mjs`, import.meta.url));
const sub = path.join(dir, format);
const root = fs.existsSync(sub) && fs.statSync(sub).isDirectory() ? sub : dir;
const files = fs
  .readdirSync(root, { recursive: true })
  .map(String)
  .filter((f) => (root === sub || f.toLowerCase().endsWith(`.${format}`)) && fs.statSync(path.join(root, f)).isFile())
  .sort();
for (const f of files) console.log(`${f}\t${(await detect(new Uint8Array(fs.readFileSync(path.join(root, f))))).join(",")}`);
