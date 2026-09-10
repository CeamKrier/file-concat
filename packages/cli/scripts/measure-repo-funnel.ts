/**
 * How much of a repository is actually useful LLM context?
 *
 * For every repository in a sample list this measures three stages and the one
 * place the unit changes:
 *
 *   files found -> text eligible -> kept after the default filters -> tokens
 *
 * and splits the tokens by category, so a composition figure can say what the
 * bundle is made of and what the defaults removed.
 *
 * The token figures are measured, not modelled. The bundle is assembled with
 * the product's own `assembleOutput` and tokenized whole, because the number
 * worth publishing is what a reader pastes into a model, and that includes the
 * wrapper, the header and the file tree.
 *
 * Three rules this script exists to obey. Break one and the number describes
 * something other than the product:
 *
 *  1. Every decision comes from `@fileconcat/core` and the same `glob` walk the
 *     CLI runs. What counts as text is `routeBytes` plus `classifyBytes`, what
 *     the defaults remove is `DEFAULT_GLOB_IGNORE` plus the gitignore matcher,
 *     and documents are extracted through the CLI's own parser registry. There
 *     is no second implementation of any of that here.
 *  2. The category map below is ours and is a judgment call, not a standard.
 *     Nothing in the codebase says a path is source or test or generated. Print
 *     it with `--rules` and publish it in the article's method section.
 *  3. Report the distribution. A single vendored monorepo moves a mean by more
 *     than the finding is worth, so the aggregate carries quantiles.
 *
 * Two caveats the output repeats, because an article that drops them is wrong:
 *
 *  - A fresh clone is not a working folder. It has no `node_modules`, no build
 *    output and no local env files, because none of that is committed. The
 *    "generated" and "vendored" shares measured here are therefore a floor, and
 *    the real reduction on a developer's machine is larger.
 *  - There is no browser here, so every token figure that can be measured is
 *    measured. `counted` tokenizes the contents the product's own counter
 *    counts; `bundle` tokenizes the whole assembled artifact, which is what
 *    actually gets pasted into a model. The single computed figure is
 *    `asShipped`, the characters / 4 forecast the browser falls back to above
 *    1 MiB of text (ADR-0010), kept so the shortcut can be scored against the
 *    real count rather than assumed.
 *
 * Usage:
 *   pnpm --filter @fileconcat/cli measure-funnel --repos ../../docs/repo-sample.txt
 *   pnpm --filter @fileconcat/cli measure-funnel --rules
 *
 * Flags:
 *   --repos <file>  one git URL per line, `#` comments allowed (required)
 *   --pin <file>    a previous run's JSON; reruns the exact commits it measured,
 *                   so a defaults change is not confounded with upstream churn
 *   --out <file>    output JSON (default docs/measurements/repo-funnel-<date>.json)
 *   --limit <n>     stop after n repositories
 *   --keep          leave the clones on disk instead of removing them
 *   --force         replace an existing output file instead of refusing
 *   --rules         print the category map as a markdown table and exit
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { encoding_for_model, type TiktokenModel } from "@dqbd/tiktoken";
import { assembleOutput, generateFileTree, generateProjectName } from "@fileconcat/core";

import { CATEGORY_RULES, base, categorize, type Category } from "./categories.js";
import { MAX_FILE_BYTES, cloneRepo, walkRepo, type ExcludedBy } from "./repo-walk.js";

/** Must match apps/web/src/lib/tokens-client.ts, or the published number is not the tool's. */
const TOKEN_MODEL: TiktokenModel = "o1-preview-2024-09-12";
/** Must match apps/web/src/lib/tokens.ts (ADR-0010). */
const LARGE_BUNDLE_CHARS = 1024 * 1024;
/** Must match apps/web/src/lib/tokens-client.ts, or the scored fix is not the shipped one. */
const SAMPLE_SLICES = 64;
const SLICE_CHARS = 4 * 1024;

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** What the folder would be called after `git clone`, so the bundle header matches. */
const repoName = (url: string) => base(url).replace(/\.git$/, "");

/**
 * The browser's estimator above the threshold, reproduced exactly so it can be
 * scored against the truth on real repositories rather than on a guess about
 * what repositories contain.
 */
