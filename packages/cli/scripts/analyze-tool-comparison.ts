/**
 * Reads what `measure-tool-comparison.ts` wrote and prints the cuts an article
 * can quote. Separate from the measurement for the same reason its siblings are:
 * the measurement clones sixty repositories and runs four tools over each of
 * them, the cuts get argued about, and a reader checking a published number
 * should not have to spend an hour to do it.
 *
 * Every figure in the article comes out of here. Nothing is arithmetic done by
 * hand, and nothing is a number typed into a component as a prop.
 *
 * Three rules the cuts obey:
 *
 *  1. Report the distribution. One vendored monorepo moves a mean further than
 *     the finding is worth, so totals carry quantiles and the ratios are
 *     computed per repository and then summarised, never as a ratio of sums.
 *  2. A comparison is stated against a stated baseline. Every multiple here is
 *     "against this repository's smallest bundle", named, rather than against
 *     ours, which would make the whole page an advertisement.
 *  3. Cost and agreement are separate sections, because a tool that costs less
 *     because it dropped your tests has not saved you anything.
 *
 * Usage:
 *   pnpm --filter @fileconcat/cli analyze-tools
 *   pnpm --filter @fileconcat/cli analyze-tools --in ../../docs/measurements/tool-comparison-2026-09-09.json
 *
 * Flags:
 *   --in <file>  measurement JSON (default: the newest in docs/measurements)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const TOOLS = ["fileconcat", "repomix", "gitingest", "code2prompt"] as const;
type Tool = (typeof TOOLS)[number];

type Weight = { files: number; chars: number };
type ToolResult = { files: number; chars: number; tokens: number; seconds: number };
type Row = {
  url: string;
  commit?: string;
  pinned?: boolean;
  error?: string;
} & Partial<Record<Tool, ToolResult>> & {
    agreement?: {
      inAll: number;
      missedByUs: Record<string, Weight>;
      biggestMissed: { path: string; chars: number }[];
      onlyUs: Record<string, number>;
      missedPerTool: Record<string, Weight>;
    };
  };

type Report = {
  measured: string;
  tokenizer: string;
  versions: Record<string, string>;
  wrapperFloor: { contentTokens: number; wrapperTokens: Record<string, number> } | { error: string };
  repos: Row[];
};

type Measured = Row & Record<Tool, ToolResult> & { agreement: NonNullable<Row["agreement"]> };

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--") && argv[i + 1] && !argv[i + 1].startsWith("--")) {
      args[argv[i].slice(2)] = argv[i + 1];
    }
  }
  return args;
}

function newestReport(): string {
  const dir = path.join(REPO_ROOT, "docs", "measurements");
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^tool-comparison-.*\.json$/.test(f))
    .sort();
  const last = files.at(-1);
  if (!last) throw new Error(`no tool-comparison-*.json in ${dir}`);
  return path.join(dir, last);
}

/** Linear interpolation, sorted copy. Matches the sibling analyzers. */
function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const low = Math.floor(pos);
  const high = Math.ceil(pos);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (pos - low);
}

