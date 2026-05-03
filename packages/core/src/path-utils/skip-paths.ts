import { minimatch } from "minimatch";
import { DEFAULT_IGNORE_PATTERNS } from "../default-ignore";

// Deprecated: Use DEFAULT_IGNORE_PATTERNS from default-ignore.ts instead
// Keeping this structure for backward compatibility where specific categories might be referenced
// but strictly speaking, the unified pattern list should be preferred.
export const SKIP_PATHS = {
  // Legacy categories - preserved but static
  javascript: ["node_modules", "dist", "build", "coverage", ".next", ".nuxt"],
  common: [".git", ".svn", ".hg", ".idea", ".vscode", ".DS_Store"],
};

// Use the comprehensive default ignore patterns as the source of truth
export const ALL_SKIP_PATHS = DEFAULT_IGNORE_PATTERNS;

/**
 * Check if a path should be skipped based on default patterns.
 * Matches the full path against each pattern, and also each path segment so
 * bare directory names like "node_modules" skip everything beneath them.
 */
export const shouldSkipPath = (path: string): boolean => {
  const segments = path.split("/").filter(Boolean);
  return ALL_SKIP_PATHS.some((pattern) => {
    if (minimatch(path, pattern, { dot: true })) return true;
    return segments.some((seg) => minimatch(seg, pattern, { dot: true }));
  });
};