function estimateBySampling(enc: ReturnType<typeof encoding_for_model>, text: string): number {
  const stride = Math.floor(text.length / SAMPLE_SLICES);
  let sampledChars = 0;
  let sampledTokens = 0;
  for (let i = 0; i < SAMPLE_SLICES; i++) {
    const slice = text.slice(i * stride, i * stride + SLICE_CHARS);
    if (slice.length === 0) continue;
    sampledChars += slice.length;
    sampledTokens += enc.encode(slice).length;
  }
  if (sampledChars === 0) return Math.ceil(text.length / 4);
  return Math.ceil((text.length * sampledTokens) / sampledChars);
}
type FileFact = {
  category: Category;
  tokens: number;
  chars: number;
  excluded: boolean;
  excludedBy: ExcludedBy | null;
};

type RepoRow = {
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
  categories?: Record<string, { files: number; tokens: number; excluded: boolean }>;
  excludedBy?: Record<ExcludedBy, { files: number; tokens: number }>;
  skipped?: { oversize: number; unreadable: number; unextractable: number };
  error?: string;
};

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!flag.startsWith("--")) continue;
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args[flag.slice(2)] = true;
    else args[flag.slice(2)] = next;
  }
  return args;
}

function printRules() {
  process.stdout.write("| Category | Rule |\n| --- | --- |\n");
  for (const rule of CATEGORY_RULES) {
    process.stdout.write(`| ${rule.category} | ${rule.why} |\n`);
  }
}

/** Quantiles over a small sample. Linear interpolation, sorted copy. */
function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const low = Math.floor(pos);
  const high = Math.ceil(pos);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (pos - low);
}

function spread(values: number[]) {
  return {
    n: values.length,
    min: values.length ? Math.min(...values) : 0,
    p25: quantile(values, 0.25),
    median: quantile(values, 0.5),
    p75: quantile(values, 0.75),
    max: values.length ? Math.max(...values) : 0,
    mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0,
  };
}

