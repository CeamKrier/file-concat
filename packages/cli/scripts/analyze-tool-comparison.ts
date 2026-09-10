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
 *   --against <file>[,<file>]  earlier runs to diff bundle sizes against, per tool and repository
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { CATEGORIES, categorize, isHidden } from "./categories.js";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const TOOLS = ["fileconcat", "repomix", "gitingest", "code2prompt"] as const;
type Tool = (typeof TOOLS)[number];

type Weight = { files: number; chars: number };
type ToolResult = {
  files: number;
  chars: number;
  tokens: number;
  seconds: number;
  collisions?: Weight & { tokens: number };
  listedOnly?: Weight & { tokens: number };
};
/** [path, tokens, category, hidden, kind, tools], see the measurement's method notes. */
type PathRow = [string, number, string, boolean, string, Tool[]];
type Row = {
  url: string;
  commit?: string;
  pinned?: boolean;
  error?: string;
} & Partial<Record<Tool, ToolResult>> & {
    paths?: PathRow[];
    roundTrip?: { markers: number; kept: number };
    agreement?: {
      inAll: number;
      missedByUs: Record<string, Weight>;
      biggestMissed: { path: string; chars: number }[];
      onlyUs: Record<string, number>;
      missedPerTool: Record<string, Weight>;
    };
  };

type Probe = Record<string, { listed: boolean; text: boolean }>;
type Report = {
  measured: string;
  tokenizer: string;
  versions: Record<string, string>;
  wrapperFloor: { contentTokens: number; wrapperTokens: Record<string, number> } | { error: string };
  documentFixture?:
    | { files: Record<string, string>; tokens: Record<string, number>; results: Record<string, Probe> }
    | { error: string };
  repos: Row[];
};

const NOISE = new Set(["lockfiles", "generated", "vendored"]);
const P = { path: 0, tokens: 1, category: 2, hidden: 3, kind: 4, tools: 5 } as const;

/** The bucket a composition figure shows a path under: documents leave their category. */
const bucket = (p: PathRow) => (p[P.kind] === "document" ? "documents" : p[P.category]);
/** Content the walk read as text, the checkout a coverage share is measured against. */
const isContent = (p: PathRow) => p[P.kind] === "text" || p[P.kind] === "document";
const carriedBy = (p: PathRow, tool: Tool) => p[P.tools].includes(tool);
const sum = (rows: PathRow[], keep: (p: PathRow) => boolean) =>
  rows.reduce((a, p) => a + (keep(p) ? p[P.tokens] : 0), 0);
