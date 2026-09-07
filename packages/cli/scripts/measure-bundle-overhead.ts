/**
 * What is the wrapper actually made of?
 *
 * `measure-repo-funnel.ts` measured how much a bundle costs beyond the file
 * contents it wraps. It could not say what that overhead buys, because it
 * tokenized the bundle as one string. This splits the same bundles into the
 * four things that are not content and counts each one:
 *
 *   header   the preamble plus the project name and source
 *   tree     the generated directory structure, wrapper included
 *   markers  the per-file delimiters, one pair per file
 *   chrome   style-specific structure that is none of the above
 *
 * and does it for all three output styles, because a markdown fence and an XML
 * closing tag are not the same cost.
 *
 * The point of the exercise is an experiment that has not been run yet: does the
 * wrapper help a model find things in a bundle, or is it a tax? That experiment
 * can only size its arms once it knows which components are big enough to
 * matter. The tree is the interesting one, because it is the most plausible
 * place a benefit lives and it is the easiest thing to remove.
 *
 * Two attributions, on purpose:
 *
 *   in place   the whole bundle is tokenized once, and every token is charged
 *              to the component that owns the byte it starts at. Exact by
 *              construction: the components sum to the bundle with no residual,
 *              which is why this is the figure to quote.
 *   isolated   every piece is tokenized on its own and the counts are added.
 *              Splitting a string forces token boundaries the tokenizer would
 *              not have chosen, so this over-counts. The gap between the two is
 *              recorded per repository and per style as `residual`; it is the
 *              size of the boundary effect, not an error bar on the in-place
 *              figure.
 *
 * The trees are pinned. Every repository is fetched at the commit the
 * 2026-09-07 funnel run recorded, so this measures the same trees rather than
 * whatever the default branches have moved to since. A repository whose commit
 * could not be fetched is measured at HEAD and marked `pinned: false`, because
 * silently measuring a different tree is worse than saying so.
 *
 * Pinned is not the same as reproducible to the token. The walk is `glob`, which
 * returns directory order, and neither the bundle nor `generateFileTree` sorts,
 * so two clones of the same commit can interleave siblings differently and the
 * tree renders with different branch characters. Measured on
 * UnityCommunity/UnityLibrary that moved the whole bundle by 740 tokens, 0.34%.
 * The product behaves the same way, so sorting here would measure something the
 * tool does not do. Treat totals as reproducible to a few tenths of a percent
 * and component shares as stable.
 *
 * Usage:
 *   pnpm --filter @fileconcat/cli measure-overhead --repos scripts/repo-sample-2026-09-07.txt
 *
 * Flags:
 *   --repos <file>  one git URL per line, `#` comments allowed (required)
 *   --pins <file>   funnel measurement to take commits from
 *                   (default docs/measurements/repo-funnel-2026-09-07.json)
 *   --out <file>    output JSON (default docs/measurements/bundle-overhead-<date>.json)
 *   --limit <n>     stop after n repositories
 *   --keep          leave the clones on disk instead of removing them
 *   --force         replace an existing output file instead of refusing
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { encoding_for_model, type TiktokenModel } from "@dqbd/tiktoken";
import {
  generateFileTree,
  generateProjectName,
  type OutputFile,
  type OutputStyle,
} from "@fileconcat/core";

import { splitBundle, type Component, type Piece } from "./bundle-parts.js";
import { MAX_FILE_BYTES, cloneRepo, walkRepo } from "./repo-walk.js";

/** Must match apps/web/src/lib/tokens-client.ts, or the published number is not the tool's. */
const TOKEN_MODEL: TiktokenModel = "o1-preview-2024-09-12";
const STYLES: OutputStyle[] = ["xml", "markdown", "plain"];
const COMPONENTS: Component[] = ["header", "tree", "markers", "chrome", "content"];

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DEFAULT_PINS = path.join(REPO_ROOT, "docs", "measurements", "repo-funnel-2026-09-07.json");

const base = (p: string) => p.slice(p.lastIndexOf("/") + 1);
/** What the folder would be called after `git clone`, so the bundle header matches. */
const repoName = (url: string) => base(url).replace(/\.git$/, "");

type Encoder = ReturnType<typeof encoding_for_model>;
type Totals = Record<Component, number>;

const zero = (): Totals => ({ header: 0, tree: 0, markers: 0, chrome: 0, content: 0 });

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

/**
 * How many bytes one token decodes to. Decoding a single token is cheap but not
 * free and the same few thousand ids repeat across millions of positions, so the
 * answers are cached for the life of the run.
 */
