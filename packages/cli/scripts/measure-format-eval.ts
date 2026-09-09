/**
 * Which part of the wrapper, if any, changes how well an LLM reads a bundle?
 *
 * The pre-registration is `format-eval-protocol-2026-09-07.md`, next to this
 * file. Read it first. This script holds no design decision the protocol does
 * not state.
 *
 * Seven renderings of one mutated file set. Four are the study, three are controls:
 *
 *   NC  no bundle at all, question only          contamination control
 *   TR  the file tree and header, no contents    filename-leakage screen
 *   A0  xml with every path stripped, no tree    manipulation check, must collapse
 *   A1  one bare path line per file              minimal
 *   A2  markdown fences and headings, no tree    A2 vs A1 = delimiter richness
 *   A3  A2 plus the header and the file tree     A3 vs A2 = the tree
 *   A4  xml tags, same header and tree           A4 vs A3 = style
 *
 * A3 and A4 are exactly what `assembleOutput` ships. A1 and A2 are
 * counterfactuals built here, because the product has no un-treed style, and A0
 * is a deliberate mutilation. Only A3 and A4 are claims about the product.
 *
 * Five rules this file exists to obey. Break one and it measures something else:
 *
 *  1. Questions are generated from the RAW file set, never from a rendered
 *     bundle, and every uniqueness filter runs on raw files. A path occurs once
 *     in A1 and three times in A4, so a filter computed on rendered text would
 *     hand one arm the question set it likes.
 *  2. The primary family is bug location on an INJECTED defect. The repositories
 *     are public and in every training corpus; a question about the unmodified
 *     repository can be answered from memory, and memory biases every arm toward
 *     the same score. The injection makes the remembered answer the wrong one.
 *  3. The question, the answer and the position are identical across arms. Only
 *     the rendering changes.
 *  4. Questions from one bundle are not independent. Sizing uses an effective n
 *     after a design effect, and the analysis is a bundle-level cluster
 *     bootstrap. Pooling raw proportions would overstate precision by the square
 *     root of the design effect.
 *  5. A failure to reject is not equivalence. Every contrast reports a TOST
 *     against a pre-registered 5-point margin as well as a p-value.
 *
 * Three things the output repeats, because a reader who drops them is wrong:
 *
 *  - `--dry-run` tokenizes with `@dqbd/tiktoken` and the product's own encoding,
 *    which is NOT Claude's tokenizer. It sizes the budget; it is not publishable.
 *  - Cache writes, not tokens, are the likeliest budget overrun. The dry run
 *    prints how many the chosen run order implies.
 *  - `claude-sonnet-5` rejects `temperature`. "k=1 at temperature 0" is not
 *    available on the frontier model; the pilot runs k=3 to measure the variance
 *    instead of assuming it away.
 *
 * Usage:
 *   pnpm --filter @fileconcat/cli format-eval --power
 *   pnpm --filter @fileconcat/cli format-eval --dry-run --repos scripts/repo-sample-2026-09-07.txt
 *   pnpm --filter @fileconcat/cli format-eval --live --config pilot --repos <f> --approved-usd <n>
 *   pnpm --filter @fileconcat/cli format-eval --analyze <results.json>
 *
 * Flags:
 *   --repos <file>     the frozen sample (required for --dry-run and --live)
 *   --config <name>    pilot | interim | full (default: price all three)
 *   --n <a,b>          extra raw N values for the --power table
 *   --out <file>       output JSON
 *   --approved-usd <n> explicit budget approval, required by --live
 *   --keep             leave clones on disk
 *   --force            replace an existing output file
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import Anthropic from "@anthropic-ai/sdk";
import { encoding_for_model, type TiktokenModel } from "@dqbd/tiktoken";
import { glob } from "glob";
import {
  DEFAULT_GLOB_IGNORE,
  assembleOutput,
  classifyBytes,
  createGitignoreMatcher,
  fenceFor,
  generateFileTree,
  generateProjectName,
  getLanguageFromPath,
  type ExcludedSummary,
  type OutputFile,
} from "@fileconcat/core";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Must match apps/web/src/lib/tokens-client.ts, or the projection is not the tool's. */
const TOKEN_MODEL: TiktokenModel = "o1-preview-2024-09-12";
const MAX_FILE_BYTES = 32 * 1024 * 1024;

/** Protocol section 14. Changing it changes the questions and the injections. */
const SEED = 20260907;

export const ARMS = ["NC", "TR", "A0", "A1", "A2", "A3", "A4"] as const;
export type ArmId = (typeof ARMS)[number];

/** The three single-factor contrasts. One factor changes across each pair. */
export const CONTRASTS: [ArmId, ArmId, string][] = [
  ["A2", "A1", "delimiter richness"],
  ["A3", "A2", "the file tree"],
  ["A4", "A3", "style"],
];

/** Position is a covariate, not a stratum (protocol 6). Five character-fraction bands. */
const BANDS = 5;

const QUESTIONS_PER_BUNDLE = 20;
const BUG_PER_BUNDLE = 12;
const LOC_PER_BUNDLE = QUESTIONS_PER_BUNDLE - BUG_PER_BUNDLE;

/** Protocol section 5. Fixed before any data. */
const ICC_ASSUMED = 0.05;
const PSI_ASSUMED = 0.15;
const ALPHA = 0.05 / 3; // Bonferroni over the three contrasts
const POWER = 0.8;
/** Protocol section 5.3. Below this the product decision does not change. */
const EQUIVALENCE_MARGIN = 0.05;

const designEffect = (perCluster: number, icc: number) => 1 + (perCluster - 1) * icc;

/**
 * The system instruction, byte-identical in every arm. It names no format. An
 * instruction mentioning tags or headings would hand the result to one arm
 * before a single question was asked.
 *
 * Bundle first, question last, in every arm (protocol 8.3). The claim is scoped
 * to that ordering.
 */
const INSTRUCTION = [
  "You are given the contents of a set of files below.",
  "Answer the question that follows using only what is in that content.",
  "",
  "Reply with the answer and nothing else: no explanation, no preamble, no quotes,",
  "no code fences, no trailing punctuation.",
  "If the answer is a file path, give the path exactly as it appears.",
  "If the answer is a line of text, give that line exactly.",
].join("\n");

/** The no-context arm gets the same instruction minus the promise of content. */
const INSTRUCTION_NC = [
  "Answer the question below.",
  "",
  "Reply with the answer and nothing else: no explanation, no preamble, no quotes,",
  "no code fences, no trailing punctuation.",
  "If the answer is a file path, give the path exactly as it appears.",
].join("\n");

/**
 * Exact ids, pinned (addendum 2). A silent model update landing partway through
 * would hit some arms and not others, and no analysis removes that afterwards.
 * The served id from `response.model` is recorded next to every row as well.
 *
 * `temperature` is REMOVED on claude-sonnet-5 and returns a 400. Only the small
 * model can be pinned to 0.
 */
type ModelId = "claude-sonnet-5" | "claude-haiku-4-5-20251001";

/**
 * Context limits, read from `apps/web/src/data/models.json` (310 models,
 * regenerated every build) on 2026-09-07 rather than assumed:
 *
 *   anthropic/claude-sonnet-5              ctx 1,000,000
 *   anthropic/claude-haiku-4-5-20251001    ctx   200,000
 *
 * The small model's 200,000 is the binding constraint, and our median bundle is
 * 246,424 tokens. No size both models accept reaches the median. Protocol 7.2.
 *
 * The per-token prices below are the first-party API rates, not the blended
 * figures in models.json; that file is used here only for the window check.
 */

const MODELS: Record<
  ModelId,
  {
    context: number;
    input: number;
    cacheWrite: number;
    cacheRead: number;
    output: number;
    assumedOutput: number;
    maxTokens: number;
    acceptsTemperature: boolean;
    /** Below this a prefix silently does not cache: no error, just no entry. */
    minCacheable: number;
  }