const ratio = (num: number, den: number) => (den > 0 ? num / den : NaN);
const defined = (values: number[]) => values.filter((v) => !Number.isNaN(v));

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
  values.length === 0
    ? `${label.padEnd(14)} (no repositories)`
    : `${label.padEnd(14)} p10 ${fmt(quantile(values, 0.1)).padStart(11)}  p25 ${fmt(quantile(values, 0.25)).padStart(11)}  ` +
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
  const missed = (reason: string, key: "files" | "chars") =>
    rows.reduce((a, r) => a + (r.agreement.missedByUs[reason]?.[key] ?? 0), 0);
  const missedFiles = reasons.reduce((a, reason) => a + missed(reason, "files"), 0);
  const missedChars = reasons.reduce((a, reason) => a + missed(reason, "chars"), 0);
  for (const reason of reasons) {
    const files = missed(reason, "files");
    const chars = missed(reason, "chars");
    say(
      `${reason.padEnd(14)} ${num(files).padStart(7)} files ${pct(ratio(files, missedFiles)).padStart(6)}  ` +
        `${num(chars).padStart(13)} chars ${pct(ratio(chars, missedChars)).padStart(6)}`,
    );
  }
  say(`${"all".padEnd(14)} ${num(missedFiles).padStart(7)} files         ${num(missedChars).padStart(13)} chars (absent paths carry no chars)`);

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

  const withPaths = rows.filter((r) => r.paths && r.paths.length > 0);
  if (withPaths.length === 0) {
    say("\n## Composition, coverage, documents and boundaries");
    say("not in this artifact: no per-path rows. Rerun the measurement (2026-09-10 harness or later).");
  } else {
    effectiveness(withPaths, report, say);
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

  // Reproduction. `--against <artifact>[,<artifact>]` diffs this run's bundle
  // sizes against earlier runs at the same pinned commits. Our own bundles are
  // expected to move when a default changed between the runs; the competitors
  // ran at the same version over the same checkout, so a difference is theirs.
  // gitingest 0.3.1 differs on a handful of repositories every run.
  for (const file of args.against ? args.against.split(",") : []) {
    const other = JSON.parse(fs.readFileSync(path.resolve(file), "utf8")) as Report;
    const prev = new Map(other.repos.filter((r) => !r.error).map((r) => [r.url, r]));
    say(`\n## Reproduction against ${path.basename(file)}`);
    say("repositories whose bundle differs between the two runs, per tool, at the same pinned commit");
    const comparable = rows.filter((r) => prev.get(r.url)?.commit === r.commit);
    if (comparable.length < rows.length) say(`${rows.length - comparable.length} repositories are at a different commit and are not compared`);
    for (const tool of TOOLS) {
      const moved = comparable.flatMap((r) => {
        const before = prev.get(r.url)?.[tool];
        if (!before) return [];
        const delta = r[tool].tokens - before.tokens;
        return delta === 0 ? [] : [{ r, before, delta, share: Math.abs(delta) / before.tokens }];
      });
      const largest = moved.reduce((a, m) => Math.max(a, Math.abs(m.delta)), 0);
      const share = moved.reduce((a, m) => Math.max(a, m.share), 0);
      say(
        `${tool.padEnd(14)} ${moved.length} of ${comparable.length} differ` +
          (moved.length ? `, largest ${num(largest)} tokens, largest share ${pct(share)} of that bundle` : ""),
      );
      for (const m of moved) {
        const sign = m.delta > 0 ? "+" : "-";
        say(`  ${short(m.r.url).padEnd(42)} ${num(m.before.tokens).padStart(11)} -> ${num(m.r[tool].tokens).padStart(11)}  ${sign}${num(Math.abs(m.delta))} (${pct(m.share)})`);
      }
    }
  }

  process.stdout.write(out.join("\n") + "\n");
}

const onlyUsOf = (r: Measured) =>
  Object.values(r.agreement.onlyUs).reduce((s: number, n: number) => s + n, 0);

const pct = (v: number) => (Number.isNaN(v) ? "n/a" : `${(v * 100).toFixed(1)}%`);
const medianOf = (values: number[]) => quantile(defined(values), 0.5);

/**
 * The five engine-only measures of docs/tool-effectiveness-plan.md, every one a
 * per-repository share summarised across the sample, never a ratio of sums,
 * except where a figure has to add up to a whole bar and says so.
 */
