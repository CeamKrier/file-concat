/**
 * Cloning a repository and turning it into the file list the product would
 * bundle. Extracted from `measure-repo-funnel.ts` so the overhead measurement
 * walks repositories the same way rather than growing a second opinion about
 * what the defaults remove.
 *
 * Every decision here comes from `@fileconcat/core` and the same `glob` walk the
 * CLI runs. What counts as text is `routeBytes` plus `classifyBytes`, what the
 * defaults remove is `DEFAULT_GLOB_IGNORE` plus the gitignore matcher, and
 * documents go through the CLI's own parser registry. There is no second
 * implementation of any of that here, and there must not be one.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { glob } from "glob";
import {
  DEFAULT_GLOB_IGNORE,
  ROUTER_SNIFF_BYTES,
  classifyBytes,
  createGitignoreMatcher,
  routeBytes,
  type ExcludedSummary,
  type OutputFile,
} from "@fileconcat/core";

import { parsers } from "../src/parsers.js";

/** The CLI's default --max-size. */
export const MAX_FILE_BYTES = 32 * 1024 * 1024;

/**
 * The set of paths the product's defaults leave standing, plus which of the
 * three defaults removed each of the others. Running glob again rather than
 * re-matching the patterns here keeps the decision in one place.
 *
 * The attribution matters more than it looks. "Excluded by default" reads as
 * lockfiles and build output, and in a fresh clone it is mostly hidden files:
 * CI workflows, editor config, repository metadata. An article that does not
 * separate the two is claiming something the numbers do not say.
 */
export type ExcludedBy = "hidden" | "defaultIgnore" | "gitignore";

export interface WalkedFile {
  path: string;
  text: string;
  kept: boolean;
  excludedBy: ExcludedBy | null;
  /** The text came out of a document parser (pdf, docx, ...) rather than a decoder. */
  document: boolean;
}

export interface WalkResult {
  /** Everything on disk except `.git`, which is version control rather than content. */
  found: number;
  /** Text-eligible files, kept and excluded alike, in walk order. */
  files: WalkedFile[];
  /** The kept files as the bundle takes them, in walk order. */
  kept: OutputFile[];
  /** Content gaps the bundle reports (ADR-0008), for kept files only. */
  excluded: ExcludedSummary;
  skipped: { oversize: number; unreadable: number; unextractable: number };
}

/**
 * A shallow clone, pinned to `commit` when one is given so a rerun measures the
 * same trees rather than whatever the default branch has moved to. Returns the
 * commit actually checked out.
 */
export function cloneRepo(url: string, dir: string, commit?: string): string {
  if (commit) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync("git", ["-C", dir, "init", "--quiet"], { stdio: "pipe" });
    execFileSync("git", ["-C", dir, "remote", "add", "origin", url], { stdio: "pipe" });
    execFileSync("git", ["-C", dir, "fetch", "--depth", "1", "--quiet", "origin", commit], {
      stdio: "pipe",
    });
    execFileSync("git", ["-C", dir, "checkout", "--quiet", "FETCH_HEAD"], { stdio: "pipe" });
  } else {
    execFileSync("git", ["clone", "--depth", "1", "--quiet", url, dir], { stdio: "pipe" });
  }
  return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf-8" }).trim();
}

function readPrefix(fullPath: string, size: number): Uint8Array {
  const length = Math.min(ROUTER_SNIFF_BYTES, size);
  const buffer = Buffer.alloc(length);
  const fd = fs.openSync(fullPath, "r");
  try {
    fs.readSync(fd, buffer, 0, length, 0);
  } finally {
    fs.closeSync(fd);
  }
  return buffer;
}

async function partitionByDefaults(cwd: string) {
  const visible = await glob("**/*", { cwd, nodir: true, dot: false });
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
  let kept = afterIgnore;
  if (gitignores.length > 0) {
    const matcher = createGitignoreMatcher(
      gitignores.map((rel) => {
        const slash = rel.lastIndexOf("/");
        return {
          dir: slash === -1 ? "" : rel.slice(0, slash),
          content: fs.readFileSync(path.join(cwd, rel), "utf-8"),
        };
      }),
    );
    kept = afterIgnore.filter((file) => !matcher.ignores(file));
  }

  const visibleSet = new Set(visible);
  const afterIgnoreSet = new Set(afterIgnore);
  const keptSet = new Set(kept);

  /** First reason that applies, in the order the product applies them. */
  const reason = (rel: string): ExcludedBy | null => {
    if (keptSet.has(rel)) return null;
    if (!visibleSet.has(rel)) return "hidden";
    if (!afterIgnoreSet.has(rel)) return "defaultIgnore";
    return "gitignore";
  };

  return { keptSet, reason };
}

export async function walkRepo(dir: string): Promise<WalkResult> {
  // Stage 1 is everything on disk. `.git` is the version control database, not
  // repository content, and counting it would drown every other number.
  const found = await glob("**/*", { cwd: dir, nodir: true, dot: true, ignore: [".git/**"] });
  const { keptSet, reason } = await partitionByDefaults(dir);

  const files: WalkedFile[] = [];
  const kept: OutputFile[] = [];
  const skipped = { oversize: 0, unreadable: 0, unextractable: 0 };
  /**
   * Content gaps the bundle reports (ADR-0008). Only for files that survived
   * the default filters: the CLI never walks the others, so it never names them.
   */
  const excluded: ExcludedSummary = { oversize: [], unextractable: [], unreadable: [] };
  const noteGap = (bucket: keyof ExcludedSummary, rel: string) => {
    if (keptSet.has(rel)) excluded[bucket]!.push(rel);
  };

  for (const rel of found) {
    const full = path.join(dir, rel);
    let size = 0;
    try {
      size = fs.statSync(full).size;
    } catch {
      skipped.unreadable++;
      noteGap("unreadable", rel);
      continue;
    }
    if (size > MAX_FILE_BYTES) {
      skipped.oversize++;
      noteGap("oversize", rel);
      continue;
    }

    let text: string | null = null;
    let document = false;
    try {
      const route = await routeBytes(readPrefix(full, size));
      if (route.kind === "extract") {
        document = true;
        const extracted = await parsers.extract(route.parserId, fs.readFileSync(full));
        if (!extracted.text) {
          skipped.unextractable++;
          noteGap("unextractable", rel);
          continue;
        }
        text = extracted.text;
      } else if (route.kind !== "binary") {
        const decoded = classifyBytes(fs.readFileSync(full));
        if (decoded.classification !== "binary") text = decoded.text;
      }
    } catch {
      skipped.unreadable++;
      noteGap("unreadable", rel);
      continue;
    }
    if (text === null) continue;

    const isKept = keptSet.has(rel);
    if (isKept) kept.push({ path: rel, content: text });
    files.push({ path: rel, text, kept: isKept, excludedBy: reason(rel), document });
  }

  return { found: found.length, files, kept, excluded, skipped };
}
