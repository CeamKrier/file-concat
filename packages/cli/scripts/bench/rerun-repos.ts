/**
 * Reruns FileConcat alone on the repomix-vs-gitingest-vs-code2prompt sample and
 * scores it against the rivals' stored per-repository results, so a release can
 * add a row to the four repository charts without installing three other tools
 * or spending 45 minutes on them.
 *
 * Same definitions as analyze-tool-comparison.ts, and nothing else:
 *
 *  - density: tokens of carried paths whose category is "source" and kind is
 *    "text", over the bundle's tokens; categories recomputed from the path.
 *  - a path is carried when the bundle's marker names it and the walk text's
 *    first and last 200 characters are in the bundle (measure-tool-comparison).
 *  - densest and cheapest: TOOLS.reduce in the same tool order, so ties go to
 *    the same tool they went to before.
 *  - medians: linear interpolation, NaN dropped.
 *
 * Each repository is checked out at the commit the stored run recorded, so ours
 * and theirs read the same tree. Rival rows are not remeasured: their versions
 * have not changed, and their numbers come from the stored file as they are.
 *
 * Usage (from packages/cli):
 *   pnpm exec tsx scripts/bench/rerun-repos.ts --version 2.6 --clones <dir>
 *
 * Flags:
 *   --version <x.y>  label and output name (default: apps/web/package.json, major.minor)
 *   --clones <dir>   where checkouts live; an existing one at the right commit is reused
 *   --stored <file>  rival results (default: tool-comparison-2026-09-10-3rdparty.json,
 *                    the run the published 2.0 figures recompute from exactly)
 *   --limit <n>      first n repositories only, for a smoke run; nothing is written
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { encoding_for_model } from "@dqbd/tiktoken";

import { categorize } from "../categories.js";
import { cloneRepo, walkRepo } from "../repo-walk.js";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const CLI_DIR = path.join(REPO_ROOT, "packages", "cli");
const MEASUREMENTS = path.join(REPO_ROOT, "docs", "measurements");
const TOOLS = ["fileconcat", "repomix", "gitingest", "code2prompt"] as const;
type Tool = (typeof TOOLS)[number];
const LABEL: Record<Exclude<Tool, "fileconcat">, string> = {
  repomix: "Repomix",
  gitingest: "gitingest",
  code2prompt: "code2prompt",
};

/** [path, tokens, category, hidden, kind, tools], as the measurement writes it. */
type PathRow = [string, number, string, boolean, string, Tool[]];
type Stored = {
  url: string;
  commit: string;
  error?: string;
  agreement?: unknown;
  paths: PathRow[];
} & Record<Tool, { tokens: number }>;

const args: Record<string, string> = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];

const webVersion = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "apps", "web", "package.json"), "utf8")).version;
const version: string = args.version ?? webVersion.split(".").slice(0, 2).join(".");
const clones = path.resolve(args.clones ?? path.join(CLI_DIR, ".bench-repos"));
const storedFile = args.stored ?? path.join(MEASUREMENTS, "tool-comparison-2026-09-10-3rdparty.json");
const stored = JSON.parse(fs.readFileSync(storedFile, "utf8"));
const rows: Stored[] = stored.repos.filter((r: Stored) => !r.error && r.agreement);
const sample = args.limit ? rows.slice(0, Number(args.limit)) : rows;

const ratio = (num: number, den: number) => (den > 0 ? num / den : NaN);
const median = (values: number[]) => {
  const sorted = values.filter((v) => !Number.isNaN(v)).sort((a, b) => a - b);
  const pos = (sorted.length - 1) / 2;
  const low = Math.floor(pos);
  return sorted[low] + (sorted[Math.ceil(pos)] - sorted[low]) * (pos - low);
};
const storedDensity = (r: Stored, tool: Tool) =>
  ratio(
    r.paths.reduce(
      (a, p) => a + (p[5].includes(tool) && categorize(p[0]) === "source" && p[4] === "text" ? p[1] : 0),
      0,
    ),
    r[tool].tokens,
  );

const enc = encoding_for_model("o1-preview-2024-09-12");
fs.mkdirSync(clones, { recursive: true });

