/**
 * Reads what `measure-bundle-overhead.ts` wrote and prints the cuts an article
 * or an experiment design can quote. Separate from the measurement for the same
 * reason the funnel analysis is: the measurement clones 60 repositories and runs
 * once, the cuts get argued about and rerun many times.
 *
 * Two rules shape the output.
 *
 * A share is always stated against the thing it is a share of. A component's
 * share of the bundle and its share of the overhead are different numbers with
 * different meanings, and the tree is the component where they disagree most,
 * so both are printed and both are labelled.
 *
 * Shares and absolute counts are never mixed. The tree is a small share of a
 * large bundle and a large share of a small one; per repository the two orders
 * are almost reversed. Any sentence taken from here has to say which unit it is
 * in.
 *
 * Usage:
 *   pnpm --filter @fileconcat/cli analyze-overhead
 *   pnpm --filter @fileconcat/cli analyze-overhead --in ../../docs/measurements/bundle-overhead-2026-09-07.json
 *
 * Flags:
 *   --in <file>  measurement JSON (default: the newest bundle-overhead-*.json)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const COMPONENTS = ["header", "tree", "markers", "chrome"] as const;
type Component = (typeof COMPONENTS)[number] | "content";
type Totals = Record<Component, number>;

type StyleRow = {
  bundleTokens: number;
  bundleChars: number;
  inPlace: Totals;
  isolated: Totals;
  residual: number;
};
type Row = {
  url: string;
  commit?: string;
  pinned?: boolean;
  stages?: { found: number; textEligible: number; kept: number };
  contentTokens?: number;
  contentJoinedTokens?: number;
  styles?: Record<string, StyleRow>;
  error?: string;
};
type Measured = Required<Omit<Row, "error">>;
type Report = {
  measured: string;
  tokenizer: string;
  sampleFile: string;
  pinsFile: string;
  styles: string[];
  repos: Row[];
};

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
    .filter((f) => f.startsWith("bundle-overhead-") && f.endsWith(".json"))
    .sort();
  const last = files.at(-1);
  if (!last) throw new Error(`no bundle-overhead-*.json in ${dir}`);
  return path.join(dir, last);
}

/** Linear interpolation, sorted copy. Matches the funnel analysis exactly. */
function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const low = Math.floor(pos);
  const high = Math.ceil(pos);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (pos - low);
}

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
const num = (v: number) => Math.round(v).toLocaleString("en-US");
const short = (url: string) => url.replace("https://github.com/", "").replace(/\.git$/, "");
const line = (label: string, values: number[], fmt: (v: number) => string) =>
  `${label.padEnd(20)} p10 ${fmt(quantile(values, 0.1)).padStart(9)}  p25 ${fmt(quantile(values, 0.25)).padStart(9)}  ` +
  `med ${fmt(quantile(values, 0.5)).padStart(9)}  p75 ${fmt(quantile(values, 0.75)).padStart(9)}  ` +
  `p90 ${fmt(quantile(values, 0.9)).padStart(9)}  max ${fmt(Math.max(...values)).padStart(9)}`;

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inPath = args.in ?? newestMeasurement();
  const report = JSON.parse(fs.readFileSync(inPath, "utf-8")) as Report;
  const rows = report.repos.filter((r): r is Measured => !r.error);
  const failed = report.repos.length - rows.length;
  const unpinned = rows.filter((r) => r.pinned === false);
  const styles = report.styles;

  const out: string[] = [];
  const say = (s = "") => out.push(s);

  const at = (r: Measured, style: string) => r.styles[style];
  const overhead = (r: Measured, style: string) => at(r, style).bundleTokens - at(r, style).inPlace.content;
  const shareOfBundle = (r: Measured, style: string, c: Component) =>
    at(r, style).inPlace[c] / at(r, style).bundleTokens;
  const shareOfOverhead = (r: Measured, style: string, c: Component) =>
    at(r, style).inPlace[c] / overhead(r, style);
  const pooled = (pick: (r: Measured) => number) => rows.reduce((sum, r) => sum + pick(r), 0);

  say(`# ${path.basename(inPath)}`);
  say(`measured ${report.measured}, tokenizer ${report.tokenizer}`);
  say(`sample ${report.sampleFile}, commits pinned from ${report.pinsFile}`);
  say(`${rows.length} repositories measured, ${failed} failed, ${unpinned.length} measured at HEAD instead of the pin`);
  if (unpinned.length) say(`  unpinned: ${unpinned.map((r) => short(r.url)).join(", ")}`);
  say();
  say("Every component figure below is the in-place attribution: the bundle is");
  say("tokenized once and each token charged to the component owning the byte it");
  say("starts at, so the components sum to the bundle with nothing left over.");
  say("The isolated attribution is reported once, at the end, as a check.");

  for (const style of styles) {
    say(`\n## ${style}, pooled over every repository, in tokens`);
    const bundle = pooled((r) => at(r, style).bundleTokens);
    const content = pooled((r) => at(r, style).inPlace.content);
    say(`bundle             ${num(bundle).padStart(13)}`);
    say(`content            ${num(content).padStart(13)}   ${pct(content / bundle)} of the bundle`);
    const over = bundle - content;
    say(`overhead           ${num(over).padStart(13)}   ${pct(over / bundle)} of the bundle`);
    for (const c of COMPONENTS) {
      const total = pooled((r) => at(r, style).inPlace[c]);
      say(
        `  ${c.padEnd(16)} ${num(total).padStart(13)}   ${pct(total / bundle).padStart(7)} of the bundle, ` +
          `${pct(total / over).padStart(7)} of the overhead`,
      );
    }
    say(
      "Pooling weights every repository by its size, so these are the shares of one",
    );
    say("giant bundle rather than the share a typical repository pays. Percentiles next.");
  }

  for (const style of styles) {
    say(`\n## ${style}, per repository, each component as a share of that repository's bundle`);
    say(line("overhead", rows.map((r) => overhead(r, style) / at(r, style).bundleTokens), pct));
    for (const c of COMPONENTS) {
      say(line(`  ${c}`, rows.map((r) => shareOfBundle(r, style, c)), pct));
    }
    say(`\n## ${style}, per repository, each component in absolute tokens`);
    say(line("bundle", rows.map((r) => at(r, style).bundleTokens), num));
    say(line("overhead", rows.map((r) => overhead(r, style)), num));
    for (const c of COMPONENTS) {
      say(line(`  ${c}`, rows.map((r) => at(r, style).inPlace[c]), num));
    }
  }

  say("\n## The file tree, the component the next experiment has to size");
  say("Both units, side by side, because they tell opposite stories: the tree is");
  say("a small share of a large bundle and a large share of a small one.");
  for (const style of styles) {
    say(`\n${style}`);
    say(line("  share of bundle", rows.map((r) => shareOfBundle(r, style, "tree")), pct));
    say(line("  share of overhead", rows.map((r) => shareOfOverhead(r, style, "tree")), pct));
    say(line("  tokens", rows.map((r) => at(r, style).inPlace.tree), num));
  }
  const treeStyle = styles[0];
  const treeShares = rows.map((r) => shareOfBundle(r, treeStyle, "tree"));
  const over1 = treeShares.filter((v) => v > 0.01).length;
  const over3 = treeShares.filter((v) => v > 0.03).length;
  say(
    `\nIn ${treeStyle}: the tree is over 1% of the bundle in ${over1}/${rows.length} repositories, ` +
      `over 3% in ${over3}/${rows.length}.`,
  );
  say(
    `Pooled, the tree is ${pct(pooled((r) => at(r, treeStyle).inPlace.tree) / pooled((r) => at(r, treeStyle).bundleTokens))} ` +
      `of all bundle tokens and ${pct(pooled((r) => at(r, treeStyle).inPlace.tree) / pooled((r) => overhead(r, treeStyle)))} of all overhead.`,
  );

  say("\n## What one more file costs, in tokens of marker");
  say("Markers are the one component that scales with file count rather than");
  say("file size, which is why the worst overhead is many small files.");
  for (const style of styles) {
    const perFile = rows.map((r) => at(r, style).inPlace.markers / r.stages.kept);
    say(line(style, perFile, (v) => v.toFixed(1)));
  }
  say(line("files kept", rows.map((r) => r.stages.kept), num));

  say("\n## The three styles against each other");
  say("Same trees, same contents, three wrappers. Overhead as a share of the");
  say("bundle, per repository.");
  for (const style of styles) {
    say(line(style, rows.map((r) => overhead(r, style) / at(r, style).bundleTokens), pct));
  }
  say("And pooled, in absolute tokens over all 60 bundles:");
  for (const style of styles) {
    say(`${style.padEnd(10)} ${num(pooled((r) => overhead(r, style))).padStart(12)} tokens of overhead`);
  }

  say("\n## The attribution check");
  say("The same components tokenized in isolation and added up, against the");
  say("bundle tokenized whole. Negative means splitting the string forced token");
  say("boundaries the tokenizer would not have chosen, so isolation over-counts.");
  for (const style of styles) {
    say(
      line(
        style,
        rows.map((r) => at(r, style).residual / at(r, style).bundleTokens),
        pct,
      ),
    );
  }
  for (const style of styles) {
    const pooledResidual = pooled((r) => at(r, style).residual);
    const pooledBundle = pooled((r) => at(r, style).bundleTokens);
    const markerGap = pooled((r) => at(r, style).isolated.markers - at(r, style).inPlace.markers);
    const files = pooled((r) => r.stages.kept);
    say(
      `${style.padEnd(10)} pooled residual ${num(pooledResidual).padStart(9)} tokens, ` +
        `${pct(Math.abs(pooledResidual) / pooledBundle)} of the pooled bundle; ` +
        `${num(markerGap)} of it is markers, ${(markerGap / files).toFixed(2)} per file`,
    );
  }

  say("\n## What each arm of the wrapper experiment would remove");
  say("One row per component, in the default style. `saves` is what deleting");
  say("that component takes off the bundle, per repository. An arm is worth");
  say("paying for on cost grounds if the saving is large enough to change what");
  say("fits in a window; it is worth paying for on accuracy grounds only if the");
  say("component might be doing work, which this measurement cannot say.");
  for (const c of COMPONENTS) {
    const shares = rows.map((r) => shareOfBundle(r, treeStyle, c));
    const tokens = rows.map((r) => at(r, treeStyle).inPlace[c]);
    say(
      `${c.padEnd(10)} saves med ${pct(quantile(shares, 0.5)).padStart(7)} of the bundle ` +
        `(p90 ${pct(quantile(shares, 0.9))}, max ${pct(Math.max(...shares))}), ` +
        `med ${num(quantile(tokens, 0.5))} tokens (max ${num(Math.max(...tokens))})`,
    );
  }
  say("markers is listed for size only. Removing it is not a cost decision:");
  say("without a path marker the bundle stops being able to answer which file");
  say("defines a thing, so that arm tests a different product, not a cheaper one.");

  say("\n## Outliers, named so they can be checked");
  const top = (label: string, pick: (r: Measured) => number, fmt: (v: number) => string) => {
    const sorted = [...rows].sort((a, b) => pick(b) - pick(a));
    say(`${label}: ${sorted.slice(0, 5).map((r) => `${short(r.url)} ${fmt(pick(r))}`).join(", ")}`);
  };
  top("highest tree share", (r) => shareOfBundle(r, treeStyle, "tree"), pct);
  top("most tree tokens", (r) => at(r, treeStyle).inPlace.tree, num);
  top("highest marker share", (r) => shareOfBundle(r, treeStyle, "markers"), pct);
  top("highest overhead share", (r) => overhead(r, treeStyle) / at(r, treeStyle).bundleTokens, pct);

  process.stdout.write(out.join("\n") + "\n");
}

main();
