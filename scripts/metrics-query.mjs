#!/usr/bin/env node
// Read the product counters out of D1 (ADR-0014).
//
// ADR-0013 says rate limiting has to exist before a counter can justify roadmap
// work. The sibling of that rule is this file: a counter nobody can read
// justifies nothing either, and "run the query by hand each time" reliably means
// "never look".
//
// Zero dependencies: shells out to wrangler, which already holds the auth. The
// --config flag is not optional — local and remote D1 state is keyed by the
// config file path, so querying without it hits a different database.
//
// Usage:
//   node scripts/metrics-query.mjs [mode] [--days N] [--local]
//
// Modes:
//   overview    every section, briefly (default)
//   funnel      visits -> drops -> exports, by entry surface
//   runs        one row per run: files, bytes, duration, outcome
//   formats     what we could not read, by count and by bytes
//   sizes       exact distributions for drop size, bundle size, ingest time
//   ecosystems  which project types show up, from the marker list

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_DIR = join(REPO_ROOT, "apps", "web");
const CONFIG = join(WEB_DIR, "wrangler.jsonc");
const DB = "fileconcat-metrics";

const args = process.argv.slice(2);
const MODE = args.find((a) => !a.startsWith("-")) || "overview";
const LOCAL = args.includes("--local");
const daysArg = args.indexOf("--days");
const DAYS = daysArg !== -1 ? Number(args[daysArg + 1]) : 90;
const SINCE = Math.floor(Date.now() / 1000) - DAYS * 86400;

function sql(query) {
  const out = execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      DB,
      LOCAL ? "--local" : "--remote",
      "--config",
      CONFIG,
      "--json",
      "--command",
      query,
    ],
    { cwd: WEB_DIR, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  // wrangler prints a banner before the JSON payload on some versions.
  const start = out.indexOf("[");
  if (start === -1) throw new Error(`No JSON in wrangler output:\n${out}`);
  return JSON.parse(out.slice(start))[0].results;
}

const n = (v) => (v ?? 0).toLocaleString("en-US");
const bytes = (v) => {
  if (v === null || v === undefined) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let x = v;
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i += 1;
  }
  return `${x < 10 && i > 0 ? x.toFixed(1) : Math.round(x)} ${units[i]}`;
};
const pct = (a, b) => (b === 0 ? "-" : `${Math.round((a / b) * 100)}%`);
const plural = (count, word) => `${n(count)} ${word}${count === 1 ? "" : "s"}`;

function percentiles(values) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const at = (p) => s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))];
  return { n: s.length, p50: at(0.5), p90: at(0.9), max: s[s.length - 1] };
}

function heading(title) {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));
}

function funnel() {
  heading("Funnel, by entry surface");
  const rows = sql(`
    SELECT COALESCE(s.value, '(none)') AS surface,
           COUNT(DISTINCT e.page) AS visits,
           COUNT(DISTINCT CASE WHEN e.name='batch_size' THEN e.page END) AS dropped,
           COUNT(DISTINCT CASE WHEN e.name='output_taken' THEN e.page END) AS exported
    FROM events e
    LEFT JOIN events s ON s.page = e.page AND s.name = 'entry_surface'
    WHERE e.ts >= ${SINCE}
    GROUP BY surface ORDER BY visits DESC;`);
  if (rows.length === 0) return console.log("  no data in window");
  console.log("  surface".padEnd(30) + "visits   dropped        exported");
  for (const r of rows) {
    console.log(
      "  " +
        r.surface.padEnd(28) +
        String(r.visits).padStart(6) +
        String(r.dropped).padStart(6) +
        ` (${pct(r.dropped, r.visits)})`.padEnd(9) +
        String(r.exported).padStart(6) +
        ` (${pct(r.exported, r.visits)})`,
    );
  }
}

function runs() {
  heading("Runs");
  const rows = sql(`
    SELECT page, run,
           MAX(CASE WHEN name='batch_size' THEN n END) AS files,
           MAX(CASE WHEN name='batch_size' THEN b END) AS in_bytes,
           MAX(CASE WHEN name='ingest_ms' THEN n END) AS ms,
           MAX(CASE WHEN name='bundle_size' THEN b END) AS out_bytes,
           SUM(CASE WHEN name='output_taken' THEN 1 ELSE 0 END) AS exports
    FROM events WHERE run IS NOT NULL AND ts >= ${SINCE}
    GROUP BY page, run ORDER BY MIN(id) DESC LIMIT 40;`);
  if (rows.length === 0) return console.log("  no runs in window");
  console.log("  run".padEnd(14) + "files    in       out      ms     outcome");
  for (const r of rows) {
    console.log(
      "  " +
        `${r.page.slice(0, 8)}/${r.run}`.padEnd(13) +
        String(r.files ?? "-").padStart(5) +
        bytes(r.in_bytes).padStart(9) +
        bytes(r.out_bytes).padStart(9) +
        String(r.ms ?? "-").padStart(7) +
        "     " +
        (r.exports > 0 ? `exported x${r.exports}` : "ABANDONED"),
    );
  }
  const abandoned = rows.filter((r) => r.exports === 0).length;
  console.log(`\n  ${rows.length} runs, ${abandoned} abandoned (${pct(abandoned, rows.length)})`);
}