> = {
  "claude-sonnet-5": {
    context: 1_000_000,
    input: 2.0,
    cacheWrite: 2.5,
    cacheRead: 0.2,
    output: 10.0,
    assumedOutput: 300,
    maxTokens: 4096,
    acceptsTemperature: false,
    minCacheable: 1024,
  },
  "claude-haiku-4-5-20251001": {
    context: 200_000,
    input: 1.0,
    cacheWrite: 1.25,
    cacheRead: 0.1,
    output: 5.0,
    assumedOutput: 40,
    maxTokens: 256,
    acceptsTemperature: true,
    minCacheable: 4096,
  },
};

/**
 * Two context sizes (addendum 4). S2 exceeds the small model's 200K window, so
 * it is frontier-only; that is a fact about context windows, not a choice.
 */
type SizeBand = { id: "S1" | "S2"; min: number; max: number; models: ModelId[]; searchLarge: boolean };

const SIZES: SizeBand[] = [
  { id: "S1", min: 40_000, max: 160_000, models: ["claude-sonnet-5", "claude-haiku-4-5-20251001"], searchLarge: false },
  { id: "S2", min: 200_000, max: 320_000, models: ["claude-sonnet-5"], searchLarge: true },
];

/**
 * Protocol section 9. A0 is a full-price cell, so it runs at full weight in the
 * cheap pilot and on a fifth of the bundles afterwards. NC carries no bundle at
 * all and costs almost nothing, so it runs everywhere.
 */
type RunConfig = { id: string; bundles: Record<"S1" | "S2", number>; k: number; a0Share: number };

const CONFIGS: RunConfig[] = [
  { id: "pilot", bundles: { S1: 5, S2: 0 }, k: 3, a0Share: 1 },
  { id: "interim", bundles: { S1: 22, S2: 8 }, k: 1, a0Share: 0.2 },
  { id: "full", bundles: { S1: 70, S2: 30 }, k: 1, a0Share: 0.2 },
];

/**
 * The user approved 500 USD, for the pilot only. Every cap sits at that figure
 * rather than at what each config would like to cost. Against the reachable
 * frame all three price under it, so this cap is not what gates a run:
 * `--approved-usd` is, and it has to reach the projection. They are plans, not
 * permissions.
 */
const BUDGET_CAP_USD = { pilot: 500, interim: 500, full: 500 };

// ---------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(pool: T[], rand: () => number): T[] {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ---------------------------------------------------------------------------
// The sample file
// ---------------------------------------------------------------------------

export type SampleCell = { language: string; size: string; urls: string[] };

/** Cells in file order, primaries before reserves, as the sample's own replacement rule requires. */
export function parseSample(text: string): SampleCell[] {
  const cells: SampleCell[] = [];
  let current: SampleCell | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const header = /^#\s*---\s*(.+?)\s*\/\s*(.+?)\s*---$/.exec(line);
    if (header) {
      current = { language: header[1], size: header[2], urls: [] };
      cells.push(current);
      continue;
    }
    if (!current) continue;
    const reserve = /^#\s*reserve\s*\d+:\s*(\S+)/.exec(line);
    if (reserve) {
      current.urls.push(reserve[1]);
      continue;
    }
    if (line && !line.startsWith("#")) current.urls.push(line);
  }
  return cells;
}

const base = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const repoName = (url: string) => base(url).replace(/\.git$/, "");

// ---------------------------------------------------------------------------
// Bug injection. Protocol section 4.2.
// ---------------------------------------------------------------------------

/** Six characters or more, so language keywords and one-letter locals stay out. */
const IDENTIFIER = /\b[A-Za-z_][A-Za-z0-9_]{5,}\b/g;

export type Injection = {
  /** The identifier whose definition site was renamed away. */
  symbol: string;
  /** What it became in the defining file. Never existed anywhere before. */
  renamed: string;
  /** The file left holding the only reference, and the answer to the question. */
  referencePath: string;
  /** Three identifiers that stay defined, so the question is not a giveaway. */
  distractors: string[];
};

const occurrences = (content: string, symbol: string) =>
  content.split(new RegExp(`\\b${symbol}\\b`)).length - 1;

/**
 * A definition site, by the keyword in front of it. Deliberately conservative
 * and language-agnostic: false negatives only shrink a pool that runs to
 * hundreds, while a false positive would break the question's premise.
 *
 * Without this, "appears in two files" would admit an imported library symbol
 * that is defined in neither. The question claims exactly one of four candidates
 * is undefined; if a distractor were also undefined the question would have two
 * right answers and the graded one would be arbitrary.
 */
const DEFINITION_KEYWORDS =
  "function|class|def|const|let|var|type|interface|struct|enum|trait|impl|fn|func|public|private|protected|static|val|module|namespace|record";

export const isDefinedIn = (content: string, symbol: string) =>
  new RegExp(`\\b(?:${DEFINITION_KEYWORDS})\\s+(?:[\\w<>\\[\\],*&.]+\\s+)?${symbol}\\b`).test(content);

/**
 * Renames one symbol's occurrences in the file that holds most of them, leaving
 * exactly one other file referring to a name nothing defines any more.
 *
 * Why this shape and not "which file defines X". A public repository is in every
 * training corpus, so "which file defines parseConfig" is answerable from
 * memory, and an arm that is never read scores the same as one that is. Here the
 * remembered answer is wrong: in the real repository all four candidates are
 * defined, and only reading the bundle reveals which one is not.
 */
export function injectBrokenReferences(
  files: OutputFile[],
  count: number,
  rand: () => number,
): { files: OutputFile[]; injections: Injection[] } {
  const perFile = files.map((f) => new Set(f.content.match(IDENTIFIER) ?? []));
  const filesWith = new Map<string, number[]>();
  perFile.forEach((symbols, i) => {
    for (const symbol of symbols) {
      const list = filesWith.get(symbol);
      if (list) list.push(i);
      else filesWith.set(symbol, [i]);
    }
  });

  // A candidate is defined in exactly one file and referenced in at least one
  // other. The rename covers the definition file and every referencing file
  // except one, so exactly one file is left holding the stale name.
  //
  // An earlier rule required the symbol to live in exactly two files. Measured on
  // 2026-09-07 over 54 repositories, that starved the primary family: most
  // in-band bundles yielded 2 to 7 injectable defects against the 12 needed.
  // Renaming the other referencing sites costs nothing and keeps the answer
  // unique, which is the only property the question needs.
  const candidates: { symbol: string; def: number; ref: number; alsoRename: number[] }[] = [];
  for (const [symbol, where] of filesWith) {
    if (where.length < 2) continue;
    const definers = where.filter((i) => isDefinedIn(files[i].content, symbol));
    if (definers.length !== 1) continue;
    const def = definers[0];
    const referrers = where.filter((i) => i !== def);
    if (referrers.length === 0) continue;
    // The one left dangling is the file that mentions it least, so the rename
    // rewrites as little of the bundle as possible.
    const ref = referrers.reduce((best, i) =>
      occurrences(files[i].content, symbol) < occurrences(files[best].content, symbol) ? i : best,
    );
    candidates.push({ symbol, def, ref, alsoRename: referrers.filter((i) => i !== ref) });
  }
  candidates.sort((x, y) => (x.symbol < y.symbol ? -1 : 1));

  // Any symbol with a real definition site will do, including one defined and
  // used inside a single file. Requiring two files here as well would leave
  // nothing to draw from once the candidates are taken.
  const distractorPool = [...filesWith]
    .filter(([symbol, where]) => where.some((i) => isDefinedIn(files[i].content, symbol)))
    .map(([symbol]) => symbol)
    .sort();

  const chosen = shuffled(candidates, rand).slice(0, count);
  const renamedFiles = files.map((f) => ({ ...f }));
  const injections: Injection[] = [];
  const used = new Set(chosen.map((c) => c.symbol));

  for (const candidate of chosen) {
    const renamed = `${candidate.symbol}_r${Math.floor(rand() * 0xffff)
      .toString(16)
      .padStart(4, "0")}`;
    for (const index of [candidate.def, ...candidate.alsoRename]) {
      renamedFiles[index].content = renamedFiles[index].content.replace(
        new RegExp(`\\b${candidate.symbol}\\b`, "g"),
        renamed,
      );
    }
    const distractors = shuffled(
      distractorPool.filter((s) => !used.has(s) && s !== candidate.symbol),
      rand,
    ).slice(0, 3);
    if (distractors.length < 3) continue;
    injections.push({
      symbol: candidate.symbol,
      renamed,
      referencePath: files[candidate.ref].path,
      distractors,
    });
  }

  return { files: renamedFiles, injections };
}

