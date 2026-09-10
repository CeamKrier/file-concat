/**
 * The same repository, handed to four repo-to-text tools. What does it cost?
 *
 * Every comparison of these tools that exists online is a feature matrix. A
 * feature matrix cannot answer the only question a reader has, which is how many
 * tokens the thing they are about to paste is going to be, and whether the tools
 * even agree about what belongs in it. They do not agree, and the disagreement is
 * larger than any wrapper difference.
 *
 * Four tools run here, on the same checkout, at their own defaults:
 *
 *   fileconcat   this repository's CLI, `src/index.ts`, default style xml
 *   repomix      `repomix` with no flags, default style xml
 *   gitingest    `gitingest .` with no flags, its own plain-text digest
 *   code2prompt  `code2prompt .` with no flags, its default markdown template
 *
 * A fifth, repo2txt, is a browser tool driven by the GitHub API. It has no local
 * mode, so it cannot be pointed at the same checkout and is not measured. Saying
 * so is the honest version of including it.
 *
 * Four rules, each one the difference between a measurement and a sales page:
 *
 *  1. Defaults only. A flag on one tool and not another measures the operator,
 *     not the tool. The one thing every invocation is allowed is "write the
 *     bundle here and keep progress logs off stdout".
 *  2. One checkout per repository, pinned to the commit the 2026-09-07 funnel run
 *     recorded, with all three tools run over that same directory. The tools
 *     never clone for themselves, because two clones are two trees.
 *  3. One tokenizer for all three outputs, the product's own
 *     (`o1-preview-2024-09-12` via `@dqbd/tiktoken`), so a difference in the
 *     numbers is a difference in the bundles.
 *  4. When another tool includes a file this one does not, the reason comes from
 *     `walkRepo`, which is the product's own decision recorded at walk time. This
 *     script never re-derives why a path was dropped. In the other direction
 *     there is no such attribution to borrow, because a competitor's reason is
 *     not observable from its output, so those paths are reported by extension
 *     and nothing more is claimed about them.
 *
 * Two things the output is not:
 *
 *  - Not a quality ranking. Fewer tokens is not better if the file that mattered
 *     was the one dropped. This measures cost and agreement, and the article has
 *     to say which of the two it is arguing from.
 *  - Not reproducible to the token. The walk is `glob`, which returns directory
 *    order, so a fresh clone can render the file tree with different branch
 *    characters; measured at 0.34% of a bundle on the funnel run. Treat totals as
 *    reproducible to a few tenths of a percent.
 *
 * The external tools are not vendored, the same way the pypdf reader is not. Pin
 * them yourself before a rerun and the report records what it actually got:
 *
 *   npm i -g repomix@1.18.0        (or pass --repomix <path to the binary>)
 *   uv tool install gitingest==0.3.1
 *   code2prompt: the v4.2.0 release binary for your platform, from its GitHub
 *   releases page. There is an unrelated package of the same name on PyPI; the
 *   one measured here is the Rust tool.
 *
 * Usage:
 *   pnpm --filter @fileconcat/cli measure-tools --repos scripts/repo-sample-2026-09-07.txt
 *
 * Flags:
 *   --repos <file>     one git URL per line, `#` comments allowed (required)
 *   --pins <file>      funnel measurement to take commits from
 *                      (default docs/measurements/repo-funnel-2026-09-07.json)
 *   --out <file>       output JSON (default docs/measurements/tool-comparison-<date>.json)
 *   --repomix <cmd>    repomix binary (default `npx -y repomix@1.18.0`)
 *   --gitingest <cmd>  gitingest binary (default `gitingest`)
 *   --code2prompt <cmd> code2prompt binary (default `code2prompt`)
 *   --limit <n>        stop after n repositories
 *   --keep             leave the clones on disk instead of removing them
 *   --force            replace an existing output file instead of refusing
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { encoding_for_model, type TiktokenModel } from "@dqbd/tiktoken";

import { categorize, isHidden, type Category } from "./categories.js";
import { DOCUMENT_FIXTURE, writeDocumentFixture } from "./document-fixture.js";
import { cloneRepo, walkRepo, type ExcludedBy } from "./repo-walk.js";

/** Must match apps/web/src/lib/tokens-client.ts, or the published number is not the tool's. */
const TOKEN_MODEL: TiktokenModel = "o1-preview-2024-09-12";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CLI_DIR = path.join(REPO_ROOT, "packages", "cli");
const CLI_ENTRY = path.join(CLI_DIR, "src", "index.ts");
const DEFAULT_PINS = path.join(REPO_ROOT, "docs", "measurements", "repo-funnel-2026-09-07.json");