function formats() {
  heading("What we could not read");
  const rows = sql(`
    SELECT name, value, SUM(n) AS files, SUM(b) AS total_bytes,
           COUNT(DISTINCT page) AS visits
    FROM events
    WHERE name IN ('unreadable_ext','extract_failed','archive_unsupported','read_failed')
      AND ts >= ${SINCE}
    GROUP BY name, value ORDER BY visits DESC, files DESC;`);
  if (rows.length === 0) return console.log("  nothing failed to read in window");
  console.log("  counter".padEnd(22) + "value".padEnd(14) + "visits  files    bytes");
  for (const r of rows) {
    console.log(
      "  " +
        r.name.padEnd(21) +
        String(r.value ?? "-").padEnd(14) +
        String(r.visits).padStart(5) +
        String(n(r.files)).padStart(7) +
        bytes(r.total_bytes).padStart(9),
    );
  }
  console.log("\n  Ranked by distinct visits: one folder of images is one signal, not two hundred.");
}

function sizes() {
  heading("Distributions (exact, not bucketed)");
  const specs = [
    ["files per drop", "SELECT n AS v FROM events WHERE name='batch_size' AND n IS NOT NULL", n],
    ["bytes per drop", "SELECT b AS v FROM events WHERE name='batch_size' AND b IS NOT NULL", bytes],
    ["bundle bytes", "SELECT b AS v FROM events WHERE name='bundle_size' AND b IS NOT NULL", bytes],
    ["largest file", "SELECT b AS v FROM events WHERE name='max_file_bytes' AND b IS NOT NULL", bytes],
    ["ingest ms", "SELECT n AS v FROM events WHERE name='ingest_ms' AND n IS NOT NULL", n],
    // Only dropped folders are walked, so this counts fewer runs than the row
    // above. The wait someone sat through is the two added together.
    ["folder walk ms", "SELECT n AS v FROM events WHERE name='scan_ms' AND n IS NOT NULL", n],
  ];
  console.log("  measure".padEnd(20) + "count      p50        p90        max");
  for (const [label, query, fmt] of specs) {
    const rows = sql(`${query} AND ts >= ${SINCE};`);
    const p = percentiles(rows.map((r) => r.v));
    if (!p) {
      console.log("  " + label.padEnd(18) + "    no data");
      continue;
    }
    console.log(
      "  " +
        label.padEnd(18) +
        String(p.n).padStart(5) +
        fmt(p.p50).padStart(11) +
        fmt(p.p90).padStart(11) +
        fmt(p.max).padStart(11),
    );
  }

  const over = sql(
    `SELECT value, SUM(n) AS files, COUNT(DISTINCT page) AS visits FROM events
     WHERE name='files_over' AND ts >= ${SINCE} GROUP BY value ORDER BY visits DESC;`,
  );
  if (over.length > 0) {
    console.log("\n  Files above a threshold (cumulative: a 40 MB file counts in all three)");
    for (const r of over) {
      console.log(
        `    over ${String(r.value).padEnd(6)} ${plural(r.files, "file")} across ${plural(r.visits, "visit")}`,
      );
    }
  }
}

function ecosystems() {
  heading("Ecosystems and file types");
  const markers = sql(
    `SELECT value, COUNT(DISTINCT page || '/' || run) AS runs FROM events
     WHERE name='marker' AND ts >= ${SINCE} GROUP BY value ORDER BY runs DESC LIMIT 20;`,
  );
  if (markers.length === 0) console.log("  no markers seen");
  for (const r of markers) console.log("  " + String(r.value).padEnd(24) + plural(r.runs, "run"));

  const ext = sql(
    `SELECT value, SUM(n) AS files, SUM(b) AS total_bytes, COUNT(DISTINCT page || '/' || run) AS runs
     FROM events WHERE name='file_ext' AND ts >= ${SINCE}
     GROUP BY value ORDER BY runs DESC, files DESC LIMIT 20;`,
  );
  if (ext.length > 0) {
    console.log("\n  extension".padEnd(24) + "runs   files      bytes");
    for (const r of ext) {
      console.log(
        "  " +
          String(r.value).padEnd(20) +
          String(r.runs).padStart(5) +
          String(n(r.files)).padStart(8) +
          bytes(r.total_bytes).padStart(11),
      );
    }
    console.log("\n  `other` is the folded tail past the per-run cap, not a real extension.");
  }
}

const MODES = { funnel, runs, formats, sizes, ecosystems };

async function main() {
  const scope = LOCAL ? "local" : "remote";
  console.log(`fileconcat counters — ${scope}, last ${DAYS} days (since ts ${SINCE})`);

  const total = sql(`SELECT COUNT(*) AS c FROM events WHERE ts >= ${SINCE};`)[0].c;
  console.log(`${n(total)} rows in window`);
  if (total === 0) {
    console.log("\nNothing recorded yet in this window.");
    return;
  }

  if (MODE === "overview") {
    funnel();
    sizes();
    formats();
    ecosystems();
    return;
  }
  const fn = MODES[MODE];
  if (!fn) {
    console.error(`Unknown mode "${MODE}". One of: overview, ${Object.keys(MODES).join(", ")}`);
    process.exit(1);
  }
  fn();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