// ---------------------------------------------------------------------------
// Questions. Generated from the raw file set only (protocol 4.1).
// ---------------------------------------------------------------------------

export type Family = "bug" | "loc";

export type Question = {
  id: string;
  bundle: string;
  family: Family;
  /** 0 to 4 over character fractions of content, a covariate not a stratum. */
  band: number;
  prompt: string;
  answer: string;
};

const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;

export function isEligibleLine(trimmed: string): boolean {
  return (
    trimmed.length >= 40 &&
    trimmed.length <= 200 &&
    /[A-Za-z0-9]/.test(trimmed) &&
    PRINTABLE_ASCII.test(trimmed)
  );
}

/**
 * Character fractions, not token fractions (addendum, and protocol 6):
 * tokenizers differ across models, so a token fraction would put the same answer
 * in a different band for each model.
 */
export function bandOf(fraction: number): number {
  return Math.min(BANDS - 1, Math.max(0, Math.floor(fraction * BANDS)));
}

/** Where each file's content starts, as a fraction of total content characters. */
function fileFractions(files: OutputFile[]): number[] {
  const total = files.reduce((sum, f) => sum + f.content.length + 1, 0) || 1;
  let before = 0;
  return files.map((f) => {
    const fraction = before / total;
    before += f.content.length + 1;
    return fraction;
  });
}

/**
 * A filename gives the answer away when the question text already contains the
 * answer file's stem: `useAuth` living in `useAuth.ts` would hand the two treed
 * arms a win on the tree alone. This is the free half of the leakage screen; the
 * paid half is `--screen`, which asks the model with a tree-only context.
 */
export function leaksFilename(prompt: string, answerPath: string): boolean {
  const stem = base(answerPath).replace(/\.[^.]+$/, "");
  return stem.length >= 4 && prompt.includes(stem);
}

export function generateQuestions(
  bundleId: string,
  files: OutputFile[],
  injections: Injection[],
  rand: () => number,
): Question[] {
  const fractions = fileFractions(files);
  const indexOf = new Map(files.map((f, i) => [f.path, i]));
  const questions: Question[] = [];

  for (const injection of injections) {
    const options = shuffled([injection.symbol, ...injection.distractors], rand);
    const prompt = [
      "Exactly one of these four identifiers is referenced somewhere in this bundle",
      "but is not defined anywhere in it. The other three are both referenced and defined.",
      "",
      options.map((o) => `- ${o}`).join("\n"),
      "",
      "Which file contains the reference to the identifier that is never defined?",
    ].join("\n");
    if (leaksFilename(prompt, injection.referencePath)) continue;
    questions.push({
      id: `${bundleId}#bug${questions.length}`,
      bundle: bundleId,
      family: "bug",
      band: bandOf(fractions[indexOf.get(injection.referencePath)!]),
      prompt,
      answer: injection.referencePath,
    });
  }

  // Secondary stratum, kept for comparability with the published table studies.
  // Uniqueness is computed on raw file text, so it is the same set for every arm.
  const byText = new Map<string, { path: string; fraction: number }[]>();
  files.forEach((file, i) => {
    let inner = 0;
    const total = files.reduce((sum, f) => sum + f.content.length + 1, 0) || 1;
    for (const line of file.content.split("\n")) {
      const trimmed = line.trim();
      if (isEligibleLine(trimmed)) {
        const list = byText.get(trimmed);
        const entry = { path: file.path, fraction: (fractions[i] * total + inner) / total };
        if (list) list.push(entry);
        else byText.set(trimmed, [entry]);
      }
      inner += line.length + 1;
    }
  });

  const unique = [...byText]
    .filter(([, hits]) => hits.length === 1)
    .map(([text, hits]) => ({ text, ...hits[0] }))
    .sort((a, b) => (a.text < b.text ? -1 : 1));

  for (const pick of shuffled(unique, rand)) {
    if (questions.length >= BUG_PER_BUNDLE + LOC_PER_BUNDLE) break;
    const prompt = `Which file in this bundle contains the following line?\n\n${pick.text}`;
    if (leaksFilename(prompt, pick.path)) continue;
    questions.push({
      id: `${bundleId}#loc${questions.length}`,
      bundle: bundleId,
      family: "loc",
      band: bandOf(pick.fraction),
      prompt,
      answer: pick.path,
    });
  }

  return questions;
}

// ---------------------------------------------------------------------------
// The six renderings
// ---------------------------------------------------------------------------

export function render(arm: ArmId, files: OutputFile[], source: string, rand: () => number): string {
  const paths = files.map((f) => f.path);
  const treed = {
    projectName: generateProjectName(paths),
    files,
    tree: generateFileTree(paths),
    source,
  };

  switch (arm) {
    case "NC":
      return "";
    // The paid half of the leakage screen (protocol 4). A question the tree
    // alone can answer is measuring filenames, not the wrapper, so every item
    // this arm gets right is dropped before the contrasts are computed.
    case "TR":
      return `Directory structure:\n${treed.tree.trimEnd()}`;
    // Every path stripped and the tree removed. "Which file" then has no
    // answer in the bundle, so accuracy must collapse. If it does not, the
    // model is answering from memory of the public repository, or the grader
    // is broken, and either way the run is void (protocol 9.2).
    case "A0":
      return shuffled(files, rand)
        .map((f) => `<file>\n${f.content}\n</file>`)
        .join("\n");
    case "A1":
      return files.map((f) => `${f.path}\n${f.content}`).join("\n");
    case "A2":
      return files
        .map((f) => {
          const fence = fenceFor(f.content);
          return `### ${f.path}\n\n${fence}${getLanguageFromPath(f.path)}\n${f.content}\n${fence}`;
        })
        .join("\n\n");
    case "A3":
      return assembleOutput({ ...treed, style: "markdown" });
    case "A4":
      return assembleOutput({ ...treed, style: "xml" });
  }
}

// ---------------------------------------------------------------------------
// Grading. Raw and normalised both reported (protocol 4.4).
// ---------------------------------------------------------------------------

