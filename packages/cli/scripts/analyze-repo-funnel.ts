/**
 * Reads what `measure-repo-funnel.ts` wrote and prints the cuts an article can
 * quote. Separate from the measurement on purpose: the measurement is expensive
 * and runs once, the cuts get argued about and rerun many times, and a reader
 * who wants to check a published number should not have to clone 60 repositories
 * to do it.
 *
 * Every figure the article prints comes out of here, so nothing in it is
 * arithmetic done by hand. The rule that shapes the whole file: **a share is
 * always stated against the stage or the unit it came from.** Files and tokens
 * disagree about what the default filters remove, and that disagreement is the
 * finding rather than a rounding detail, so the two are never mixed into one
 * number.
 *
 * The language and size labels are not in the measurement. They are joined back
 * from the sample file's section comments, which is why the sample file is
 * tracked next to the script instead of living in a scratch directory.
 *
 * Usage:
 *   pnpm --filter @fileconcat/cli analyze-funnel
 *   pnpm --filter @fileconcat/cli analyze-funnel --in ../../docs/measurements/repo-funnel-2026-09-07.json
 *
 * Flags:
 *   --in <file>      measurement JSON (default: the newest in docs/measurements)
 *   --sample <file>  sample list, for the language and size join (default: the
 *                    `sampleFile` the measurement recorded)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { CATEGORIES } from "./categories.js";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

type Bucket = { files: number; tokens: number };
type Row = {
  url: string;
  commit?: string;
  stages?: { found: number; textEligible: number; kept: number };
  tokens?: {
    bundle: number;
    counted: number;
    perFileSum: number;
    shownBefore: number;
    shownAfter: number;
  };
  chars?: { contents: number; bundle: number };
  categories?: Record<string, Bucket & { excluded: boolean }>;
  excludedBy?: Record<string, Bucket>;
  skipped?: { oversize: number; unreadable: number; unextractable: number };
  error?: string;
};
type Measured = Required<Omit<Row, "error">>;
type Report = {
  measured: string;
  tokenizer: string;
  sampleFile: string;
  repos: Row[];
  aggregate: {
    categoryTotals: Record<string, Bucket & { excluded: boolean }>;
    excludedByTotals: Record<string, Bucket>;
  };
};

/** Windows worth checking a bundle against. Not a catalogue, just the round ones. */
const WINDOWS = [128_000, 200_000, 1_000_000, 2_000_000];

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!flag.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) args[flag.slice(2)] = next;
  }
  return args;
}

function newestMeasurement(): string {
  const dir = path.join(REPO_ROOT, "docs", "measurements");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("repo-funnel-") && f.endsWith(".json"))
    .sort();
  const last = files.at(-1);
  if (!last) throw new Error(`no repo-funnel-*.json in ${dir}`);
  return path.join(dir, last);
}

/** Linear interpolation, sorted copy. Matches the measurement's own quantile. */
function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const low = Math.floor(pos);
  const high = Math.ceil(pos);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (pos - low);
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const num = (v: number) => Math.round(v).toLocaleString("en-US");
const short = (url: string) => url.replace("https://github.com/", "").replace(/\.git$/, "");
const line = (label: string, values: number[], fmt: (v: number) => string) =>
  `${label.padEnd(22)} p10 ${fmt(quantile(values, 0.1)).padStart(9)}  p25 ${fmt(quantile(values, 0.25)).padStart(9)}  ` +
  `med ${fmt(quantile(values, 0.5)).padStart(9)}  p75 ${fmt(quantile(values, 0.75)).padStart(9)}  ` +
  `p90 ${fmt(quantile(values, 0.9)).padStart(9)}  max ${fmt(Math.max(...values)).padStart(9)}`;

/** Tokens in the files the defaults left standing, and in everything readable. */
const keptTokens = (r: Measured) =>
  Object.values(r.categories).reduce((sum, c) => sum + (c.excluded ? 0 : c.tokens), 0);
const allTokens = (r: Measured) =>
  Object.values(r.categories).reduce((sum, c) => sum + c.tokens, 0);
const categoryShare = (r: Measured, category: string) => {
  const kept = keptTokens(r);
  return kept ? (r.categories[category]?.tokens ?? 0) / kept : 0;
};