function byteLengthOf(enc: Encoder, id: number, cache: Map<number, number>): number {
  const hit = cache.get(id);
  if (hit !== undefined) return hit;
  const length = enc.decode(new Uint32Array([id])).length;
  cache.set(id, length);
  return length;
}

/**
 * Charge every token of the real bundle to the component that owns the byte it
 * starts at. Boundary tokens, the ones that straddle a component edge, go to
 * whichever component the token begins in. That is a choice rather than a
 * discovery, but it is a consistent one and it makes the components sum to the
 * bundle exactly.
 */
function attributeInPlace(
  enc: Encoder,
  bundle: string,
  pieces: Piece[],
  cache: Map<number, number>,
): { totals: Totals; bundleTokens: number } {
  const tokens = enc.encode(bundle);
  const totals = zero();

  // Piece boundaries in bytes, because the tokenizer works on UTF-8 and the
  // split works on JS string offsets. They are not the same thing.
  const ends: number[] = [];
  let running = 0;
  for (const piece of pieces) {
    running += Buffer.byteLength(piece.text, "utf-8");
    ends.push(running);
  }
  const totalBytes = Buffer.byteLength(bundle, "utf-8");
  if (running !== totalBytes) {
    throw new Error(`piece bytes ${running} do not sum to bundle bytes ${totalBytes}`);
  }

  let at = 0;
  let piece = 0;
  for (const id of tokens) {
    while (piece < ends.length - 1 && at >= ends[piece]) piece++;
    totals[pieces[piece].component]++;
    at += byteLengthOf(enc, id, cache);
  }
  if (at !== totalBytes) {
    throw new Error(`tokens decode to ${at} bytes, bundle is ${totalBytes}`);
  }

  return { totals, bundleTokens: tokens.length };
}

/**
 * Tokenize each piece on its own and add the counts up. `contentTokens` is
 * passed in because file contents are byte-identical across the three styles,
 * so they are encoded once for the repository rather than three times.
 */
function attributeIsolated(enc: Encoder, pieces: Piece[], contentTokens: number[]): Totals {
  const totals = zero();
  let next = 0;
  for (const piece of pieces) {
    if (piece.component === "content") totals.content += contentTokens[next++];
    else if (piece.text.length > 0) totals[piece.component] += enc.encode(piece.text).length;
  }
  return totals;
}

type StyleRow = {
  bundleTokens: number;
  bundleChars: number;
  inPlace: Totals;
  isolated: Totals;
  /** bundleTokens minus the isolated sum. Negative means splitting cost tokens. */
  residual: number;
};

type RepoRow = {
  url: string;
  commit?: string;
  /** False when the pinned commit could not be fetched and HEAD was used instead. */
  pinned?: boolean;
  stages?: { found: number; textEligible: number; kept: number };
  /** Per-file contents tokenized separately and added up. Style independent. */
  contentTokens?: number;
  /** The Sept 7 `counted` figure: contents joined by newlines, tokenized whole. */
  contentJoinedTokens?: number;
  styles?: Record<string, StyleRow>;
  error?: string;
};

async function measureRepo(
  url: string,
  dir: string,
  pin: string | undefined,
  enc: Encoder,
  cache: Map<number, number>,
): Promise<RepoRow> {
  let commit: string;
  let pinned = true;
  try {
    commit = cloneRepo(url, dir, pin);
  } catch (err) {
    if (!pin) throw err;
    // Fetching a bare SHA is a server-side permission, not a guarantee. Fall
    // back rather than lose the repository, and say which tree was measured.
    fs.rmSync(dir, { recursive: true, force: true });
    commit = cloneRepo(url, dir);
    pinned = false;
  }

  const { found, files, kept, excluded } = await walkRepo(dir);
  const contentTokens = kept.map((file) => enc.encode(file.content).length);
  const joined = kept.map((file) => file.content).join("\n");

  const paths = kept.map((file) => file.path);
  const shared = {
    projectName: generateProjectName(paths),
    files: kept as OutputFile[],
    tree: generateFileTree(paths),
    source: `local:${repoName(url)}`,
    // The "Not included" note is part of the header the product ships (ADR-0008)
    // and it is what the funnel measurement bundled, so leaving it out would
    // both understate the header and stop the totals matching that run.
    excluded,
  };

  const styles: Record<string, StyleRow> = {};
  for (const style of STYLES) {
    const { bundle, pieces } = splitBundle({ ...shared, style });
    const { totals: inPlace, bundleTokens } = attributeInPlace(enc, bundle, pieces, cache);
    const isolated = attributeIsolated(enc, pieces, contentTokens);
    const isolatedSum = COMPONENTS.reduce((sum, key) => sum + isolated[key], 0);
    styles[style] = {
      bundleTokens,
      bundleChars: bundle.length,
      inPlace,
      isolated,
      residual: bundleTokens - isolatedSum,
    };
  }

  return {
    url,
    commit,
    pinned,
    stages: { found, textEligible: files.length, kept: kept.length },
    contentTokens: contentTokens.reduce((a, b) => a + b, 0),
    contentJoinedTokens: enc.encode(joined).length,
    styles,
  };
}

