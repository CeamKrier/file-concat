import { DEFAULT_IGNORE_PATTERNS } from "../default-ignore";
import { NEVER_TEXT_EXTENSIONS } from "../file-processing/unreadable-reason";
import { pathMatches } from "./glob-match";

/**
 * Skip-test for `DEFAULT_IGNORE_PATTERNS` using the canonical
 * {@link pathMatches} "matches anywhere in the path" semantics.
 */
export const shouldSkipPath = (path: string): boolean =>
  DEFAULT_IGNORE_PATTERNS.some((pattern) => pathMatches(path, pattern));

/**
 * The plain names in the default list, read as directory names: `dist`,
 * `__pycache__`, `vendor`, `.git`. A glob (`*.log`) or a slashed pattern is
 * never one of these, and a plain file name (`package-lock.json`) is in the set
 * but no directory is ever called that.
 */
const PRUNED_DIRECTORY_NAMES: ReadonlySet<string> = new Set(
  DEFAULT_IGNORE_PATTERNS.filter((pattern) => !/[*?[\]/]/.test(pattern)),
);

/** A directory the defaults name by itself. The web walk never enters one. */
export const isPrunedDirectory = (name: string): boolean => PRUNED_DIRECTORY_NAMES.has(name);

/**
 * Whether a dropped path is left out before a byte of it is read: it sits under
 * a directory the defaults name, or its extension never holds text. Measured
 * 2026-09-15: a file that never reaches the bundle still cost an 8 KB read
 * and a classification, 1.5 ms each, and the biggest drops were mostly such
 * files (`__pycache__`, `build`, object files, fonts). What this drops cannot
 * be turned back on from the filter rail; everything else in the defaults can.
 */
export function prunedAtWalk(path: string): boolean {
  const segments = path.split("/");
  const name = segments.pop() ?? path;
  if (segments.some(isPrunedDirectory)) return true;
  const dot = name.lastIndexOf(".");
  return dot > 0 && NEVER_TEXT_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}