/**
 * Language and size band per URL, read from the sample file's `# --- X / Y ---`
 * section comments. The measurement deliberately does not record them: it takes
 * a list of URLs and nothing else, so the strata stay a property of the sample
 * rather than something the measurement could silently disagree with.
 */
function readStrata(samplePath: string) {
  const strata = new Map<string, { language: string; band: string }>();
  let language = "";
  let band = "";
  for (const raw of fs.readFileSync(samplePath, "utf-8").split("\n")) {
    const text = raw.trim();
    const header = /^# --- (.+) \/ (.+) ---$/.exec(text);
    if (header) {
      language = header[1];
      band = header[2];
      continue;
    }
    if (text.startsWith("https")) strata.set(text, { language, band });
  }
  return strata;
}

function groupBy(rows: Measured[], key: (r: Measured) => string) {
  const groups = new Map<string, Measured[]>();
  for (const row of rows) {
    const k = key(row);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(row);
  }
  return groups;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inPath = args.in ?? newestMeasurement();
  const report = JSON.parse(fs.readFileSync(inPath, "utf-8")) as Report;
  const rows = report.repos.filter((r): r is Measured => !r.error);
  const failed = report.repos.length - rows.length;

  // The measurement stores `sampleFile` exactly as it was typed, which is
  // normally relative to the CLI package it ran from. Try the bases it could
  // have been relative to rather than guessing one.
  const samplePath =
    args.sample ??
    [path.join(REPO_ROOT, "packages", "cli"), REPO_ROOT, path.dirname(inPath)]
      .map((base) => path.resolve(base, report.sampleFile))
      .find((candidate) => fs.existsSync(candidate));
  const strata = samplePath && fs.existsSync(samplePath) ? readStrata(samplePath) : new Map();
  const unjoined = rows.filter((r) => !strata.has(r.url)).length;

  const out: string[] = [];
  const say = (s = "") => out.push(s);

  say(`# ${path.basename(inPath)}`);
  say(`measured ${report.measured}, tokenizer ${report.tokenizer}`);
  say(`${rows.length} repositories measured, ${failed} failed, ${unjoined} not joined to a stratum`);

  say("\n## The funnel, pooled over every repository");
  const pooled = (pick: (r: Measured) => number) => rows.reduce((sum, r) => sum + pick(r), 0);
  const found = pooled((r) => r.stages.found);
  const eligible = pooled((r) => r.stages.textEligible);
  const kept = pooled((r) => r.stages.kept);
  say(`files found        ${num(found).padStart(12)}`);
  say(`text eligible      ${num(eligible).padStart(12)}   ${pct(eligible / found)} of found`);
  say(`kept by defaults   ${num(kept).padStart(12)}   ${pct(kept / eligible)} of eligible, ${pct(kept / found)} of found`);
  const contents = pooled((r) => r.tokens.counted);
  const bundles = pooled((r) => r.tokens.bundle);
  say(`content tokens     ${num(contents).padStart(12)}   the text of the kept files`);
  say(`bundle tokens      ${num(bundles).padStart(12)}   what gets pasted, wrapper and tree included`);

  say("\n## Per repository, so one monorepo cannot carry the finding");
  say(line("files found", rows.map((r) => r.stages.found), num));
  say(line("text eligible share", rows.map((r) => r.stages.textEligible / r.stages.found), pct));
  say(line("kept share, files", rows.map((r) => r.stages.kept / r.stages.found), pct));
  say(line("dropped share, tokens", rows.map((r) => 1 - keptTokens(r) / allTokens(r)), pct));
  say(line("content tokens", rows.map((r) => r.tokens.counted), num));
  say(line("bundle tokens", rows.map((r) => r.tokens.bundle), num));
  // The token-drop percentiles are skewed hard enough that the median alone
  // reads as "the filters do nothing". These two counts say how many
  // repositories sit at each end of it.
  const droppedShare = (r: Measured) => 1 - keptTokens(r) / allTokens(r);
  say(
    `repositories losing more than 10% of tokens: ${rows.filter((r) => droppedShare(r) > 0.1).length}/${rows.length}, ` +
      `losing nothing at all: ${rows.filter((r) => droppedShare(r) === 0).length}/${rows.length}`,
  );

  say("\n## What the wrapper costs");
  say("The bundle carries an XML root, a per-file tag, a header and a file");
  say("tree. This is what that adds on top of the file contents.");
  say(line("wrapper overhead", rows.map((r) => r.tokens.bundle / r.tokens.counted - 1), pct));
  say("Adding up per-file counts instead of tokenizing the joined text gets a");
  say("different answer, because every join merges tokens at the boundary:");
  say(line("per-file sum error", rows.map((r) => r.tokens.perFileSum / r.tokens.counted - 1), pct));

  say("\n## The second drop, counted twice");
  say("The same exclusions, once by file and once by token. They do not agree,");
  say("and which one is quoted decides what the sentence means.");
  const eb = report.aggregate.excludedByTotals;
  const ebFiles = Object.values(eb).reduce((a, b) => a + b.files, 0);
  const ebTokens = Object.values(eb).reduce((a, b) => a + b.tokens, 0);
  for (const [reason, value] of Object.entries(eb)) {
    const hit = rows.filter((r) => (r.excludedBy[reason]?.files ?? 0) > 0).length;
    say(
      `${reason.padEnd(14)} ${pct(value.files / ebFiles).padStart(7)} of excluded files, ` +
        `${pct(value.tokens / ebTokens).padStart(7)} of excluded tokens, fired in ${hit}/${rows.length} repos`,
    );
  }

  say("\n## What the bundle is made of, pooled by token");
  const cats = report.aggregate.categoryTotals;
  const total = Object.values(cats).reduce((a, b) => a + b.tokens, 0);
  const keptTotal = Object.values(cats).reduce((a, b) => a + (b.excluded ? 0 : b.tokens), 0);
  for (const [key, value] of Object.entries(cats).sort((a, b) => b[1].tokens - a[1].tokens)) {
    say(
      `${key.padEnd(20)} ${String(value.files).padStart(6)} files  ${num(value.tokens).padStart(12)} tk  ` +
        `${pct(value.tokens / total).padStart(7)} of all  ` +
        `${(value.excluded ? "-" : pct(value.tokens / keptTotal)).padStart(7)} of kept`,
    );
  }

  say("\n## Composition per repository, share of kept tokens");
  for (const category of CATEGORIES) {
    say(line(category, rows.map((r) => categoryShare(r, category)), pct));
  }

  say("\n## Is the reader told what they will pay for");
  say("Both figures scored against the assembled bundle, the thing that gets");
  say("pasted. Negative means the reader is shown fewer tokens than they cost.");
  say("Before: file contents only, forecast as characters / 4 above 1 MiB.");
  say("After: the whole bundle, extrapolated from tokenized samples above 1 MiB.");
  const before = (r: Measured) => (r.tokens.shownBefore - r.tokens.bundle) / r.tokens.bundle;
  const after = (r: Measured) => (r.tokens.shownAfter - r.tokens.bundle) / r.tokens.bundle;
  say(line("error before", rows.map(before), pct));
  say(line("error after", rows.map(after), pct));
  const worst = (fn: (r: Measured) => number) => Math.max(...rows.map((r) => Math.abs(fn(r))));
  say(`worst case: ${pct(worst(before))} before, ${pct(worst(after))} after`);
  const within = (fn: (r: Measured) => number, bound: number) =>
    rows.filter((r) => Math.abs(fn(r)) <= bound).length;
  say(`within 1% of the truth: ${within(before, 0.01)}/${rows.length} before, ${within(after, 0.01)}/${rows.length} after`);
  // The two forecasts only differ above the 1 MiB threshold. Scored over all 60
  // the improvement is diluted by the 30 that were exact either way, so the
  // subset gets its own cut: signed percentiles hide it too, because the old
  // ratio ran high on some repositories and low on others.
  const crossed = rows.filter((r) => r.tokens.shownAfter !== r.tokens.bundle);
  say(`${crossed.length}/${rows.length} repositories are big enough to be estimated rather than counted`);
  say(line("abs error before, est", crossed.map((r) => Math.abs(before(r))), pct));
  say(line("abs error after, est", crossed.map((r) => Math.abs(after(r))), pct));
  const withinEst = (fn: (r: Measured) => number, bound: number) =>
    crossed.filter((r) => Math.abs(fn(r)) <= bound).length;
  say(
    `within 5% of the truth, estimated only: ${withinEst(before, 0.05)}/${crossed.length} before, ` +
      `${withinEst(after, 0.05)}/${crossed.length} after`,
  );
  for (const r of [...rows].sort((a, b) => before(a) - before(b)).slice(0, 5)) {
    say(
      `  ${short(r.url).padEnd(45)} true ${num(r.tokens.bundle).padStart(11)}  ` +
        `before ${pct(before(r)).padStart(8)}  after ${pct(after(r)).padStart(7)}`,
    );
  }

  say("\n## Bundles against context windows");
  say("Measured on the assembled bundle, which is what a window has to hold.");
  for (const window of WINDOWS) {
    const fits = rows.filter((r) => r.tokens.bundle <= window).length;
    say(`${num(window).padStart(11)}  ${fits}/${rows.length} repositories fit (${pct(fits / rows.length)})`);
  }

  if (strata.size > 0) {
    const joined = rows.filter((r) => strata.has(r.url));
    say("\n## By language, medians");
    say("n is small per language. This is a spread check, not a league table.");
    for (const [language, group] of groupBy(joined, (r) => strata.get(r.url)!.language)) {
      say(
        `${language.padEnd(12)} n=${group.length}  ` +
          `kept ${pct(quantile(group.map((r) => r.stages.kept / r.stages.found), 0.5)).padStart(7)}  ` +
          `tk ${num(quantile(group.map((r) => r.tokens.bundle), 0.5)).padStart(10)}  ` +
          `source ${pct(quantile(group.map((r) => categoryShare(r, "source")), 0.5)).padStart(7)}  ` +
          `tests ${pct(quantile(group.map((r) => categoryShare(r, "tests")), 0.5)).padStart(7)}`,
      );
    }

    say("\n## By repository size band, medians");
    for (const [band, group] of groupBy(joined, (r) => strata.get(r.url)!.band)) {
      say(
        `${band.padEnd(12)} n=${group.length}  ` +
          `kept ${pct(quantile(group.map((r) => r.stages.kept / r.stages.found), 0.5)).padStart(7)}  ` +
          `tk ${num(quantile(group.map((r) => r.tokens.bundle), 0.5)).padStart(10)}  ` +
          `max ${num(Math.max(...group.map((r) => r.tokens.bundle))).padStart(10)}`,
      );
    }
  }

  say("\n## Outliers, named so they can be checked");
  const top = (label: string, pick: (r: Measured) => number, fmt: (v: number) => string, desc = true) => {
    const sorted = [...rows].sort((a, b) => (desc ? pick(b) - pick(a) : pick(a) - pick(b)));
    say(`${label}: ${sorted.slice(0, 5).map((r) => `${short(r.url)} ${fmt(pick(r))}`).join(", ")}`);
  };
  top("highest docs share", (r) => categoryShare(r, "docs"), pct);
  top("highest tests share", (r) => categoryShare(r, "tests"), pct);
  top("lowest kept share", (r) => r.stages.kept / r.stages.found, pct, false);
  top("largest bundles", (r) => r.tokens.bundle, num);
  // The wrapper share is a function of how many files it has to tag, so the
  // worst repositories are the ones with many small files rather than big ones.
  top("highest wrapper overhead", (r) => r.tokens.bundle / r.tokens.counted - 1, pct);
  say(
    `files kept in those: ${[...rows]
      .sort((a, b) => b.tokens.bundle / b.tokens.counted - a.tokens.bundle / a.tokens.counted)
      .slice(0, 5)
      .map((r) => `${short(r.url)} ${r.stages.kept}`)
      .join(", ")}`,
  );

  say("\n## Files the walk could not use");
  const skipped = rows.reduce(
    (acc, r) => ({
      oversize: acc.oversize + r.skipped.oversize,
      unreadable: acc.unreadable + r.skipped.unreadable,
      unextractable: acc.unextractable + r.skipped.unextractable,
    }),
    { oversize: 0, unreadable: 0, unextractable: 0 },
  );
  say(
    `oversize ${skipped.oversize}, unreadable ${skipped.unreadable}, ` +
      `unextractable ${skipped.unextractable}, out of ${num(found)} walked`,
  );

  process.stdout.write(out.join("\n") + "\n");
}

main();