function readPins(pinsPath: string): Map<string, string> {
  const pins = new Map<string, string>();
  if (!fs.existsSync(pinsPath)) return pins;
  const report = JSON.parse(fs.readFileSync(pinsPath, "utf-8")) as {
    repos: { url: string; commit?: string }[];
  };
  for (const row of report.repos) if (row.commit) pins.set(row.url, row.commit);
  return pins;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const listPath = typeof args.repos === "string" ? args.repos : "";
  if (!listPath) {
    process.stderr.write("Error: --repos <file> is required, one git URL per line.\n");
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

  const pinsPath = typeof args.pins === "string" ? args.pins : DEFAULT_PINS;
  const pins = readPins(pinsPath);

  const day = new Date().toISOString().slice(0, 10);
  const outPath =
    typeof args.out === "string"
      ? args.out
      : path.join(REPO_ROOT, "docs", "measurements", `bundle-overhead-${day}.json`);

  // Same rule as the funnel measurement: a run costs half an hour and the file
  // it writes is the only record of the build it measured.
  if (fs.existsSync(outPath) && !args.force) {
    process.stderr.write(
      `Error: ${outPath} already exists.\n` +
        "Pass --out <file> to write elsewhere, or --force to replace it.\n",
    );
    process.exit(1);
  }

  const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fc-overhead-"));
  const enc = encoding_for_model(TOKEN_MODEL);
  const cache = new Map<number, number>();
  const rows: RepoRow[] = [];

  try {
    for (const [i, url] of urls.entries()) {
      const dir = path.join(workRoot, `repo-${i}`);
      process.stderr.write(`[${i + 1}/${urls.length}] ${url}\n`);
      try {
        rows.push(await measureRepo(url, dir, pins.get(url), enc, cache));
      } catch (err) {
        rows.push({ url, error: err instanceof Error ? err.message : String(err) });
      }
      if (!args.keep) fs.rmSync(dir, { recursive: true, force: true });
    }
  } finally {
    enc.free();
    if (!args.keep) fs.rmSync(workRoot, { recursive: true, force: true });
  }

  const report = {
    measured: new Date().toISOString(),
    tokenizer: `${TOKEN_MODEL} via @dqbd/tiktoken`,
    maxFileBytes: MAX_FILE_BYTES,
    sampleFile: listPath,
    pinsFile: pinsPath,
    styles: STYLES,
    components: COMPONENTS,
    method: [
      "Components are an exact character partition of the assembled bundle: the pieces concatenate back to the string assembleOutput returned, and the split fails loudly if they do not.",
      "inPlace tokenizes the whole bundle once and charges each token to the component owning the byte it starts at, so the components sum to the bundle exactly. Quote this one.",
      "isolated tokenizes each piece on its own and adds the counts. residual is bundleTokens minus that sum: it measures how much splitting a string costs at the boundaries, and it is not an error bar on inPlace.",
      "tree is the whole directory-structure section including its wrapper, because the unit that matters is what disappears if the tree is removed.",
      "markers are the per-file delimiters only. Removing them is not a free saving: without a path marker, 'which file defines X' stops being answerable rather than merely harder.",
      "header includes the 'Not included' note (ADR-0008), because the product ships it. It is the one component whose size depends on what the walk could not read.",
      "Pinning the commit fixes the file set and the contents, not the walk order. glob returns directory order and neither the bundle nor generateFileTree sorts, so totals are reproducible to a few tenths of a percent rather than exactly. Component shares are stable.",
    ],
    repos: rows,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  const ok = rows.filter((row) => !row.error);
  const unpinned = ok.filter((row) => row.pinned === false).length;
  process.stderr.write(
    `\n${ok.length} measured, ${rows.length - ok.length} failed, ${unpinned} measured at HEAD instead of the pin\n` +
      `written to ${outPath}\n` +
      "Run analyze-overhead for the cuts.\n",
  );
}

await main();
