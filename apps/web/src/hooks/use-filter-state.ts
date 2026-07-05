import { useCallback, useMemo, useState } from "react";
import type { FileStatus } from "@fileconcat/core";
import { collectGitignoreSources, createGitignoreMatcher, matchesAnyPattern } from "@fileconcat/core";

import type { ContentEntry, ValidationRecord } from "./use-file-ingestion";

type ManualOverride = "include" | "exclude";

export interface FilterState {
  fileStatuses: FileStatus[];
  includedFileCount: number;
  manualOverrideCount: number;
  hasFiles: boolean;
  toggleFile: (index: number) => void;
  toggleMany: (indices: number[], shouldInclude: boolean) => void;
  clearOverrides: () => void;
  reset: () => void;
}

export interface FilterStateInputs {
  entries: ContentEntry[];
  validations: Record<string, ValidationRecord>;
  includePatterns: string;
  ignorePatterns: string;
}

/**
 * Live filter pipeline. `validations` are populated once at ingest and
 * `userToggled` is the sticky manual override layer. `fileStatuses` derives
 * from those plus the user's pattern textareas so pattern edits, preset
 * clicks, and manual toggles all flow through one memo without losing the
 * user's explicit decisions.
 */
export function useFilterState({
  entries,
  validations,
  includePatterns,
  ignorePatterns,
}: FilterStateInputs): FilterState {
  const [userToggled, setUserToggled] = useState<Record<string, ManualOverride>>({});

  // .gitignore files ride along in `entries` — ingestion keeps them; only the
  // bundle drops them. Compose them into a hierarchical matcher so nested
  // .gitignore files apply per-subtree and the drop-root path prefix is honored.
  const gitignore = useMemo(
    () => createGitignoreMatcher(collectGitignoreSources(entries)),
    [entries],
  );

  const hasIncludes = !!includePatterns?.trim();

  // Compose model: a non-empty include list narrows the set, and both the
  // ignore textarea (default noise + user patterns) and the project's
  // .gitignore always subtract on top. An explicit include no longer disables
  // ignores — the manual per-file toggle is the escape hatch for a one-off.
  const isExcludedPath = useCallback(
    (path: string): boolean => {
      if (hasIncludes && !matchesAnyPattern(path, includePatterns)) return true;
      if (matchesAnyPattern(path, ignorePatterns)) return true;
      return gitignore.ignores(path);
    },
    [hasIncludes, includePatterns, ignorePatterns, gitignore],
  );

  const excludeReason = useCallback(
    (path: string): string => {
      if (hasIncludes && !matchesAnyPattern(path, includePatterns))
        return "Outside include patterns";
      if (matchesAnyPattern(path, ignorePatterns)) return "Matched ignore patterns";
      if (gitignore.ignores(path)) return "Matched .gitignore";
      return "Excluded";
    },
    [hasIncludes, includePatterns, ignorePatterns, gitignore],
  );

  const patternDecision = useCallback(
    (path: string): boolean => {
      const validation = validations[path];
      if (!validation || !validation.included) return false;
      return !isExcludedPath(path);
    },
    [validations, isExcludedPath],
  );

  const fileStatuses = useMemo<FileStatus[]>(() => {
    return entries.map((entry, index) => {
      const validation = validations[entry.path];
      const baseIncluded = validation?.included ?? true;
      const baseReason = validation?.reason;
      const size = validation?.size ?? 0;
      const type = validation?.type ?? "text/plain";
      const override = userToggled[entry.path];

      let included: boolean;
      let forceInclude = false;
      let reason = baseReason;
      if (override === "include") {
        included = true;
        forceInclude = true;
      } else if (override === "exclude") {
        included = false;
        reason = "Excluded manually";
      } else {
        included = baseIncluded && !isExcludedPath(entry.path);
        if (!included && baseIncluded) {
          reason = excludeReason(entry.path);
        }
      }

      return {
        path: entry.path,
        included,
        reason,
        size,
        type,
        forceInclude,
        index,
      };
    });
  }, [entries, validations, userToggled, isExcludedPath, excludeReason]);

  const toggleFile = useCallback(
    (index: number) => {
      const status = fileStatuses[index];
      if (!status) return;
      const target = !status.included;
      setUserToggled((prev) => {
        const next = { ...prev };
        if (target === patternDecision(status.path)) delete next[status.path];
        else next[status.path] = target ? "include" : "exclude";
        return next;
      });
    },
    [fileStatuses, patternDecision],
  );

  const toggleMany = useCallback(
    (indices: number[], shouldInclude: boolean) => {
      setUserToggled((prev) => {
        const next = { ...prev };
        for (const i of indices) {
          const status = fileStatuses[i];
          if (!status) continue;
          if (shouldInclude === patternDecision(status.path)) delete next[status.path];
          else next[status.path] = shouldInclude ? "include" : "exclude";
        }
        return next;
      });
    },
    [fileStatuses, patternDecision],
  );

  const clearOverrides = useCallback(() => setUserToggled({}), []);
  const reset = clearOverrides;

  const includedFileCount = fileStatuses.filter((s) => s.included).length;
  const manualOverrideCount = Object.keys(userToggled).length;

  return {
    fileStatuses,
    includedFileCount,
    manualOverrideCount,
    hasFiles: entries.length > 0,
    toggleFile,
    toggleMany,
    clearOverrides,
    reset,
  };
}