const TOOLS = ["fileconcat", "repomix", "gitingest", "code2prompt"] as const;
type Tool = (typeof TOOLS)[number];

/** Why a competitor's file is missing from our bundle. The first three are the
 * product's own words; `notText` is the router declining to treat the bytes as
 * text, and `absent` means the walk never saw the path at all. */
type Reason = ExcludedBy | "notText" | "absent";

/** A set of paths and what they weigh. Chars come from the walk's own read of
 * the file, so a path the walk never saw contributes to files and not to chars. */
interface Weight {
  files: number;
  chars: number;
}

interface ToolResult {
  files: number;
  chars: number;
  tokens: number;
  /** Seconds of wall clock, recorded because a tool nobody will wait for is a finding. */
  seconds: number;
  /**
   * E5. Bundled files whose own content carries the tool's delimiter at the start
   * of a line, so a reader splitting on that delimiter recovers the wrong files.
   */
  collisions: Weight & { tokens: number };
  /**
   * Paths the tool's marker names whose content is not in its bundle. gitingest
   * writes a FILE: line for a file its own binary check then empties, so a
   * marker is a claim and the content is the proof.
   */
  listedOnly: Weight & { tokens: number };
}

/**
 * Where a path's bytes came from. `text` and `document` are what the walk read
 * (a decoder or a document parser) and the only kinds that weigh anything;
 * `unwalked` is on disk but the walk read no text from it (binary by the
 * router, oversize, or a document that yielded nothing); `missing` is in a
 * bundle and not on disk under that name.
 */
type Kind = "text" | "document" | "unwalked" | "missing";

/**
 * One row per path any tool bundled or the walk read: path, tokens, category by
 * the codebase study's rules, whether a dot segment hides it from our walk, where
 * its bytes came from, and which tools carry it. Tokens are counted once per
 * path with the product's tokenizer and shared by every tool that carries it.
 * A tool carries a path when its marker names it and, where the walk has text
 * to look for, the file's first and last 200 characters are in the bundle.
 */
type PathRow = [string, number, Category, boolean, Kind, Tool[]];

interface RepoRow {
  url: string;
  commit?: string;
  pinned?: boolean;
  error?: string;
  fileconcat?: ToolResult;
  repomix?: ToolResult;
  gitingest?: ToolResult;
  code2prompt?: ToolResult;
  /** Every path, see PathRow. The whole reason for the 2026-09-10 rerun. */
  paths?: PathRow[];
  /** Our own marker count against the walk's kept count: the bundle read back. */
  roundTrip?: { markers: number; kept: number };
  /** Paths one tool included and another did not, counted rather than listed. */
  agreement?: {
    /** Paths every one of the four bundled. */
    inAll: number;
    /** Per reason, how many paths a competitor had that we did not, and their weight. */
    missedByUs: Record<Reason, Weight>;
    /** The largest of those, because one lockfile can be the whole difference. */
    biggestMissed: { path: string; chars: number }[];
    /** Extension histogram of paths we bundled that neither competitor did. */
    onlyUs: Record<string, number>;
    /** Per competitor, what it carried that we did not. Ranks them by appetite. */
    missedPerTool: Record<string, Weight>;
  };
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

function readList(file: string): string[] {
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean);
}

function readPins(file: string): Map<string, string> {
  const pins = new Map<string, string>();
  if (!fs.existsSync(file)) return pins;
  const report = JSON.parse(fs.readFileSync(file, "utf8")) as {
    repos: { url: string; commit?: string }[];
  };
  for (const row of report.repos) if (row.commit) pins.set(row.url, row.commit);
  return pins;
}

/** The argv of each external tool, as resolved from the flags. */
type Bins = Record<Exclude<Tool, "fileconcat">, string[]>;