const num = (v: number) => Math.round(v).toLocaleString("en-US");
const short = (url: string) => url.replace("https://github.com/", "").replace(/\.git$/, "");
const line = (label: string, values: number[], fmt: (v: number) => string) =>
  `${label.padEnd(14)} p10 ${fmt(quantile(values, 0.1)).padStart(11)}  p25 ${fmt(quantile(values, 0.25)).padStart(11)}  ` +
  `med ${fmt(quantile(values, 0.5)).padStart(11)}  p75 ${fmt(quantile(values, 0.75)).padStart(11)}  ` +
  `p90 ${fmt(quantile(values, 0.9)).padStart(11)}  max ${fmt(Math.max(...values)).padStart(11)}`;

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inPath = args.in ? path.resolve(args.in) : newestReport();
  const report = JSON.parse(fs.readFileSync(inPath, "utf8")) as Report;
  const rows = report.repos.filter((r): r is Measured => !r.error && Boolean(r.agreement));

  const out: string[] = [];
  const say = (s = "") => out.push(s);

  say(`# ${path.basename(inPath)}`);
  say(`measured ${report.measured}, tokenizer ${report.tokenizer}`);
  say(`${rows.length} of ${report.repos.length} repositories measured`);
  for (const [tool, version] of Object.entries(report.versions)) say(`  ${tool}: ${version}`);

  const failed = report.repos.filter((r) => r.error);
  if (failed.length) {
    say(`\n${failed.length} failed:`);
    for (const r of failed) say(`  ${short(r.url)}: ${r.error?.split("\n")[0]}`);
  }

  say("\n## What the same repository costs, per tool");
  say("Tokens in the bundle each tool writes at its own defaults, over the same checkout.");
  for (const tool of TOOLS) {
    say(
      line(
        tool,
        rows.map((r) => r[tool].tokens),
        num,
      ),
    );
  }

  say("\n## Files each tool put in the bundle");
  for (const tool of TOOLS) {
    say(
      line(
        tool,
        rows.map((r) => r[tool].files),
        num,
      ),
    );
  }

  // Rule 2: the baseline is the cheapest bundle for that repository, named, so
  // no multiple in the article is measured against ourselves by default.
  say("\n## How much more than the cheapest bundle, per repository");
  const cheapest = (r: Measured) => Math.min(...TOOLS.map((t) => r[t].tokens));
  for (const tool of TOOLS) {
    const ratios = rows.map((r) => r[tool].tokens / cheapest(r));
    say(line(tool, ratios, (v) => `${v.toFixed(2)}x`));
  }
  const winner: Record<string, number> = {};
  for (const r of rows) {
    const best = TOOLS.reduce((a, b) => (r[a].tokens <= r[b].tokens ? a : b));
    winner[best] = (winner[best] ?? 0) + 1;
  }
  say(
    "cheapest bundle: " +
      TOOLS.map((t) => `${t} ${winner[t] ?? 0}/${rows.length}`).join(", "),
  );

  say("\n## The widest gap on a single repository");
  const spread = rows
    .map((r) => {
      const lo = cheapest(r);
      const hi = Math.max(...TOOLS.map((t) => r[t].tokens));
      return { url: r.url, lo, hi, ratio: hi / lo, biggest: r.agreement.biggestMissed[0] };
    })
    .sort((a, b) => b.ratio - a.ratio);
  for (const s of spread.slice(0, 5)) {
    say(
      `${short(s.url).padEnd(38)} ${s.ratio.toFixed(1)}x  ${num(s.lo)} to ${num(s.hi)}` +
        (s.biggest ? `  largest file we left out: ${s.biggest.path} (${num(s.biggest.chars)} chars)` : ""),
    );
  }

  say("\n## The wrapper, before any of your files");
  say("One directory, one 12-byte file. Everything above the content is preamble.");
  if ("wrapperTokens" in report.wrapperFloor) {
    const floor = report.wrapperFloor;
    for (const tool of TOOLS) {
      say(`${tool.padEnd(14)} ${num(floor.wrapperTokens[tool] ?? 0).padStart(6)} tokens`);
    }
    say(`(the file itself is ${floor.contentTokens} tokens)`);
    const worst = Math.max(...Object.values(floor.wrapperTokens));
    const medianBundle = quantile(
      rows.map((r) => Math.min(...TOOLS.map((t) => r[t].tokens))),
      0.5,
    );
    say(
      `the largest wrapper is ${num(worst)} tokens against a median bundle of ${num(medianBundle)}, ` +
        `which is ${((worst / medianBundle) * 100).toFixed(2)}%`,
    );
  } else {
    say(`not measured: ${report.wrapperFloor.error}`);
  }

  say("\n## What the tools disagree about");
  say("Paths a competitor bundled and we did not, attributed by our own walk.");
  const reasons = ["hidden", "defaultIgnore", "gitignore", "notText", "absent"];
  for (const reason of reasons) {
    const files = rows.reduce((a, r) => a + (r.agreement.missedByUs[reason]?.files ?? 0), 0);
    const chars = rows.reduce((a, r) => a + (r.agreement.missedByUs[reason]?.chars ?? 0), 0);
    say(`${reason.padEnd(14)} ${num(files).padStart(7)} files  ${num(chars).padStart(13)} chars`);
  }

  say("\nPer competitor, what it carried that we did not:");
  for (const tool of TOOLS) {
    if (tool === "fileconcat") continue;
    const files = rows.reduce((a, r) => a + (r.agreement.missedPerTool[tool]?.files ?? 0), 0);
    const chars = rows.reduce((a, r) => a + (r.agreement.missedPerTool[tool]?.chars ?? 0), 0);
    say(`${tool.padEnd(14)} ${num(files).padStart(7)} files  ${num(chars).padStart(13)} chars`);
  }

  // Two different claims, and an earlier version of this file printed one under
  // the other's label. Subset of the union is the weak one and it is nearly always
  // true; "every one of our paths was in all three others" is the strong one.
  const onlyUs = rows.reduce((a, r) => a + onlyUsOf(r), 0);
  const subsetOfUnion = rows.filter((r) => onlyUsOf(r) === 0).length;
  const inEveryOther = rows.filter((r) => r.agreement.inAll === r.fileconcat.files).length;
  say(
    `\nour bundle holds no path the other three all missed in ${subsetOfUnion} of ${rows.length} ` +
      `repositories, and ${num(onlyUs)} paths in total across the sample were ours alone`,
  );
  say(
    `every path we bundled was also bundled by all three of the others in ` +
      `${inEveryOther} of ${rows.length} repositories`,
  );

  say("\n## The single largest file we left out, by how often");
  const byName: Record<string, { n: number; chars: number }> = {};
  for (const r of rows) {
    const top = r.agreement.biggestMissed[0];
    if (!top) continue;
    const name = top.path.slice(top.path.lastIndexOf("/") + 1);
    byName[name] = { n: (byName[name]?.n ?? 0) + 1, chars: (byName[name]?.chars ?? 0) + top.chars };
  }
  for (const [name, v] of Object.entries(byName)
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 12)) {
    say(`${name.padEnd(32)} ${String(v.n).padStart(3)} repositories  ${num(v.chars).padStart(12)} chars`);
  }

  say("\n## How long each tool took");
  say(
    "NOT PUBLISHABLE as a speed comparison. Our CLI runs through tsx here, so every " +
      "row pays a TypeScript startup the three compiled tools never pay. The numbers " +
      "are kept because a tool nobody will wait for is a finding, and gitingest's max " +
      "is the one worth reading.",
  );
  for (const tool of TOOLS) {
    say(
      line(
        tool,
        rows.map((r) => r[tool].seconds),
        (v) => `${v.toFixed(2)}s`,
      ),
    );
  }

  process.stdout.write(out.join("\n") + "\n");
}

const onlyUsOf = (r: Measured) =>
  Object.values(r.agreement.onlyUs).reduce((s: number, n: number) => s + n, 0);

main();
