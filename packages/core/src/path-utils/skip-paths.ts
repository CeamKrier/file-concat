import { minimatch } from "minimatch";
import { DEFAULT_IGNORE_PATTERNS } from "../default-ignore";

/**
 * Check if a path should be skipped based on default patterns.
 * Matches the full path against each pattern, and also each path segment so
 * bare directory names like "node_modules" skip everything beneath them.
 */
export const shouldSkipPath = (path: string): boolean => {
  const segments = path.split("/").filter(Boolean);
  return DEFAULT_IGNORE_PATTERNS.some((pattern) => {
    if (minimatch(path, pattern, { dot: true })) return true;
    return segments.some((seg) => minimatch(seg, pattern, { dot: true }));
  });
};