function effectiveness(rows: Measured[], report: Report, say: (s?: string) => void) {
  const paths = (r: Measured) => r.paths!;
  const n = rows.length;
  say(`\n${n} repositories carry per-path rows; the sections below read those.`);

  // The artifact's category column is the rule map as it stood when the run was
  // made. The rules are ours and get fixed; recomputing from the path means a
  // fix reaches an existing artifact without a 45 minute rerun.
  let moved = 0;
  for (const r of rows) {
    for (const p of paths(r)) {
      const category = categorize(p[P.path]);
      if (category !== p[P.category]) moved++;
      p[P.category] = category;
      p[P.hidden] = isHidden(p[P.path]);
    }
  }
  say(`categories recomputed from the path with the current rules: ${num(moved)} rows moved`);
  const listedOnly = TOOLS.map((t) => `${t} ${num(rows.reduce((a, r) => a + (r[t].listedOnly?.files ?? 0), 0))}`);
  say(`paths a tool named without carrying the content (dropped from every share below): ${listedOnly.join(", ")}`);

  // E1. Composition. Two views: the per-repository median share, which is the
  // distribution, and the sample total, which is the one that adds up to a bar.
  say("\n## E1. What each bundle is made of");
  say("Share of the tool's bundle tokens on each kind of path. Categories are the codebase study's rules;");
  say("documents are pulled out of their category; hidden is any dot segment, counted again across categories.");
  const buckets = [...CATEGORIES, "documents"];
  const shareOf = (r: Measured, tool: Tool, keep: (p: PathRow) => boolean) =>
    ratio(sum(paths(r), (p) => carriedBy(p, tool) && keep(p)), r[tool].tokens);
  say("\nmedian across repositories:");
  say(`${"".padEnd(12)}${TOOLS.map((t) => t.padStart(13)).join("")}`);
  for (const b of buckets) {
    say(
      `${b.padEnd(12)}${TOOLS.map((t) => pct(medianOf(rows.map((r) => shareOf(r, t, (p) => bucket(p) === b)))).padStart(13)).join("")}`,
    );
  }
  say(
    `${"hidden".padEnd(12)}${TOOLS.map((t) => pct(medianOf(rows.map((r) => shareOf(r, t, (p) => p[P.hidden])))).padStart(13)).join("")}`,
  );
  say("\nsample total (adds up to the bar; the remainder is wrapper, tree and markers):");
  say(`${"".padEnd(12)}${TOOLS.map((t) => t.padStart(13)).join("")}`);
  const totalBundle = (tool: Tool) => rows.reduce((a, r) => a + r[tool].tokens, 0);
  for (const b of buckets) {
    say(
      `${b.padEnd(12)}${TOOLS.map((t) =>
        pct(ratio(rows.reduce((a, r) => a + sum(paths(r), (p) => carriedBy(p, t) && bucket(p) === b), 0), totalBundle(t))).padStart(13),
      ).join("")}`,
    );
  }
  say(
    `${"hidden".padEnd(12)}${TOOLS.map((t) =>
      pct(ratio(rows.reduce((a, r) => a + sum(paths(r), (p) => carriedBy(p, t) && p[P.hidden]), 0), totalBundle(t))).padStart(13),
    ).join("")}`,
  );

  say("\n## Signal density: source tokens over bundle tokens");
  say("source is the category alone, hidden or not; tests, docs and documents are reported above, not summed in.");
  const density = (r: Measured, tool: Tool) => shareOf(r, tool, (p) => p[P.category] === "source" && p[P.kind] === "text");
  for (const tool of TOOLS) say(line(tool, defined(rows.map((r) => density(r, tool))), pct));
  const densest: Record<string, number> = {};
  for (const r of rows) {
    const best = TOOLS.reduce((a, b) => (density(r, a) >= density(r, b) ? a : b));
    densest[best] = (densest[best] ?? 0) + 1;
  }
  say("densest bundle: " + TOOLS.map((t) => `${t} ${densest[t] ?? 0}/${n}`).join(", "));

  // E2. Coverage. The checkout is what the walk read as text, the share is per
  // repository, and hidden source is its own line so a reader can add it back.
  say("\n## E2. Source coverage: of the checkout's source tokens, the share each bundle carries");
  const coverage = (r: Measured, tool: Tool, keep: (p: PathRow) => boolean) =>
    ratio(sum(paths(r), (p) => isContent(p) && keep(p) && carriedBy(p, tool)), sum(paths(r), (p) => isContent(p) && keep(p)));
  const visibleSource = (p: PathRow) => p[P.category] === "source" && p[P.kind] === "text" && !p[P.hidden];
  const hiddenSource = (p: PathRow) => p[P.category] === "source" && p[P.kind] === "text" && p[P.hidden];
  say("visible source, per repository:");
  for (const tool of TOOLS) say(line(tool, defined(rows.map((r) => coverage(r, tool, visibleSource))), pct));
  say("the lowest, per tool, with the visible source files that bundle does not carry:");
  for (const tool of TOOLS) {
    const worst = rows
      .map((r) => ({ r, c: coverage(r, tool, visibleSource) }))
      .filter((x) => !Number.isNaN(x.c))
      .sort((a, b) => a.c - b.c)[0];
    if (!worst) continue;
    const dropped = paths(worst.r).filter((p) => visibleSource(p) && !carriedBy(p, tool)).length;
    say(`${tool.padEnd(14)} ${short(worst.r.url).padEnd(38)} ${pct(worst.c).padStart(6)}  ${num(dropped).padStart(5)} files`);
  }
  const withHiddenSource = rows.filter((r) => sum(paths(r), hiddenSource) > 0);
  say(`\nhidden source exists in ${withHiddenSource.length} of ${n} repositories; coverage there:`);
  for (const tool of TOOLS) say(line(tool, defined(withHiddenSource.map((r) => coverage(r, tool, hiddenSource))), pct));
  say("and how much of the checkout's source it is, per repository, all repositories:");
  say(
    line(
      "hidden share",
      defined(rows.map((r) => ratio(sum(paths(r), hiddenSource), sum(paths(r), (p) => visibleSource(p) || hiddenSource(p))))),
      pct,
    ),
  );
  say("\ntests, the same way: of the checkout's test tokens, the share each bundle carries");
  const tests = (p: PathRow) => p[P.category] === "tests";
  for (const tool of TOOLS) say(line(tool, defined(rows.map((r) => coverage(r, tool, tests))), pct));
  // Everything a reader might have wanted: the walk's text outside the three
  // noise categories, hidden or not. A dropped CI workflow or dotfile shows here
  // and a dropped lockfile does not, which is the point of the cut.
  const wanted = (p: PathRow) => !NOISE.has(p[P.category]);
  say("\ntext outside lockfiles, generated and vendored, any other category, hidden or not:");
  for (const tool of TOOLS) say(line(tool, defined(rows.map((r) => coverage(r, tool, wanted))), pct));
  const withCi = rows.filter((r) => paths(r).some((p) => p[P.path].startsWith(".github/workflows/")));
  say(`\nrepositories with a .github/workflows directory: ${withCi.length} of ${n}; the same coverage there:`);
  for (const tool of TOOLS) say(line(tool, defined(withCi.map((r) => coverage(r, tool, wanted))), pct));
  say("and the share of those checkouts' text that sits under .github/workflows:");
  say(
    line(
      "workflows",
      defined(withCi.map((r) => ratio(sum(paths(r), (p) => isContent(p) && p[P.path].startsWith(".github/workflows/")), sum(paths(r), isContent)))),
      pct,
    ),
  );

  // E3. Noise. The mirror of coverage, and where code2prompt's extra weight lands.
  say("\n## E3. Noise share: lockfiles, generated and vendored tokens over bundle tokens");
  for (const tool of TOOLS) say(line(tool, defined(rows.map((r) => shareOf(r, tool, (p) => NOISE.has(p[P.category])))), pct));
  say("the noisiest bundle per tool, against the cheapest bundle on that repository:");
  for (const tool of TOOLS) {
    const worst = rows
      .map((r) => ({ r, s: shareOf(r, tool, (p) => NOISE.has(p[P.category])) }))
      .filter((x) => !Number.isNaN(x.s))
      .sort((a, b) => b.s - a.s)[0];
    if (!worst) continue;
    const best = TOOLS.reduce((x, y) => (worst.r[x].tokens <= worst.r[y].tokens ? x : y));
    say(
      `${tool.padEnd(14)} ${short(worst.r.url).padEnd(38)} ${pct(worst.s).padStart(6)}  ` +
        `${num(worst.r[tool].tokens)} tokens, cheapest ${num(worst.r[best].tokens)} (${best})`,
    );
  }
  say("\nof the tokens on paths a tool carries and we do not, what they are (sample total, hidden counted apart):");
  for (const tool of TOOLS) {
    if (tool === "fileconcat") continue;
    const by: Record<string, number> = {};
    for (const r of rows) {
      for (const p of paths(r)) {
        if (!isContent(p) || !carriedBy(p, tool) || carriedBy(p, "fileconcat")) continue;
        const key = p[P.hidden] ? "hidden" : p[P.category];
        by[key] = (by[key] ?? 0) + p[P.tokens];
      }
    }
    const all = Object.values(by).reduce((a, b) => a + b, 0);
    say(
      `${tool.padEnd(14)} ${num(all).padStart(12)} extra tokens: ` +
        Object.entries(by)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k} ${pct(ratio(v, all))}`)
          .join(", "),
    );
  }

  // E4. Documents. The fixture says whether a tool reads a document at all; the
  // sample says how much document text each carried where any existed.
  say("\n## E4. Documents");
  const fixture = report.documentFixture;
  if (!fixture) say("fixture: not in this artifact");
  else if ("error" in fixture) say(`fixture: not measured: ${fixture.error}`);
  else {
    say("fixture: one source file and one document of each format; text = the sentence is in the bundle, listed = only the path is.");
    const files = Object.keys(fixture.files);
    say(`${"".padEnd(14)}${files.map((f) => f.padStart(14)).join("")}   bundle tokens`);
    for (const tool of TOOLS) {
      const cells = files.map((f) => {
        const r = fixture.results[tool]?.[f];
        return (r?.text ? "text" : r?.listed ? "listed only" : "absent").padStart(14);
      });
      say(`${tool.padEnd(14)}${cells.join("")}   ${num(fixture.tokens[tool] ?? 0).padStart(6)}`);
    }
  }
  const withDocs = rows.filter((r) => paths(r).some((p) => p[P.kind] === "document"));
  say(`\nsample: ${withDocs.length} of ${n} checkouts hold a document the walk extracted text from; share of that text each bundle carries`);
  say("(a competitor carries a document only by marker here: the walk's text is our extraction, so the fixture above is the text test):");
  for (const tool of TOOLS) say(line(tool, defined(withDocs.map((r) => coverage(r, tool, (p) => p[P.kind] === "document"))), pct));
  say(
    "repositories where the tool carries any of it: " +
      TOOLS.map((t) => `${t} ${withDocs.filter((r) => sum(paths(r), (p) => p[P.kind] === "document" && carriedBy(p, t)) > 0).length}`).join(", "),
  );
  const docExt: Record<string, number> = {};
  for (const r of withDocs) for (const p of paths(r)) if (p[P.kind] === "document") {
    const ext = p[P.path].slice(p[P.path].lastIndexOf(".")).toLowerCase();
    docExt[ext] = (docExt[ext] ?? 0) + 1;
  }
  say("by extension: " + Object.entries(docExt).sort((a, b) => b[1] - a[1]).map(([e, c]) => `${e} ${c}`).join(", "));

  // E5. Boundaries. A bundled file that carries the tool's own delimiter is a
  // boundary a reader cannot tell from the real one.
  say("\n## E5. Boundary fidelity");
  say("bundled files whose content carries the tool's delimiter at the start of a line (</file>, 48 equals signs, three backticks):");
  for (const tool of TOOLS) {
    const hit = rows.filter((r) => (r[tool].collisions?.files ?? 0) > 0).length;
    const files = rows.reduce((a, r) => a + (r[tool].collisions?.files ?? 0), 0);
    const tokens = rows.reduce((a, r) => a + (r[tool].collisions?.tokens ?? 0), 0);
    say(`${tool.padEnd(14)} ${String(hit).padStart(3)} of ${n} repositories, ${num(files).padStart(5)} files, ${num(tokens).padStart(11)} tokens inside them`);
  }
  const exact = rows.filter((r) => r.roundTrip && r.roundTrip.markers === r.roundTrip.kept).length;
  say(
    `our bundle read back to the walk's kept count in ${exact} of ${n} repositories ` +
      "(the walk lacks the CLI's extension list, so a .key or .dat the CLI declines opens a gap that is the walk's)",
  );

  // Where the bytes came from, so a reader knows what the denominators hold.
  say("\n## Where the per-path rows came from");
  const kinds: Record<string, { files: number; tokens: number }> = {};
  for (const r of rows) for (const p of paths(r)) {
    const k = (kinds[p[P.kind]] ??= { files: 0, tokens: 0 });
    k.files++;
    k.tokens += p[P.tokens];
  }
  for (const [k, v] of Object.entries(kinds)) say(`${k.padEnd(12)} ${num(v.files).padStart(7)} files  ${num(v.tokens).padStart(13)} tokens`);
}

main();