async function measureRepo(
  url: string,
  dir: string,
  enc: ReturnType<typeof encoding_for_model>,
  pinned?: string,
) {
  const commit = cloneRepo(url, dir, pinned);
  const { found, files, kept, excluded, skipped } = await walkRepo(dir);

  const facts: FileFact[] = files.map((file) => ({
    category: categorize(file.path),
    tokens: enc.encode(file.text).length,
    chars: file.text.length,
    excluded: !file.kept,
    excludedBy: file.excludedBy,
  }));

  const keptFacts = facts.filter((f) => !f.excluded);
  const perFileSum = keptFacts.reduce((sum, f) => sum + f.tokens, 0);

  // Five token figures. One of them is the truth and the others are answers to
  // "what does the tool say", before and after the two fixes of 2026-09-07.
  //
  //   bundle       the truth. The whole assembled artifact, wrapper and header
  //                and file tree included, tokenized. This is what a reader
  //                pastes into a model and pays for. XML, because it is the
  //                default style.
  //   counted      exact tokenization of the file contents joined by newlines,
  //                which is the text the old counter counted. Kept so the
  //                wrapper's cost stays measurable.
  //   perFileSum   per-file counts added up, the basis of the category split.
  //   shownBefore  what the build displayed before the fixes: the joined
  //                contents, forecast as characters / 4 above 1 MiB.
  //   shownAfter   what it displays now: the assembled bundle, extrapolated
  //                from tokenized samples above 1 MiB.
  //
  // Scoring both shown figures against `bundle` rather than against each other
  // is the point. The question is not whether the estimator improved, it is
  // whether the number a reader is given matches the number they will be
  // charged for.
  const joined = kept.map((f) => f.content).join("\n");
  const counted = enc.encode(joined).length;
  const shownBefore =
    joined.length > LARGE_BUNDLE_CHARS ? Math.ceil(joined.length / 4) : counted;

  const paths = kept.map((f) => f.path);
  const bundleText = assembleOutput({
    projectName: generateProjectName(paths),
    files: kept,
    tree: generateFileTree(paths),
    style: "xml",
    source: `local:${repoName(url)}`,
    excluded,
  });
  const bundle = enc.encode(bundleText).length;
  const shownAfter =
    bundleText.length > LARGE_BUNDLE_CHARS ? estimateBySampling(enc, bundleText) : bundle;

  const categories: NonNullable<RepoRow["categories"]> = {};
  const excludedBy: NonNullable<RepoRow["excludedBy"]> = {
    hidden: { files: 0, tokens: 0 },
    defaultIgnore: { files: 0, tokens: 0 },
    gitignore: { files: 0, tokens: 0 },
  };
  for (const fact of facts) {
    const key = `${fact.category}${fact.excluded ? ":excluded" : ""}`;
    const entry = (categories[key] ??= { files: 0, tokens: 0, excluded: fact.excluded });
    entry.files++;
    entry.tokens += fact.tokens;
    if (fact.excludedBy) {
      excludedBy[fact.excludedBy].files++;
      excludedBy[fact.excludedBy].tokens += fact.tokens;
    }
  }

  return {
    url,
    commit,
    stages: { found, textEligible: facts.length, kept: keptFacts.length },
    tokens: { bundle, counted, perFileSum, shownBefore, shownAfter },
    chars: { contents: joined.length, bundle: bundleText.length },
    categories,
    excludedBy,
    skipped,
  } satisfies RepoRow;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.rules) {
    printRules();
    return;
  }

  const listPath = typeof args.repos === "string" ? args.repos : "";
  if (!listPath) {
    process.stderr.write(
      "Error: --repos <file> is required, one git URL per line.\n" +
        "The sample is a judgment call the article has to defend, so this script\n" +
        "will not pick one for you. Write the list, state the selection rule in\n" +
        "the method section, then run it.\n",
    );
    process.exit(1);
  }

  const urls = fs
    .readFileSync(listPath, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .slice(0, typeof args.limit === "string" ? Number(args.limit) : undefined);

  if (urls.length === 0) {
    process.stderr.write(`Error: no repository URLs in ${listPath}\n`);
    process.exit(1);
  }

  const day = new Date().toISOString().slice(0, 10);
  const outPath =
    typeof args.out === "string"
      ? args.out
      : path.join(REPO_ROOT, "docs", "measurements", `repo-funnel-${day}.json`);

  // Two runs on the same day resolve to the same default path, and the second
  // one silently replaced the first. A run costs half an hour and the file it
  // writes is the only record of the build it measured, so it has to be asked
  // for rather than assumed.
  if (fs.existsSync(outPath) && !args.force) {
    process.stderr.write(
      `Error: ${outPath} already exists.\n` +
        "Pass --out <file> to write elsewhere, or --force to replace it. That\n" +
        "file is the only record of the build it measured; a rerun after a\n" +
        "product change measures something else.\n",
    );
    process.exit(1);
  }

  // --pin reruns the exact checkouts a previous run measured, by reading the
  // commit each repository was on out of that run's own artifact. Without it a
  // rerun clones HEAD, and a product change is then confounded with however
  // much upstream churn happened in between, which makes the two runs
  // uncomparable for exactly the question a rerun is asked to answer.
  const pins = new Map<string, string>();
  if (typeof args.pin === "string") {
    const prior = JSON.parse(fs.readFileSync(args.pin, "utf-8")) as {
      repos?: Array<{ url?: string; commit?: string }>;
    };
    for (const row of prior.repos ?? []) {
      if (row.url && row.commit) pins.set(row.url, row.commit);
    }
    const missing = urls.filter((url) => !pins.has(url));
    if (missing.length) {
      process.stderr.write(
        `Error: ${missing.length} of ${urls.length} URLs have no commit in ${args.pin}.\n` +
          "A partly pinned run measures two different things at once. First missing:\n" +
          `  ${missing[0]}\n`,
      );
      process.exit(1);
    }
    process.stderr.write(`Pinned to ${pins.size} commits from ${args.pin}\n`);
  }

  const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fc-funnel-"));
  const enc = encoding_for_model(TOKEN_MODEL);
  const rows: RepoRow[] = [];

  try {
    for (const [i, url] of urls.entries()) {
      const dir = path.join(workRoot, `repo-${i}`);
      process.stderr.write(`[${i + 1}/${urls.length}] ${url}\n`);
      try {
        rows.push(await measureRepo(url, dir, enc, pins.get(url)));
      } catch (err) {
        // One repository failing is not a reason to lose the other ninety-nine.
        rows.push({ url, error: err instanceof Error ? err.message : String(err) });
      }
      if (!args.keep) fs.rmSync(dir, { recursive: true, force: true });
    }
  } finally {
    enc.free();
    if (!args.keep) fs.rmSync(workRoot, { recursive: true, force: true });
  }

  const ok = rows.filter((row): row is Required<Omit<RepoRow, "error">> & RepoRow => !row.error);
  const ratio = (a: number, b: number) => (b ? a / b : 0);

  const categoryTotals: Record<string, { files: number; tokens: number; excluded: boolean }> = {};
  const excludedByTotals: Record<string, { files: number; tokens: number }> = {};
  for (const row of ok) {
    for (const [key, value] of Object.entries(row.categories)) {
      const entry = (categoryTotals[key] ??= { files: 0, tokens: 0, excluded: value.excluded });
      entry.files += value.files;
      entry.tokens += value.tokens;
    }
    for (const [key, value] of Object.entries(row.excludedBy)) {
      const entry = (excludedByTotals[key] ??= { files: 0, tokens: 0 });
      entry.files += value.files;
      entry.tokens += value.tokens;
    }
  }

  const report = {
    measured: new Date().toISOString(),
    tokenizer: `${TOKEN_MODEL} via @dqbd/tiktoken`,
    largeBundleChars: LARGE_BUNDLE_CHARS,
    maxFileBytes: MAX_FILE_BYTES,
    sampleFile: listPath,
    pinnedFrom: typeof args.pin === "string" ? args.pin : null,
    caveats: [
      "A fresh clone is not a working folder: no node_modules, no build output, no local env files. The generated and vendored shares here are a floor.",
      "bundle is the truth: the whole assembled XML artifact tokenized, which is what a reader pastes into a model and pays for. counted is the file contents alone, the text the counter used to count. shownBefore and shownAfter are what the tool displayed before and after the 2026-09-07 fixes, both scored against bundle rather than against each other, because the question is whether a reader is told what they will be charged.",
      "The category map is ours and is a judgment call. Print it with --rules and publish it.",
      "excludedBy splits the second drop three ways, and the file count and the token count disagree about it. Measured over 60 repositories on 2026-09-07, hidden files were 66.7% of excluded files but 6.4% of excluded tokens, while the default ignore list was 30.1% of files and 91.5% of tokens. State which unit a share is in.",
    ],
    categoryRules: CATEGORY_RULES.map((r) => ({ category: r.category, why: r.why })),
    repos: rows,
    aggregate: {
      repos: rows.length,
      measured: ok.length,
      failed: rows.length - ok.length,
      textEligibleShare: spread(ok.map((r) => ratio(r.stages.textEligible, r.stages.found))),
      keptShare: spread(ok.map((r) => ratio(r.stages.kept, r.stages.found))),
      keptOfEligibleShare: spread(
        ok.map((r) => ratio(r.stages.kept, r.stages.textEligible)),
      ),
      tokensCounted: spread(ok.map((r) => r.tokens.counted)),
      tokensBundle: spread(ok.map((r) => r.tokens.bundle)),
      /** What the wrapper, header and file tree add on top of the contents. */
      wrapperOverhead: spread(ok.map((r) => ratio(r.tokens.bundle - r.tokens.counted, r.tokens.counted))),
      /** How far the number a reader is shown sits from the one they pay for. */
      errorBefore: spread(ok.map((r) => ratio(r.tokens.shownBefore - r.tokens.bundle, r.tokens.bundle))),
      errorAfter: spread(ok.map((r) => ratio(r.tokens.shownAfter - r.tokens.bundle, r.tokens.bundle))),
      categoryTotals,
      excludedByTotals,
    },
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  const agg = report.aggregate;
  process.stderr.write(
    `\n${agg.measured} measured, ${agg.failed} failed\n` +
      `text eligible: median ${(agg.textEligibleShare.median * 100).toFixed(1)}% ` +
      `(p25 ${(agg.textEligibleShare.p25 * 100).toFixed(1)}, p75 ${(agg.textEligibleShare.p75 * 100).toFixed(1)})\n` +
      `kept of found: median ${(agg.keptShare.median * 100).toFixed(1)}% ` +
      `(p25 ${(agg.keptShare.p25 * 100).toFixed(1)}, p75 ${(agg.keptShare.p75 * 100).toFixed(1)})\n` +
      `contents tokens: median ${Math.round(agg.tokensCounted.median).toLocaleString("en-US")}\n` +
      `bundle tokens:   median ${Math.round(agg.tokensBundle.median).toLocaleString("en-US")} ` +
      `(wrapper adds a median ${(agg.wrapperOverhead.median * 100).toFixed(1)}%)\n` +
      `shown vs paid:   before ${(agg.errorBefore.median * 100).toFixed(1)}% median, ` +
      `after ${(agg.errorAfter.median * 100).toFixed(1)}%\n` +
      `written to ${outPath}\n`,
  );
}

await main();
