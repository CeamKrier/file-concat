import { minimatch } from "minimatch";

const MATCH_OPTIONS = { dot: true } as const;

/**
 * Match a file path against a single user-supplied glob pattern with
 * "matches anywhere in the path" semantics — the behaviour users intuitively
 * expect when they paste patterns like `node_modules`, `*.log`, or `src/**\/*`.
 *
 * Plain `minimatch` does not deliver this on its own: `matchBase` is ignored
 * when the pattern contains a slash, and a bare directory name does not match
 * the same name sitting in the middle of a longer path.
 */
export function pathMatches(filePath: string, pattern: string): boolean {
  if (!pattern || !filePath) return false;

  if (!pattern.includes("/")) {
    if (minimatch(filePath, pattern, { ...MATCH_OPTIONS, matchBase: true })) return true;
    const segments = filePath.split("/").filter(Boolean);
    return segments.some((segment) => minimatch(segment, pattern, MATCH_OPTIONS));
  }

  if (minimatch(filePath, pattern, MATCH_OPTIONS)) return true;

  const parts = filePath.split("/");
  for (let i = 1; i < parts.length; i++) {
    const suffix = parts.slice(i).join("/");
    if (minimatch(suffix, pattern, MATCH_OPTIONS)) return true;
  }
  return false;
}

/**
 * Match against a comma-separated list of patterns (the shape we persist in
 * UserConfig.includePatterns / ignorePatterns).
 */
export function matchesAnyPattern(filePath: string, patternList: string): boolean {
  if (!patternList || !patternList.trim()) return false;
  return patternList
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .some((pattern) => pathMatches(filePath, pattern));
}