/** Our bundle for one checkout: its tokens and its source density. */
async function measureOurs(r: Stored) {
  const dir = path.join(clones, r.url.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "").replace("/", "__"));
  let head = "";
  try {
    head = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", stdio: "pipe" }).trim();
  } catch {
    // no checkout yet
  }
  if (head !== r.commit) {
    fs.rmSync(dir, { recursive: true, force: true });
    cloneRepo(r.url, dir, r.commit);
  }

  // The same invocation the stored run used: defaults, bytes to stdout.
  const bundle = execFileSync("pnpm", ["exec", "tsx", path.join(CLI_DIR, "src", "index.ts"), dir, "--stdout", "-q"], {
    cwd: CLI_DIR,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Core splits "]]>" across two CDATA sections; undo it so such files still match.
  const flat = bundle.replace(/\r\n/g, "\n").replaceAll("]]]]><![CDATA[>", "]]>");
  const named = new Set([...bundle.matchAll(/<file path="([^"]*)"/g)].map((m) => m[1]));

  let source = 0;
  for (const file of (await walkRepo(dir)).files) {
    if (file.document || !named.has(file.path) || categorize(file.path) !== "source") continue;
    const text = file.text.replace(/\r\n/g, "\n").trim();
    if (text && !(flat.includes(text.slice(0, 200)) && flat.includes(text.slice(-200)))) continue;
    source += text ? enc.encode(file.text).length : 0;
  }
  const tokens = enc.encode(bundle).length;
  return { tokens, density: ratio(source, tokens) };
}

const started = Date.now();
const ours = new Map<string, { tokens: number; density: number }>();
for (const [i, r] of sample.entries()) {
  try {
    const m = await measureOurs(r);
    ours.set(r.url, m);
    const before = storedDensity(r, "fileconcat");
    console.log(
      `${String(i + 1).padStart(2)} ${r.url.replace(/^https:\/\/github\.com\//, "").padEnd(44)} ` +
        `${String(r.fileconcat.tokens).padStart(9)} -> ${String(m.tokens).padStart(9)}  ` +
        `${(before * 100).toFixed(1)}% -> ${(m.density * 100).toFixed(1)}%`,
    );
  } catch (err) {
    console.log(`${String(i + 1).padStart(2)} ${r.url} FAILED: ${(err as Error).message.slice(0, 300)}`);
  }
}
enc.free();

// A repository we could not rerun is left out of every figure, theirs included,
// so all four tools are always counted over the same set.
const scored = sample.filter((r) => ours.has(r.url));
const tokensOf = (r: Stored, tool: Tool) => (tool === "fileconcat" ? ours.get(r.url)!.tokens : r[tool].tokens);
const densityOf = (r: Stored, tool: Tool) =>
  tool === "fileconcat" ? ours.get(r.url)!.density : storedDensity(r, tool);

const densest: Record<string, number> = {};
const cheapest: Record<string, number> = {};
for (const r of scored) {
  const d = TOOLS.reduce((a, b) => (densityOf(r, a) >= densityOf(r, b) ? a : b));
  const c = TOOLS.reduce((a, b) => (tokensOf(r, a) <= tokensOf(r, b) ? a : b));
  densest[d] = (densest[d] ?? 0) + 1;
  cheapest[c] = (cheapest[c] ?? 0) + 1;
}
const label = (tool: Tool) =>
  tool === "fileconcat"
    ? `FileConcat ${version}`
    : `${LABEL[tool]} ${String(stored.versions[tool]).replace(/^code2prompt /, "")}`;
const chart = (wins: Record<string, number>) =>
  TOOLS.map((t) => ({ label: label(t), value: wins[t] ?? 0 })).sort((a, b) => b.value - a.value);

const result = {
  study: "repomix-vs-gitingest-vs-code2prompt",
  version,
  measured: new Date().toISOString().slice(0, 10),
  rows: {
    "repository-density": Number((median(scored.map((r) => densityOf(r, "fileconcat"))) * 100).toFixed(1)),
    "repository-size": Math.round(median(scored.map((r) => tokensOf(r, "fileconcat")))),
  },
  recomputed: { "repository-densest": chart(densest), "repository-cheapest": chart(cheapest) },
};

console.log(`\n${scored.length}/${sample.length} repositories scored in ${Math.round((Date.now() - started) / 1000)} s`);
console.log(JSON.stringify(result, null, 2));
if (!args.limit && scored.length === rows.length) {
  const out = path.join(MEASUREMENTS, `bench-repos-${version}.json`);
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
  console.log(`wrote ${path.relative(REPO_ROOT, out)}`);
} else {
  console.log("not written: a smoke run or a partial sample");
}
