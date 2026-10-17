/**
 * Writes a rerun into apps/web/src/data/benchmarks.json: for every chart id in
 * a bench-<study>-<version>.json, a "FileConcat <version>" row, and the chart's
 * `measured` date. Older rows stay as they are, so each chart keeps its
 * history; a second run at the same version replaces that version's row.
 * `recomputed` replaces a chart's rows whole, for rank charts ("densest in N of
 * 60 repositories") where a new run moves every tool's count.
 *
 * usage: node packages/cli/scripts/bench/add-rows.mjs docs/measurements/bench-*-2.6.json
 */
import * as fs from "node:fs";

const FILE = "apps/web/src/data/benchmarks.json";
const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
const charts = new Map(data.sections.flatMap((s) => s.charts).map((c) => [c.id, c]));

for (const path of process.argv.slice(2)) {
  const run = JSON.parse(fs.readFileSync(path, "utf8"));
  const label = `FileConcat ${run.version}`;
  const chart = (id) => {
    const c = charts.get(id);
    if (!c) throw new Error(`${path}: no chart "${id}" in ${FILE}`);
    c.measured = run.measured;
    return c;
  };
  for (const [id, value] of Object.entries(run.rows ?? {})) {
    const c = chart(id);
    c.rows = [{ label, value }, ...c.rows.filter((r) => r.label !== label)];
  }
  for (const [id, rows] of Object.entries(run.recomputed ?? {})) chart(id).rows = rows;
  console.log(`${path}: ${Object.keys(run.rows ?? {}).length + Object.keys(run.recomputed ?? {}).length} charts at ${label}`);
}

fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n");