/** Split a command string into argv, so `--repomix "npx -y repomix@1.18.0"` works. */
const split = (cmd: string) => cmd.split(/\s+/).filter(Boolean);

function run(cmd: string[], cwd: string, outFile: string): number {
  const started = Date.now();
  const out = fs.openSync(outFile, "w");
  try {
    execFileSync(cmd[0], cmd.slice(1), {
      cwd,
      stdio: ["ignore", out, "pipe"],
      maxBuffer: 1024 * 1024 * 1024,
    });
  } catch (err) {
    // Without the tool's own stderr, a failed row says "command failed" and the
    // next session reruns an hour of clones to find out what it said.
    const said = (err as { stderr?: Buffer }).stderr?.toString().trim().slice(-600);
    throw new Error(`${cmd.join(" ")}\n${said || "(no stderr)"}`);
  } finally {
    fs.closeSync(out);
  }
  return (Date.now() - started) / 1000;
}

/** Every `<file path="...">` in an xml-style bundle. fileconcat and repomix both
 * use the attribute, which is why one reader serves both. */
function xmlPaths(text: string): string[] {
  return [...text.matchAll(/<file path="([^"]*)"/g)].map((m) => m[1]);
}

/** gitingest writes `FILE: <path>` between rules of equals signs. */
function digestPaths(text: string): string[] {
  return [...text.matchAll(/^FILE: (.+)$/gm)].map((m) => m[1].trim());
}

/**
 * code2prompt's default markdown template opens each file with a backticked path
 * on its own line, then a fenced block holding the contents. Its source tree
 * lists paths whose contents it does not include, so the tree is not read here.
 *
 * The naive regex over-matches, and it did: a first pass counted image paths that
 * only ever appeared inside a README's own fenced block. Two rules fix it. A
 * marker is only a marker outside a fence, and only when the next non-empty line
 * opens one, which is what the template always writes and what prose almost never
 * does. A file whose own contents contain a closing fence still confuses this,
 * and no reader of that format can do better.
 */