export function normalizeAnswer(text: string): string {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  const last = lines.length ? lines[lines.length - 1] : "";
  // The trailing period comes off before the quotes, or `"a/b.ts".` keeps its
  // closing quote and a correct answer grades wrong.
  return last
    .trim()
    .replace(/\.$/, "")
    .replace(/^[`'"]+/, "")
    .replace(/[`'"]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Both grades. Exact match alone would score a formatting habit an arm taught. */
export function grade(question: Question, text: string): { raw: boolean; normalized: boolean } {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const rawLast = lines.length ? lines[lines.length - 1] : "";
  const expected = question.answer.replace(/\s+/g, " ").trim();
  const strip = (s: string) => s.replace(/^\.\//, "");
  return {
    raw: strip(rawLast) === strip(expected),
    normalized: strip(normalizeAnswer(text)) === strip(expected),
  };
}

// ---------------------------------------------------------------------------
// Statistics. Protocol section 5. Nothing published is arithmetic done by hand.
// ---------------------------------------------------------------------------

/** Abramowitz and Stegun 7.1.26, absolute error below 1.5e-7. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-z * z);
  return sign * y;
}

export const normalCdf = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));

/** Bisection rather than a rational approximation: slower, and obviously right. */
export function normalQuantile(p: number): number {
  let lo = -10;
  let hi = 10;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (normalCdf(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Pairs needed for McNemar to detect a marginal difference `d` at discordance
 * `psi`. This is the EFFECTIVE n; multiply by the design effect to get questions.
 */
export function mcnemarPairs(d: number, psi: number, alpha: number, power: number): number {
  if (d <= 0 || d * d >= psi) return Infinity;
  const za = normalQuantile(1 - alpha / 2);
  const zb = normalQuantile(power);
  const numerator = za * Math.sqrt(psi) + zb * Math.sqrt(psi - d * d);
  return (numerator * numerator) / (d * d);
}

/** The smallest difference `n` effective pairs can detect. Bisection on the line above. */
export function mcnemarMde(n: number, psi: number, alpha: number, power: number): number {
  let lo = 1e-5;
  let hi = Math.sqrt(psi) - 1e-9;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (mcnemarPairs(mid, psi, alpha, power) > n) lo = mid;
    else hi = mid;
  }
  return hi;
}

export function mcnemarP(b: number, c: number): number {
  if (b + c === 0) return 1;
  const chi = Math.pow(Math.abs(b - c) - 1, 2) / (b + c);
  if (chi <= 0) return 1;
  return 2 * (1 - normalCdf(Math.sqrt(chi)));
}

/**
 * One-way ANOVA intra-cluster correlation on 0/1 outcomes, clusters = bundles.
 * Reported because the design effect must be measured rather than assumed; the
 * pilot exists mostly to produce this number.
 */
export function icc(groups: number[][]): number {
  const sizes = groups.map((g) => g.length).filter((n) => n > 0);
  if (sizes.length < 2) return 0;
  const present = groups.filter((g) => g.length > 0);
  const total = present.flat();
  const n = total.length;
  const grand = total.reduce((a, b) => a + b, 0) / n;
  const k = present.length;
  const msb =
    present.reduce((sum, g) => {
      const mean = g.reduce((a, b) => a + b, 0) / g.length;
      return sum + g.length * (mean - grand) ** 2;
    }, 0) /
    (k - 1);
  const msw =
    present.reduce((sum, g) => {
      const mean = g.reduce((a, b) => a + b, 0) / g.length;
      return sum + g.reduce((s, y) => s + (y - mean) ** 2, 0);
    }, 0) /
    Math.max(1, n - k);
  const n0 = (n - sizes.reduce((s, m) => s + m * m, 0) / n) / (k - 1);
  const value = (msb - msw) / (msb + (n0 - 1) * msw);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

/**
 * Paired contrast with a bundle-level cluster bootstrap.
 *
 * The protocol's stated analysis is a logistic mixed model with random
 * intercepts for bundle and item. This is the same correction without fitting
 * code: resampling whole bundles carries the within-bundle dependence exactly,
 * assumes no distribution, and yields the TOST interval directly. The deviation
 * and its reason are in protocol section 5.4.
 */
export function clusterBootstrap(
  byBundle: { a: number[]; b: number[] }[],
  draws: number,
  rand: () => number,
): { diff: number; lo90: number; hi90: number } {
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);
  const pooled = (sets: { a: number[]; b: number[] }[]) =>
    mean(sets.flatMap((s) => s.a)) - mean(sets.flatMap((s) => s.b));

  const diffs: number[] = [];
  for (let i = 0; i < draws; i++) {
    const resampled = Array.from(
      { length: byBundle.length },
      () => byBundle[Math.floor(rand() * byBundle.length)],
    );
    diffs.push(pooled(resampled));
  }
  diffs.sort((x, y) => x - y);
  const at = (q: number) => diffs[Math.min(diffs.length - 1, Math.floor(q * diffs.length))];
  return { diff: pooled(byBundle), lo90: at(0.05), hi90: at(0.95) };
}

/** TOST at alpha 0.05 each side is the 90% interval sitting inside the margin. */
export const equivalent = (lo: number, hi: number, margin: number) => lo > -margin && hi < margin;

// ---------------------------------------------------------------------------
// Bundles
// ---------------------------------------------------------------------------

type Bundle = {
  url: string;
  commit: string;
  language: string;
  size: string;
  band: "S1" | "S2";
  files: OutputFile[];
  notText: number;
  /** Delimiter-collision shares, for the stratification in protocol 7.3. */
  markdownShare: number;
  angleShare: number;
  rendered: Record<ArmId, string>;
  tokens: Record<ArmId, number>;
  questions: Question[];
};

async function keptPaths(cwd: string): Promise<string[]> {
  const afterIgnore = await glob("**/*", {
    cwd,
    nodir: true,
    dot: false,
    ignore: [...DEFAULT_GLOB_IGNORE],
  });
  const gitignores = await glob("**/.gitignore", {
    cwd,
    nodir: true,
    dot: true,
    ignore: [...DEFAULT_GLOB_IGNORE],
  });
  if (gitignores.length === 0) return afterIgnore.sort();
  const matcher = createGitignoreMatcher(
    gitignores.map((rel) => {
      const slash = rel.lastIndexOf("/");
      return {
        dir: slash === -1 ? "" : rel.slice(0, slash),
        content: fs.readFileSync(path.join(cwd, rel), "utf-8"),
      };
    }),
  );
  return afterIgnore.filter((file) => !matcher.ignores(file)).sort();
}

type Encoder = ReturnType<typeof encoding_for_model>;

async function readFiles(dir: string) {
  const files: OutputFile[] = [];
  const excluded: ExcludedSummary = { binary: [], oversize: [], unreadable: [] };
  for (const rel of await keptPaths(dir)) {
    const full = path.join(dir, rel);
    let size = 0;
    try {
      size = fs.statSync(full).size;
    } catch {
      continue;
    }
    if (size > MAX_FILE_BYTES) {
      excluded.oversize!.push(rel);
      continue;
    }
    // glob's nodir still returns a symlink pointing at a directory, and reading
    // one throws EISDIR. Before this catch existed one such link cost the whole
    // repository.
    try {
      const decoded = classifyBytes(fs.readFileSync(full));
      if (decoded.classification === "binary") excluded.binary!.push(rel);
      else files.push({ path: rel, content: decoded.text });
    } catch {
      excluded.unreadable!.push(rel);
    }
  }
  return { files, excluded };
}

async function buildBundle(
  url: string,
  dir: string,
  cell: SampleCell,
  band: "S1" | "S2",
  enc: Encoder,
): Promise<Bundle> {
  // A clone with no ceiling stalls the whole walk, and nothing supervises it.
  // Five minutes is generous for a shallow clone of a 200 MB repository; past
  // that the candidate is treated as a failed clone and the walk moves on.
  execFileSync("git", ["clone", "--depth", "1", "--quiet", url, dir], {
    stdio: "pipe",
    timeout: 300_000,
  });
  const commit = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], {
    encoding: "utf-8",
  }).trim();

  const { files, excluded } = await readFiles(dir);
  const id = repoName(url);
  const rand = mulberry32(SEED + id.length);

  const chars = files.reduce((sum, f) => sum + f.content.length, 0) || 1;
  const markdownShare =
    files.filter((f) => /\.mdx?$/i.test(f.path)).reduce((s, f) => s + f.content.length, 0) / chars;
  const angleShare =
    files.filter((f) => /\.(jsx|tsx|html|xml|vue|svelte)$/i.test(f.path)).reduce((s, f) => s + f.content.length, 0) /
    chars;

  const injected = injectBrokenReferences(files, BUG_PER_BUNDLE, rand);
  const questions = generateQuestions(id, injected.files, injected.injections, rand);

  const rendered = {} as Record<ArmId, string>;
  const tokens = {} as Record<ArmId, number>;
  for (const arm of ARMS) {
    rendered[arm] = render(arm, injected.files, `local:${id}`, mulberry32(SEED));
    tokens[arm] = rendered[arm] ? enc.encode(rendered[arm]).length : 0;
  }

  return {
    url,
    commit,
    language: cell.language,
    size: cell.size,
    band,
    files: injected.files,
    notText: excluded.binary!.length,
    markdownShare,
    angleShare,
    rendered,
    tokens,
    questions,
  };
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

type Attempt = {
  url: string;
  language: string;
  outcome: string;
  tokens?: number;
  questions?: number;
  /** F-BUG questions specifically: the primary family, counted on its own. */
  bugs?: number;
};

async function selectForBand(
  size: SizeBand,
  want: number,
  cells: SampleCell[],
  workRoot: string,
  enc: Encoder,
  keep: boolean,
): Promise<{ bundles: Bundle[]; attempts: Attempt[] }> {
  const languages = [...new Set(cells.map((c) => c.language))];
  const order = size.searchLarge ? ["large", "medium"] : ["small", "medium"];
  const queues = new Map(
    languages.map((language) => [
      language,
      order.flatMap((s) => cells.find((c) => c.language === language && c.size === s)?.urls ?? []),
    ]),
  );

  const bundles: Bundle[] = [];
  const attempts: Attempt[] = [];
  const note = (a: Attempt) => {
    attempts.push(a);
    process.stderr.write(
      `  ${size.id} ${a.outcome.slice(0, 22).padEnd(22)}` +
        `${a.tokens ? String(a.tokens).padStart(9) : "        -"}  ${a.url}\n`,
    );
  };

  // Round-robin, so every language is drawn once before any is drawn twice.
  let progress = true;
  while (bundles.length < want && progress) {
    progress = false;
    for (const language of languages) {
      if (bundles.length >= want) break;
      const queue = queues.get(language)!;
      while (queue.length > 0) {
        const url = queue.shift()!;
        progress = true;
        const cell = cells.find((c) => c.language === language && c.urls.includes(url))!;
        const dir = path.join(workRoot, `${size.id}-${repoName(url)}`);
        let bundle: Bundle;
        try {
          bundle = await buildBundle(url, dir, cell, size.id, enc);
        } catch (err) {
          note({ url, language, outcome: `clone failed: ${err instanceof Error ? err.message : err}` });
          continue;
        }
        const n = bundle.tokens.A4;
        if (n < size.min || n > size.max) {
          note({ url, language, outcome: "outside band", tokens: n });
          if (!keep) fs.rmSync(dir, { recursive: true, force: true });
          continue;
        }
        // Counted separately on purpose. F-LOC backfills whatever F-BUG does not
        // supply, so a bundle can reach 20 questions with almost no injected
        // defects in it, and the contamination fix would quietly evaporate while
        // the bundle still looked like it qualified.
        const bugs = bundle.questions.filter((q) => q.family === "bug").length;
        if (bundle.questions.length < QUESTIONS_PER_BUNDLE || bugs < BUG_PER_BUNDLE) {
          note({
            url,
            language,
            outcome: `only ${bugs} bug / ${bundle.questions.length} total`,
            tokens: n,
            questions: bundle.questions.length,
            bugs,
          });
          if (!keep) fs.rmSync(dir, { recursive: true, force: true });
          continue;
        }
        note({ url, language, outcome: "selected", tokens: n, questions: bundle.questions.length, bugs });
        bundles.push(bundle);
        if (!keep) fs.rmSync(dir, { recursive: true, force: true });
        break;
      }
    }
  }

  return { bundles, attempts };
}

// ---------------------------------------------------------------------------
// Projection. Cache writes are the headline, not tokens (addendum 1).
// ---------------------------------------------------------------------------

type Projection = {
  config: string;
  band: string;
  model: ModelId;
  arm: ArmId;
  bundles: number;
  calls: number;
  cacheWrites: number;
  prefixTokens: number;
  usd: number;
};

function armBundles(config: RunConfig, arm: ArmId, bundles: Bundle[]): Bundle[] {
  if (arm !== "A0") return bundles;
  return bundles.slice(0, Math.max(1, Math.round(bundles.length * config.a0Share)));
}

function project(config: RunConfig, all: Bundle[], enc: Encoder): Projection[] {
  const rows: Projection[] = [];
  const instruction = enc.encode(INSTRUCTION).length;
  const instructionNc = enc.encode(INSTRUCTION_NC).length;

  for (const size of SIZES) {
    const pool = all.filter((b) => b.band === size.id).slice(0, config.bundles[size.id]);
    if (pool.length === 0) continue;
    for (const model of size.models) {
      const rate = MODELS[model];
      for (const arm of ARMS) {
        const bundles = armBundles(config, arm, pool);
        let prefixTokens = 0;
        let questionTokens = 0;
        let calls = 0;
        let write = 0;
        let read = 0;
        let uncachedPrefix = 0;
        let cachedBlocks = 0;

        for (const bundle of bundles) {
          const questions = bundle.questions.slice(0, QUESTIONS_PER_BUNDLE);
          const perQuestion = questions.reduce((s, q) => s + enc.encode(q.prompt).length, 0);
          // The no-context arm has no cacheable prefix worth writing: the
          // instruction alone is far under every model's minimum.
          if (arm === "NC") {
            calls += questions.length * config.k;
            questionTokens += (perQuestion + instructionNc * questions.length) * config.k;
            continue;
          }
          const prefix = instruction + bundle.tokens[arm];
          const blockCalls = questions.length * config.k;
          prefixTokens += prefix;
          calls += blockCalls;
          if (prefix < rate.minCacheable) {
            // The tree-only screen can land under a model's minimum cacheable
            // prefix, where a cache_control marker is silently ignored: no error,
            // no entry. Pricing it as a hit would understate every call.
            uncachedPrefix += prefix * blockCalls;
          } else {
            // One write per (model, bundle, arm) block, because the run order is
            // bundle-major and a block bursts inside the 5 minute TTL.
            write += prefix;
            read += prefix * (blockCalls - 1);
            cachedBlocks++;
          }
          questionTokens += perQuestion * config.k;
        }

        if (calls === 0) continue;
        rows.push({
          config: config.id,
          band: size.id,
          model,
          arm,
          bundles: bundles.length,
          calls,
          cacheWrites: cachedBlocks,
          prefixTokens,
          usd:
            (write * rate.cacheWrite +
              read * rate.cacheRead +
              (questionTokens + uncachedPrefix) * rate.input +
              calls * rate.assumedOutput * rate.output) /
            1_000_000,
        });
      }
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// The paid run
// ---------------------------------------------------------------------------

type ResultRow = {
  config: string;
  band: string;
  model: ModelId;
  /** What the API said it served, next to the id we pinned. */
  servedModel: string;
  arm: ArmId;
  bundle: string;
  questionId: string;
  family: Family;
  positionBand: number;
  repeat: number;
  response: string;
  stopReason: string | null;
  correctRaw: boolean;
  correctNormalized: boolean;
  gradable: boolean;
  usage: { input: number; cacheWrite: number; cacheRead: number; output: number };
};

/**
 * One (model, bundle, arm) block, bursted. Protocol 10.2: the first call runs
 * alone so exactly one cache write is paid, the rest read the entry it created,
 * and every read refreshes the 5 minute timer so the block never re-writes.
 */
async function runBlock(
  client: Anthropic,
  config: RunConfig,
  size: SizeBand,
  model: ModelId,
  bundle: Bundle,
  arm: ArmId,
): Promise<ResultRow[]> {
  const rate = MODELS[model];
  const context = bundle.rendered[arm];

  const ask = async (question: Question, repeat: number): Promise<ResultRow> => {
    const row: ResultRow = {
      config: config.id,
      band: size.id,
      model,
      servedModel: "",
      arm,
      bundle: bundle.url,
      questionId: question.id,
      family: question.family,
      positionBand: question.band,
      repeat,
      response: "",
      stopReason: null,
      correctRaw: false,
      correctNormalized: false,
      gradable: false,
      usage: { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 },
    };
    try {
      const response = await client.messages.create({
        model,
        max_tokens: rate.maxTokens,
        system: context
          ? [
              { type: "text", text: INSTRUCTION },
              { type: "text", text: context, cache_control: { type: "ephemeral" } },
            ]
          : INSTRUCTION_NC,
        messages: [{ role: "user", content: question.prompt }],
        ...(rate.acceptsTemperature ? { temperature: 0 } : { output_config: { effort: "low" as const } }),
      });
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n");
      const graded = grade(question, text);
      row.servedModel = response.model;
      row.response = text.slice(0, 400);
      row.stopReason = response.stop_reason;
      row.gradable = normalizeAnswer(text).length > 0;
      row.correctRaw = graded.raw;
      row.correctNormalized = graded.normalized;
      row.usage = {
        input: response.usage.input_tokens,
        cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
        cacheRead: response.usage.cache_read_input_tokens ?? 0,
        output: response.usage.output_tokens,
      };
    } catch (err) {
      // One question failing must not cost the questions already paid for.
      row.stopReason = `error: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200);
    }
    return row;
  };

  const jobs: [Question, number][] = [];
  for (const question of bundle.questions.slice(0, QUESTIONS_PER_BUNDLE)) {
    for (let k = 0; k < config.k; k++) jobs.push([question, k]);
  }

  const rows: ResultRow[] = [await ask(jobs[0][0], jobs[0][1])];
  const rest = jobs.slice(1);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(8, rest.length) }, async () => {
      for (let i = cursor++; i < rest.length; i = cursor++) {
        rows.push(await ask(rest[i][0], rest[i][1]));
      }
    }),
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

function analyze(rows: ResultRow[]): string {
  const out: string[] = [];
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const pts = (x: number) => `${(x * 100 >= 0 ? "+" : "")}${(x * 100).toFixed(1)}`;
  const rand = mulberry32(SEED);

  for (const model of [...new Set(rows.map((r) => r.model))]) {
    for (const band of [...new Set(rows.filter((r) => r.model === model).map((r) => r.band))]) {
      const mine = rows.filter((r) => r.model === model && r.band === band);
      out.push(`\n=== ${model} / ${band} ===`);
      const served = [...new Set(mine.map((r) => r.servedModel))].filter(Boolean);
      if (served.length > 1) out.push(`  WARNING: more than one served model id: ${served.join(", ")}`);

      const rate = MODELS[model];
      const accuracy = (arm: ArmId, key: "correctRaw" | "correctNormalized") => {
        const list = mine.filter((r) => r.arm === arm);
        return list.length ? list.filter((r) => r[key]).length / list.length : NaN;
      };

      out.push("arm    n      raw      normalised  ungradable  ICC     billed USD");
      for (const arm of ARMS) {
        const list = mine.filter((r) => r.arm === arm);
        if (!list.length) continue;
        const bundles = [...new Set(list.map((r) => r.bundle))].map((b) =>
          list.filter((r) => r.bundle === b).map((r) => (r.correctNormalized ? 1 : 0)),
        );
        const usd =
          list.reduce(
            (s, r) =>
              s +
              r.usage.input * rate.input +
              r.usage.cacheWrite * rate.cacheWrite +
              r.usage.cacheRead * rate.cacheRead +
              r.usage.output * rate.output,
            0,
          ) / 1_000_000;
        out.push(
          `${arm.padEnd(6)} ${String(list.length).padEnd(6)} ` +
            `${pct(accuracy(arm, "correctRaw")).padEnd(8)} ${pct(accuracy(arm, "correctNormalized")).padEnd(11)} ` +
            `${pct(list.filter((r) => !r.gradable).length / list.length).padEnd(11)} ` +
            `${icc(bundles).toFixed(3).padEnd(7)} ${usd.toFixed(2)}`,
        );
      }

      // Manipulation check and contamination control, before any contrast is read.
      const a0 = accuracy("A0", "correctNormalized");
      const nc = accuracy("NC", "correctNormalized");
      const a4 = accuracy("A4", "correctNormalized");
      if (!Number.isNaN(a0)) {
        out.push(
          `\nA0 (paths stripped) ${pct(a0)} against A4 ${pct(a4)}: ` +
            (a4 - a0 > 0.2 ? "manipulation check PASSED" : "MUST-MOVE CONTROL DID NOT MOVE - run is void (protocol 9.2)"),
        );
      }
      const tr = accuracy("TR", "correctNormalized");
      if (!Number.isNaN(tr)) {
        out.push(
          `TR (tree only) ${pct(tr)}: ` +
            (tr > 0.1 ? "filenames leak the answer for these items; they are dropped below" : "no measurable filename leakage"),
        );
      }
      if (!Number.isNaN(nc)) {
        out.push(
          `NC (no bundle) ${pct(nc)}: ` +
            (nc > 0.15
              ? "CONTAMINATION - items answerable without the bundle must be dropped and the contrasts recomputed"
              : "no evidence the questions are answerable from memory"),
        );
      }

      // Items either screen answered are measuring memory or filenames rather
      // than the wrapper, so they come out before any contrast (protocol 4, 9.1).
      const screened = new Set(
        mine.filter((r) => (r.arm === "NC" || r.arm === "TR") && r.correctNormalized).map((r) => r.questionId),
      );
      const items = new Set(mine.map((r) => r.questionId));
      if (screened.size) {
        out.push(
          `\n${screened.size} of ${items.size} items dropped: answered by NC (memory) or TR (tree alone).`,
        );
      }
      const kept = mine.filter((r) => !screened.has(r.questionId));

      // The three single-factor contrasts, cluster bootstrapped over bundles.
      out.push("\ncontrast                        diff    90% CI            McNemar p  verdict");
      const anySignificant: boolean[] = [];
      for (const [a, b, what] of CONTRASTS) {
        const bundles = [...new Set(kept.map((r) => r.bundle))]
          .map((bundleId) => ({
            a: kept.filter((r) => r.bundle === bundleId && r.arm === a).map((r) => (r.correctNormalized ? 1 : 0)),
            b: kept.filter((r) => r.bundle === bundleId && r.arm === b).map((r) => (r.correctNormalized ? 1 : 0)),
          }))
          .filter((g) => g.a.length && g.b.length);
        if (!bundles.length) continue;
        const boot = clusterBootstrap(bundles, 2000, rand);

        // McNemar on the matched items, for comparability with the sizing.
        const byId = new Map<string, Record<string, boolean>>();
        for (const row of kept) {
          const entry = byId.get(row.questionId) ?? {};
          entry[row.arm] = row.correctNormalized;
          byId.set(row.questionId, entry);
        }
        let bOnly = 0;
        let cOnly = 0;
        for (const entry of byId.values()) {
          if (entry[a] === undefined || entry[b] === undefined) continue;
          if (entry[a] && !entry[b]) bOnly++;
          else if (!entry[a] && entry[b]) cOnly++;
        }
        const p = mcnemarP(bOnly, cOnly);
        const significant = p < ALPHA;
        anySignificant.push(significant);
        const eq = equivalent(boot.lo90, boot.hi90, EQUIVALENCE_MARGIN);
        out.push(
          `${`${a} vs ${b} (${what})`.padEnd(32)}${pts(boot.diff).padStart(6)}  ` +
            `[${pts(boot.lo90).padStart(6)}, ${pts(boot.hi90).padStart(6)}]  ` +
            `${p.toFixed(4).padEnd(10)} ` +
            (significant ? "different" : eq ? "EQUIVALENT within 5 pts" : "inconclusive"),
        );
      }

      // Cost per correct answer is a monotone transform of accuracy. After a
      // null it is reading noise, so it is only printed when something moved.
      if (anySignificant.some(Boolean)) {
        // Study arms only. Cost per correct answer for a control is meaningless:
        // NC and TR carry no bundle to pay for and A0 is a mutilation.
        out.push("\nUSD per correct answer");
        for (const arm of ["A1", "A2", "A3", "A4"] as ArmId[]) {
          const list = mine.filter((r) => r.arm === arm);
          const correct = list.filter((r) => r.correctNormalized).length;
          if (!correct) continue;
          const usd =
            list.reduce(
              (s, r) =>
                s +
                r.usage.input * rate.input +
                r.usage.cacheWrite * rate.cacheWrite +
                r.usage.cacheRead * rate.cacheRead +
                r.usage.output * rate.output,
              0,
            ) / 1_000_000;
          out.push(`${arm.padEnd(6)} ${(usd / correct).toFixed(5)}`);
        }
      } else {
        out.push(
          "\nNo contrast cleared significance, so cost per correct answer is not reported:\n" +
            "it is a monotone transform of accuracy and after a null it reads noise (protocol 11.2).",
        );
      }

      // Position stays a control. Reported, never the framing.
      out.push("\naccuracy by position band (control, protocol 6)");
      for (let b = 0; b < BANDS; b++) {
        const list = kept.filter(
          (r) => r.positionBand === b && r.arm !== "NC" && r.arm !== "TR" && r.arm !== "A0",
        );
        if (!list.length) continue;
        out.push(
          `  ${(b / BANDS).toFixed(1)}-${((b + 1) / BANDS).toFixed(1)}  ` +
            pct(list.filter((r) => r.correctNormalized).length / list.length),
        );
      }

      out.push("\naccuracy by family");
      for (const family of ["bug", "loc"] as Family[]) {
        const line = ARMS.map((arm) => {
          const list = mine.filter((r) => r.family === family && r.arm === arm);
          return `${arm} ${list.length ? pct(list.filter((r) => r.correctNormalized).length / list.length) : "-"}`;
        }).join("  ");
        out.push(`  ${family.padEnd(4)} ${line}`);
      }
    }
  }

  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

function printProjection(config: RunConfig, bundles: Bundle[], enc: Encoder) {
  const rows = project(config, bundles, enc);
  const total = rows.reduce((s, r) => s + r.usd, 0);
  const calls = rows.reduce((s, r) => s + r.calls, 0);
  const writes = rows.reduce((s, r) => s + r.cacheWrites, 0);
  const items = (["S1", "S2"] as const).reduce(
    (s, band) =>
      s +
      bundles
        .filter((b) => b.band === band)
        .slice(0, config.bundles[band])
        .reduce((n, b) => n + Math.min(QUESTIONS_PER_BUNDLE, b.questions.length), 0),
    0,
  );
  const cap = BUDGET_CAP_USD[config.id as keyof typeof BUDGET_CAP_USD];

  process.stdout.write(`\n\n=== ${config.id} (k=${config.k}) ===\n`);
  process.stdout.write("band model                      arm  bundles  calls  writes  prefix tokens      USD\n");
  for (const r of rows) {
    process.stdout.write(
      `${r.band.padEnd(5)}${r.model.padEnd(27)}${r.arm.padEnd(5)}` +
        `${String(r.bundles).padStart(7)}${String(r.calls).padStart(7)}` +
        `${String(r.cacheWrites).padStart(8)}${String(r.prefixTokens).padStart(15)}` +
        `${r.usd.toFixed(2).padStart(9)}\n`,
    );
  }
  process.stdout.write(
    `\n${items} items per arm, ${calls} calls, ${writes} cache writes, ${total.toFixed(2)} USD` +
      (cap ? ` (cap ${cap})` : "") +
      (cap && total > cap ? "  OVER CAP\n" : "\n"),
  );
  // The power the config actually buys, not the power it was designed for.
  const eff = items / designEffect(QUESTIONS_PER_BUNDLE, ICC_ASSUMED);
  process.stdout.write(
    `Effective n ${eff.toFixed(0)}, MDE ` +
      `${(mcnemarMde(eff, PSI_ASSUMED, ALPHA, POWER) * 100).toFixed(1)} pts at the assumed ICC.\n`,
  );
}

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

function printPower(extraN: number[]) {
  const de = designEffect(QUESTIONS_PER_BUNDLE, ICC_ASSUMED);
  process.stdout.write(
    `Paired sizing by McNemar per contrast, on the EFFECTIVE n.\n` +
      `psi ${PSI_ASSUMED}, alpha ${ALPHA.toFixed(4)} (Bonferroni over ${CONTRASTS.length} contrasts), power ${POWER}.\n` +
      `${QUESTIONS_PER_BUNDLE} questions per bundle at ICC ${ICC_ASSUMED} gives a design effect of ${de.toFixed(2)},\n` +
      `so effective n = questions / ${de.toFixed(2)}. Sizing on the raw count would overstate\n` +
      `precision by a factor of sqrt(${de.toFixed(2)}) = ${Math.sqrt(de).toFixed(2)}.\n\n`,
  );

  // psi is the one planning input that cannot be known before a run. The pilot
  // measures it; until then every MDE is conditional on it, so all three columns
  // are printed rather than the planning value alone.
  const psis = [0.15, 0.25, 0.35];
  process.stdout.write(
    "questions   effective n   " + psis.map((p) => `psi=${p.toFixed(2)}`.padEnd(12)).join("") + "\n",
  );
  const ns = [...new Set([100, 300, 600, 1000, 2000, ...extraN])].sort((a, b) => a - b);
  for (const raw of ns) {
    const eff = raw / de;
    process.stdout.write(
      `${String(raw).padEnd(12)}${eff.toFixed(0).padEnd(14)}` +
        psis
          .map((psi) => `${(mcnemarMde(eff, psi, ALPHA, POWER) * 100).toFixed(1)} pts`.padEnd(12))
          .join("") +
        "\n",
    );
  }

  // When the corpus caps the bundle count, the only lever left is questions per
  // bundle, and it fights itself: more questions per bundle means a bigger design
  // effect. This is the table that says whether the lever still pays.
  process.stdout.write(
    "\nWhen bundles are capped, more questions per bundle still buys effective n,\n" +
      "but each extra question is worth less because it raises the design effect:\n\n" +
      "bundles  m=20            m=40            m=60            m=100\n",
  );
  for (const clusters of [20, 38, 60, 100]) {
    const cell = (m: number) => {
      const eff = (clusters * m) / designEffect(m, ICC_ASSUMED);
      return `${(mcnemarMde(eff, PSI_ASSUMED, ALPHA, POWER) * 100).toFixed(1)} (n ${eff.toFixed(0)})`.padEnd(16);
    };
    process.stdout.write(`${String(clusters).padEnd(9)}${[20, 40, 60, 100].map(cell).join("")}\n`);
  }

  const forMargin = (d: number) => Math.ceil(mcnemarPairs(d, PSI_ASSUMED, ALPHA, POWER) * de);
  process.stdout.write(
    `\nEquivalence margin ${(EQUIVALENCE_MARGIN * 100).toFixed(0)} points, tested by TOST.\n` +
      `Questions needed to resolve 5 points: ${forMargin(0.05).toLocaleString("en-US")}.\n` +
      `Questions needed to resolve 2 points: ${forMargin(0.02).toLocaleString("en-US")}.\n`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.power) {
    printPower(
      typeof args.n === "string" ? args.n.split(",").map(Number).filter(Number.isFinite) : [],
    );
    return;
  }

  // Re-price a saved dry run. The walk takes an hour of cloning and the rates
  // and the cost model get argued about, so the two are separable on purpose.
  if (typeof args.price === "string") {
    const saved = JSON.parse(fs.readFileSync(args.price, "utf-8")) as {
      bundles: (Pick<Bundle, "url" | "band" | "language"> & {
        tokens: Record<ArmId, number>;
        questions: Question[];
      })[];
    };
    const enc = encoding_for_model(TOKEN_MODEL);
    try {
      for (const config of CONFIGS) {
        printProjection(config, saved.bundles as unknown as Bundle[], enc);
      }
    } finally {
      enc.free();
    }
    return;
  }

  if (typeof args.analyze === "string") {
    const report = JSON.parse(fs.readFileSync(args.analyze, "utf-8")) as { rows: ResultRow[] };
    process.stdout.write(analyze(report.rows) + "\n");
    return;
  }

  const listPath = typeof args.repos === "string" ? args.repos : "";
  if (!listPath) {
    process.stderr.write(
      "Error: --repos <file> is required. The sample is pre-registered in\n" +
        "scripts/repo-sample-2026-09-07.txt and this script will not pick one for you.\n",
    );
    process.exit(1);
  }

  const configs = typeof args.config === "string"
    ? CONFIGS.filter((c) => c.id === args.config)
    : CONFIGS;
  if (configs.length === 0) {
    process.stderr.write(`Error: unknown --config. Known: ${CONFIGS.map((c) => c.id).join(", ")}\n`);
    process.exit(1);
  }

  const cells = parseSample(fs.readFileSync(listPath, "utf-8"));
  const enc = encoding_for_model(TOKEN_MODEL);
  const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fc-formateval-"));
  const keep = args.keep === true;

  try {
    // One walk, priced for every config: the largest requested count per band.
    const bundles: Bundle[] = [];
    const attempts: Attempt[] = [];
    for (const size of SIZES) {
      const want = Math.max(...configs.map((c) => c.bundles[size.id]));
      if (want === 0) continue;
      process.stderr.write(`\n[${size.id}] want ${want}, band ${size.min}-${size.max} A4 tokens\n`);
      const found = await selectForBand(size, want, cells, workRoot, enc, keep);
      bundles.push(...found.bundles);
      attempts.push(...found.attempts);
    }

    if (bundles.length === 0) {
      process.stderr.write("\nNo repository qualified.\n");
      process.exit(1);
    }

    process.stdout.write("\nSelected bundles (A4 = xml with tree, the product's default)\n");
    process.stdout.write("band lang         A1 tokens  A2 tokens  A3 tokens  A4 tokens   qs bug  md%  angle%\n");
    for (const b of bundles) {
      process.stdout.write(
        `${b.band.padEnd(5)}${b.language.padEnd(13)}` +
          [b.tokens.A1, b.tokens.A2, b.tokens.A3, b.tokens.A4]
            .map((t) => String(t).padStart(10))
            .join(" ") +
          `  ${String(b.questions.length).padStart(3)} ${String(b.questions.filter((q) => q.family === "bug").length).padStart(3)}  ` +
          `${(b.markdownShare * 100).toFixed(0).padStart(3)}  ` +
          `${(b.angleShare * 100).toFixed(0).padStart(5)}  ${b.url}\n`,
      );
    }

    for (const config of configs) printProjection(config, bundles, enc);

    process.stdout.write(
      "\nCache writes above assume the pre-registered bundle-major order with each\n" +
        "block bursted inside the 5 minute TTL. An arm-major loop would multiply them\n" +
        "by the number of questions per bundle, and that is the likeliest overrun.\n" +
        "Token counts use the product's tiktoken encoding, which is not Claude's.\n",
    );

    if (!args.live) {
      const day = new Date().toISOString().slice(0, 10);
      const outPath =
        typeof args.out === "string"
          ? args.out
          : path.join(REPO_ROOT, "docs", "measurements", `format-eval-dryrun-${day}.json`);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(
        outPath,
        JSON.stringify(
          {
            mode: "dry-run",
            measured: new Date().toISOString(),
            protocol: "format-eval-protocol-2026-09-07.md",
            tokenizer: `${TOKEN_MODEL} via @dqbd/tiktoken (not Claude's tokenizer)`,
            seed: SEED,
            sampleFile: listPath,
            instruction: INSTRUCTION,
            attempts,
            bundles: bundles.map((b) => ({
              url: b.url,
              commit: b.commit,
              band: b.band,
              language: b.language,
              files: b.files.length,
              notText: b.notText,
              markdownShare: b.markdownShare,
              angleShare: b.angleShare,
              tokens: b.tokens,
              questions: b.questions,
            })),
            projections: configs.map((c) => ({ config: c.id, rows: project(c, bundles, enc) })),
          },
          null,
          2,
        ),
      );
      process.stdout.write(`\nDry run written to ${outPath}\nNo API call was made.\n`);
      return;
    }

    // --- the paid path ---
    const config = configs[0];
    if (configs.length !== 1) {
      process.stderr.write("Error: --live needs exactly one --config.\n");
      process.exit(1);
    }
    const projected = project(config, bundles, enc).reduce((s, r) => s + r.usd, 0);
    const approved = Number(args["approved-usd"]);
    if (!Number.isFinite(approved) || approved < projected) {
      process.stderr.write(
        `\nRefusing to run. --approved-usd must be at least the projected ${projected.toFixed(2)}.\n`,
      );
      process.exit(1);
    }

    const day = new Date().toISOString().slice(0, 10);
    const outPath =
      typeof args.out === "string"
        ? args.out
        : path.join(REPO_ROOT, "docs", "measurements", `format-eval-${config.id}-${day}.json`);
    if (fs.existsSync(outPath) && !args.force) {
      process.stderr.write(`Error: ${outPath} exists. Pass --out or --force.\n`);
      process.exit(1);
    }
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    const client = new Anthropic({ maxRetries: 8 });
    const rows: ResultRow[] = [];
    const flush = () =>
      fs.writeFileSync(
        outPath,
        JSON.stringify(
          {
            mode: "live",
            config: config.id,
            measured: new Date().toISOString(),
            protocol: "format-eval-protocol-2026-09-07.md",
            seed: SEED,
            sampleFile: listPath,
            pinnedModels: Object.keys(MODELS),
            rows,
          },
          null,
          2,
        ),
      );

    // Bundle-major, every arm for a bundle back to back: keeps each block inside
    // the cache TTL and keeps all arms for one bundle in the same session.
    for (const size of SIZES) {
      const pool = bundles.filter((b) => b.band === size.id).slice(0, config.bundles[size.id]);
      for (const bundle of pool) {
        for (const model of size.models) {
          for (const arm of ARMS) {
            if (!armBundles(config, arm, pool).includes(bundle)) continue;
            process.stderr.write(`[${config.id}/${size.id}/${model}/${arm}] ${bundle.url}\n`);
            rows.push(...(await runBlock(client, config, size, model, bundle, arm)));
            flush();
          }
        }
      }
    }

    process.stdout.write(analyze(rows) + `\n\nwritten to ${outPath}\n`);
  } finally {
    enc.free();
    if (!keep) fs.rmSync(workRoot, { recursive: true, force: true });
  }
}

// Importable for the test; only the CLI entry point runs main.
if (process.argv[1] && process.argv[1].endsWith("measure-format-eval.ts")) {
  await main();
}