function markdownPaths(text: string): string[] {
  const lines = text.split("\n").map((l) => l.trimEnd());
  const paths: string[] = [];
  let fence: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const opener = lines[i].match(/^(`{3,})/);
    if (fence) {
      if (opener && lines[i].trim() === opener[1] && opener[1].length >= fence.length) fence = null;
      continue;
    }
    if (opener) {
      fence = opener[1];
      continue;
    }
    const marker = lines[i].match(/^`([^`]+)`:$/);
    if (!marker) continue;
    let next = i + 1;
    while (next < lines.length && lines[next].trim() === "") next++;
    if (next < lines.length && /^`{3,}/.test(lines[next])) paths.push(marker[1].trim());
  }
  return paths;
}

function measure(enc: ReturnType<typeof encoding_for_model>, text: string, seconds: number) {
  return {
    chars: text.length,
    tokens: enc.encode(text).length,
    seconds: Number(seconds.toFixed(2)),
  };
}

/**
 * The line a reader of each format splits on. A bundled file that carries it
 * verbatim at the start of a line is indistinguishable from a boundary. Ours and
 * repomix's close every file with the same tag; gitingest rules a line of 48
 * equals signs above each FILE: line; code2prompt fences every file with three
 * backticks, which any Markdown file with a code block also carries.
 */
const DELIMITER: Record<Tool, RegExp> = {
  fileconcat: /^<\/file>/m,
  repomix: /^<\/file>/m,
  gitingest: /^={48}$/m,
  code2prompt: /^```/m,
};

/** The per-file marker each tool writes, as a path list, from its own output. */
function pathsIn(tool: Tool, text: string): string[] {
  if (tool === "gitingest") return digestPaths(text).map((p) => p.replace(/^\.\//, ""));
  if (tool === "code2prompt") return markdownPaths(text).map((p) => p.replace(/^\.\//, ""));
  return xmlPaths(text);
}

const extensionOf = (p: string) => {
  const name = p.slice(p.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "(none)";
};

async function measureRepo(
  url: string,
  dir: string,
  pin: string | undefined,
  bins: Bins,
  enc: ReturnType<typeof encoding_for_model>,
): Promise<RepoRow> {
  let commit: string;
  let pinned = true;
  try {
    commit = cloneRepo(url, dir, pin);
  } catch {
    commit = cloneRepo(url, dir);
    pinned = false;
  }

  const work = `${dir}-out`;
  fs.mkdirSync(work, { recursive: true });
  const at = (name: string) => path.join(work, name);

  // Defaults, and nothing else. `-q` and `--stdout` on ours, `--stdout` on
  // repomix and `-o` on gitingest, all of which choose where the bytes go rather
  // than what goes into them.
  const fcSeconds = run(
    ["pnpm", "exec", "tsx", CLI_ENTRY, dir, "--stdout", "-q"],
    CLI_DIR,
    at("fileconcat.txt"),
  );
  const rmSeconds = run([...bins.repomix, "--stdout"], dir, at("repomix.txt"));
  const giSeconds = run([...bins.gitingest, ".", "-o", at("gitingest.txt")], dir, at("gitingest.log"));
  const cpSeconds = run(
    [...bins.code2prompt, ".", "-O", at("code2prompt.md")],
    dir,
    at("code2prompt.log"),
  );

  const fcText = fs.readFileSync(at("fileconcat.txt"), "utf8");
  const rmText = fs.readFileSync(at("repomix.txt"), "utf8");
  const giText = fs.readFileSync(at("gitingest.txt"), "utf8");
  const cpText = fs.readFileSync(at("code2prompt.md"), "utf8");

  const fcMarkers = pathsIn("fileconcat", fcText);
  const paths: Record<Tool, Set<string>> = {
    fileconcat: new Set(fcMarkers),
    repomix: new Set(pathsIn("repomix", rmText)),
    gitingest: new Set(pathsIn("gitingest", giText)),
    code2prompt: new Set(pathsIn("code2prompt", cpText)),
  };

  // The product's own reason for every path it did not bundle. Recorded at walk
  // time by walkRepo; this script has no opinion of its own about any path.
  const walk = await walkRepo(dir);
  const reason = new Map<string, Reason>();
  for (const file of walk.files) {
    if (!file.kept) reason.set(file.path, file.excludedBy ?? "notText");
  }
  const seenByWalk = new Set(walk.files.map((f) => f.path));

  // How big every path the walk read is, so a disagreement can be weighed rather
  // than only counted. A path the walk never saw has no size to borrow.
  const sizeOf = new Map<string, number>();
  for (const file of walk.files) sizeOf.set(file.path, file.text.length);

  // Every path once: what the walk read, plus whatever a competitor's marker
  // names that the walk read no text from. Only the walk's text weighs anything.
  const textOf = new Map<string, string>();
  const kindOf = new Map<string, Kind>();
  for (const file of walk.files) {
    textOf.set(file.path, file.text);
    kindOf.set(file.path, file.document ? "document" : "text");
  }
  const union = new Set<string>([...walk.files.map((f) => f.path)]);
  for (const tool of TOOLS) for (const p of paths[tool]) union.add(p);
  for (const p of union) {
    if (textOf.has(p)) continue;
    let onDisk = false;
    try {
      onDisk = fs.statSync(path.join(dir, p)).isFile();
    } catch {
      // not on disk under that name
    }
    textOf.set(p, "");
    kindOf.set(p, onDisk ? "unwalked" : "missing");
  }
  const tokensOf = new Map<string, number>();
  for (const [p, text] of textOf) tokensOf.set(p, text ? enc.encode(text).length : 0);

  // A marker is a claim and the content is the proof: gitingest writes a FILE:
  // line for a path its own binary check then leaves empty, and a first pass
  // credited it with 46 million tokens it never wrote. Membership is the marker
  // plus the file's own first and last 200 characters found in the bundle, line
  // endings normalised. A path with no text to look for keeps the marker's word.
  const bundle: Record<Tool, string> = {
    fileconcat: fcText.replace(/\r\n/g, "\n"),
    repomix: rmText.replace(/\r\n/g, "\n"),
    gitingest: giText.replace(/\r\n/g, "\n"),
    code2prompt: cpText.replace(/\r\n/g, "\n"),
  };
  const carries = (tool: Tool, p: string): boolean => {
    if (!paths[tool].has(p)) return false;
    const text = (textOf.get(p) ?? "").replace(/\r\n/g, "\n").trim();
    if (!text) return true;
    return bundle[tool].includes(text.slice(0, 200)) && bundle[tool].includes(text.slice(-200));
  };
  const carried: Record<Tool, Set<string>> = {
    fileconcat: new Set(),
    repomix: new Set(),
    gitingest: new Set(),
    code2prompt: new Set(),
  };
  for (const tool of TOOLS) for (const p of paths[tool]) if (carries(tool, p)) carried[tool].add(p);

  const rows: PathRow[] = [...union].sort().map((p) => [
    p,
    tokensOf.get(p) ?? 0,
    categorize(p),
    isHidden(p),
    kindOf.get(p) ?? "missing",
    TOOLS.filter((tool) => carried[tool].has(p)),
  ]);

  const weighAll = (tool: Tool, keep: (p: string) => boolean) => {
    const w = { files: 0, chars: 0, tokens: 0 };
    for (const p of paths[tool]) {
      if (!keep(p)) continue;
      const text = textOf.get(p) ?? "";
      w.files++;
      w.chars += text.length;
      w.tokens += tokensOf.get(p) ?? 0;
    }
    return w;
  };
  const collisionsOf = (tool: Tool) =>
    weighAll(tool, (p) => carried[tool].has(p) && DELIMITER[tool].test(textOf.get(p) ?? ""));
  const listedOnlyOf = (tool: Tool) => weighAll(tool, (p) => !carried[tool].has(p));
  const weigh = (): Weight => ({ files: 0, chars: 0 });
  const add = (w: Weight, p: string) => {
    w.files++;
    w.chars += sizeOf.get(p) ?? 0;
  };

  const missedByUs: Record<Reason, Weight> = {
    hidden: weigh(),
    defaultIgnore: weigh(),
    gitignore: weigh(),
    notText: weigh(),
    absent: weigh(),
  };
  const missed: { path: string; chars: number }[] = [];
  const competitors = new Set([...paths.repomix, ...paths.gitingest, ...paths.code2prompt]);
  for (const p of competitors) {
    if (paths.fileconcat.has(p)) continue;
    add(missedByUs[reason.get(p) ?? (seenByWalk.has(p) ? "notText" : "absent")], p);
    missed.push({ path: p, chars: sizeOf.get(p) ?? 0 });
  }
  missed.sort((a, b) => b.chars - a.chars);

  const missedPerTool: Record<string, Weight> = {};
  for (const tool of TOOLS) {
    if (tool === "fileconcat") continue;
    const w = weigh();
    for (const p of paths[tool]) if (!paths.fileconcat.has(p)) add(w, p);
    missedPerTool[tool] = w;
  }

  const onlyUs: Record<string, number> = {};
  for (const p of paths.fileconcat) {
    if (competitors.has(p)) continue;
    const ext = extensionOf(p);
    onlyUs[ext] = (onlyUs[ext] ?? 0) + 1;
  }

  let inAll = 0;
  for (const p of paths.fileconcat) {
    if (TOOLS.every((tool) => paths[tool].has(p))) inAll++;
  }

  fs.rmSync(work, { recursive: true, force: true });

  return {
    url,
    commit,
    pinned,
    fileconcat: {
      files: paths.fileconcat.size,
      ...measure(enc, fcText, fcSeconds),
      collisions: collisionsOf("fileconcat"),
      listedOnly: listedOnlyOf("fileconcat"),
    },
    repomix: {
      files: paths.repomix.size,
      ...measure(enc, rmText, rmSeconds),
      collisions: collisionsOf("repomix"),
      listedOnly: listedOnlyOf("repomix"),
    },
    gitingest: {
      files: paths.gitingest.size,
      ...measure(enc, giText, giSeconds),
      collisions: collisionsOf("gitingest"),
      listedOnly: listedOnlyOf("gitingest"),
    },
    code2prompt: {
      files: paths.code2prompt.size,
      ...measure(enc, cpText, cpSeconds),
      collisions: collisionsOf("code2prompt"),
      listedOnly: listedOnlyOf("code2prompt"),
    },
    paths: rows,
    roundTrip: { markers: fcMarkers.length, kept: walk.kept.length },
    agreement: {
      inAll,
      missedByUs,
      biggestMissed: missed.slice(0, 5),
      onlyUs,
      missedPerTool,
    },
  };
}

/**
 * E4. One source file and one document of each office format, each carrying a
 * sentence found nowhere else. `listed` is the path in the tool's own per-file
 * marker; `text` is the sentence in the bundle. A tool can list a document
 * without its text, which is the difference between a tree and a reader.
 *
 * Outputs go to a separate directory: the first version of this probe wrote them
 * beside the fixture and the tools packed each other's bundles.
 */
function measureDocumentFixture(bins: Bins, enc: ReturnType<typeof encoding_for_model>) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "fc-docs-"));
  const dir = path.join(parent, "demo-docs");
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "fc-docs-out-"));
  const at = (name: string) => path.join(work, name);
  writeDocumentFixture(dir);

  try {
    run(["pnpm", "exec", "tsx", CLI_ENTRY, dir, "--stdout", "-q"], CLI_DIR, at("fileconcat.txt"));
    run([...bins.repomix, "--stdout"], dir, at("repomix.txt"));
    run([...bins.gitingest, ".", "-o", at("gitingest.txt")], dir, at("gitingest.log"));
    run([...bins.code2prompt, ".", "-O", at("code2prompt.txt")], dir, at("code2prompt.log"));

    const results: Record<string, Record<string, { listed: boolean; text: boolean }>> = {};
    const tokens: Record<string, number> = {};
    for (const tool of TOOLS) {
      const text = fs.readFileSync(at(`${tool}.txt`), "utf8");
      const listed = new Set(pathsIn(tool, text));
      tokens[tool] = enc.encode(text).length;
      results[tool] = {};
      for (const [file, sentence] of Object.entries(DOCUMENT_FIXTURE)) {
        results[tool][file] = { listed: listed.has(file), text: text.includes(sentence) };
      }
    }
    return { files: DOCUMENT_FIXTURE, tokens, results };
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/**
 * What each tool charges before it has said anything about your files. One
 * directory, one 12-byte file, so everything above that is preamble, schema
 * explanation and the wrapper around a single entry.
 *
 * It is a floor, not the overhead of a real bundle: every tool's file tree and
 * per-file markers grow with the file count, and none of that growth is here.
 *
 * The directory is named rather than left as the random `mkdtemp` suffix, because
 * two tools write the directory's own name into their header and a longer random
 * name moved the floor by a token or two between runs.
 */
function measureFixedFloor(
  bins: Bins,
  enc: ReturnType<typeof encoding_for_model>,
) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "fc-floor-"));
  const dir = path.join(parent, "demo");
  fs.mkdirSync(dir);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "fc-floor-out-"));
  const at = (name: string) => path.join(work, name);
  const body = "hello world\n";
  fs.writeFileSync(path.join(dir, "only.txt"), body);

  try {
    run(["pnpm", "exec", "tsx", CLI_ENTRY, dir, "--stdout", "-q"], CLI_DIR, at("fileconcat.txt"));
    run([...bins.repomix, "--stdout"], dir, at("repomix.txt"));
    run([...bins.gitingest, ".", "-o", at("gitingest.txt")], dir, at("gitingest.log"));
    run([...bins.code2prompt, ".", "-O", at("code2prompt.txt")], dir, at("code2prompt.log"));

    const content = enc.encode(body).length;
    const floor: Record<string, number> = {};
    for (const tool of TOOLS) {
      const text = fs.readFileSync(at(`${tool}.txt`), "utf8");
      floor[tool] = enc.encode(text).length - content;
    }
    return { fileBody: body, contentTokens: content, wrapperTokens: floor };
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/**
 * The version the run actually got, which is the only version worth citing.
 *
 * gitingest has no --version, so the fallback reads the interpreter out of the
 * console script's shebang and asks its own environment. That works for a uv
 * tool, a pipx install and a plain venv alike, because all three write an
 * absolute interpreter path into the shim.
 */
function versionOf(cmd: string[], pyPackage?: string): string {
  try {
    return execFileSync(cmd[0], [...cmd.slice(1), "--version"], { encoding: "utf8" })
      .trim()
      .split("\n")
      .pop()!;
  } catch {
    // fall through to the interpreter probe
  }
  if (pyPackage) {
    try {
      const onPath = execFileSync("which", [cmd[0]], { encoding: "utf8" }).trim();
      const shim = execFileSync("readlink", ["-f", onPath], { encoding: "utf8" }).trim();
      const shebang = fs.readFileSync(shim, "utf8").split("\n")[0];
      const python = shebang.replace(/^#!\s*/, "").split(/\s+/)[0];
      return execFileSync(
        python,
        ["-c", `import importlib.metadata as m; print(m.version("${pyPackage}"))`],
        { encoding: "utf8" },
      ).trim();
    } catch (err) {
      return `unknown (${err instanceof Error ? err.message : String(err)})`;
    }
  }
  return "unknown";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const listPath = typeof args.repos === "string" ? args.repos : "";
  if (!listPath) {
    process.stderr.write("Error: --repos <file> is required.\n");
    process.exit(1);
  }

  let urls = readList(listPath);
  if (typeof args.limit === "string") urls = urls.slice(0, Number(args.limit));
  if (urls.length === 0) {
    process.stderr.write(`Error: no repository URLs in ${listPath}\n`);
    process.exit(1);
  }

  const bins = {
    repomix: split(typeof args.repomix === "string" ? args.repomix : "npx -y repomix@1.18.0"),
    gitingest: split(typeof args.gitingest === "string" ? args.gitingest : "gitingest"),
    code2prompt: split(
      typeof args["code2prompt"] === "string" ? (args["code2prompt"] as string) : "code2prompt",
    ),
  };

  const pinsPath = typeof args.pins === "string" ? args.pins : DEFAULT_PINS;
  const pins = readPins(pinsPath);

  const day = new Date().toISOString().slice(0, 10);
  const outPath =
    typeof args.out === "string"
      ? args.out
      : path.join(REPO_ROOT, "docs", "measurements", `tool-comparison-${day}.json`);

  // Same rule as the funnel measurement: a run costs an hour and the file it
  // writes is the only record of the builds it measured.
  if (fs.existsSync(outPath) && !args.force) {
    process.stderr.write(
      `Error: ${outPath} already exists.\n` +
        "Pass --out <file> to write elsewhere, or --force to replace it.\n",
    );
    process.exit(1);
  }

  const cliVersion = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, "packages", "cli", "package.json"), "utf8"),
  ).version as string;

  const enc = encoding_for_model(TOKEN_MODEL);
  const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fc-tools-"));
  const rows: RepoRow[] = [];
  let floor: ReturnType<typeof measureFixedFloor> | { error: string };
  let documents: ReturnType<typeof measureDocumentFixture> | { error: string };

  try {
    try {
      floor = measureFixedFloor(bins, enc);
    } catch (err) {
      floor = { error: err instanceof Error ? err.message : String(err) };
    }
    try {
      documents = measureDocumentFixture(bins, enc);
    } catch (err) {
      documents = { error: err instanceof Error ? err.message : String(err) };
    }

    for (const [i, url] of urls.entries()) {
      const dir = path.join(workRoot, `repo-${i}`);
      process.stderr.write(`[${i + 1}/${urls.length}] ${url}\n`);
      try {
        rows.push(await measureRepo(url, dir, pins.get(url), bins, enc));
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
    sampleFile: listPath,
    pinsFile: pinsPath,
    versions: {
      fileconcat: `@fileconcat/cli ${cliVersion} (this repository, src/index.ts)`,
      repomix: versionOf(bins.repomix),
      gitingest: versionOf(bins.gitingest, "gitingest"),
      code2prompt: versionOf(bins.code2prompt),
    },
    notMeasured: {
      repo2txt:
        "Browser tool driven by the GitHub API, with no local mode. It cannot be pointed at the same checkout the other three read, so measuring it would compare a different tree fetched a different way.",
    },
    method: [
      "One shallow clone per repository, pinned to the commit the 2026-09-07 funnel run recorded, and all three tools run over that same directory. No tool clones for itself.",
      "Defaults only. The only flags passed choose where the bytes go and keep progress logs off stdout: fileconcat --stdout -q, repomix --stdout, gitingest . -o <file>, code2prompt . -O <file>.",
      "Every output is tokenized whole with the product's own tokenizer, so a difference between the numbers is a difference between the bundles rather than between two counters.",
      "File counts come from each tool's own per-file marker in its own output: the path attribute for the two xml bundles, the FILE: line for the gitingest digest, the backticked path line for the code2prompt markdown. code2prompt's source tree lists paths whose contents it does not include, so the tree is not read as a file list, and its markers are only read outside a fenced block and only when a fence opens under them, because a first pass counted image paths that lived inside a README.",
      "missedByUs attributes a path another tool included and we did not, using the reason walkRepo recorded at walk time. hidden, defaultIgnore and gitignore are the product's three default filters; notText is the router declining the bytes; absent means the walk never saw the path.",
      "onlyUs is an extension histogram, not an attribution. A competitor's reason for dropping a file is not observable from its output, so nothing is claimed about it.",
      "Every disagreement is weighed as well as counted, in characters read by the walk, because seventeen dropped CI workflows and one dropped lockfile are the same count and not the same bundle. A path the walk never saw contributes to files and not to chars.",
      "The wrapper floor is one directory named demo holding one 12-byte file. It is the cost before a tool has said anything about your files, and it is a floor: file trees and per-file markers grow with the file count and none of that growth is in it. The directory is named rather than random because two tools write its name into their header.",
      "paths lists every path any tool named or the walk read, once per repository: path, tokens, category, hidden, kind, tools. Tokens are counted once per path with the product's tokenizer from the walk's own read of the file, so a tool's share of a category is a sum over the paths it carries. Category is the codebase study's rule map (measure-funnel --rules) applied to every tool's paths unchanged; the analyzer recomputes it from the path with the current rules. hidden is any dot segment, the thing our walk never sees. kind says where the bytes came from: text or document from the walk, which are the only kinds that weigh anything; unwalked for a path on disk the walk read no text from (binary, oversize, or a document that yielded nothing); missing for a path in a bundle and not on disk.",
      "tools holds the tools that carry the path: the tool's own per-file marker names it and, where the walk has text to look for, the file's first and last 200 characters are in the bundle with line endings normalised. gitingest writes a FILE: line for a path its own binary check then leaves empty, and a marker-only first pass credited it with 46 million tokens it never wrote. listedOnly counts, per tool, the named paths whose content the bundle does not carry.",
      "collisions counts, per tool, the carried files whose own content carries the tool's delimiter at the start of a line: </file> for the two xml bundles, a line of 48 equals signs for gitingest, three backticks for code2prompt. A reader splitting the bundle on that delimiter recovers the wrong files. roundTrip is our own marker count read back from the bundle against the walk's kept count; the walk lacks the CLI's extension list, so a .key or .dat file the CLI declines opens a gap of one or two that is the walk's, not the bundle's.",
      "documentFixture is one source file and one pdf, docx, xlsx and pptx, each carrying a sentence found nowhere else, written by the script as the smallest files the formats allow. listed means the path is in the tool's per-file marker, text means the sentence is in the bundle. Outputs are written outside the fixture directory so no tool packs another's bundle.",
    ],
    caveats: [
      "Not a quality ranking. Fewer tokens is only better if the dropped file did not matter, and this measures cost and agreement rather than usefulness.",
      "Not reproducible to the token. glob returns directory order and neither the bundle nor the file tree sorts, which moved a whole bundle by 0.34% on the funnel run. Totals are reproducible to a few tenths of a percent.",
      "A fresh clone is not a working folder: no node_modules, no build output, no local env files. Every tool here is therefore measured on its best case, and the gaps between them on a developer's machine are larger.",
      "The category map is ours and path-based. A competitor might classify a path differently, and a hidden file is not one category: a CI workflow is source for a CI question and noise for a code question, which is why hidden is a separate flag rather than a category.",
      "The document fixture measures whether a tool reads a document at all, on the smallest valid file of each format. It says nothing about extraction quality on real documents; measure-extraction does.",
    ],
    wrapperFloor: floor,
    documentFixture: documents,
    repos: rows,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  const ok = rows.filter((row) => !row.error);
  const unpinned = ok.filter((row) => row.pinned === false).length;
  process.stderr.write(
    `\n${ok.length} measured, ${rows.length - ok.length} failed, ${unpinned} measured at HEAD instead of the pin\n` +
      `written to ${outPath}\n`,
  );
}

await main();
