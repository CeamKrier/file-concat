export type FileEntry = {
  file: File;
  path: string;
  content: string; // Add this field
};

export type FileContent = {
  path: string;
  content: string;
};

export type FileStatus = {
  path: string;
  included: boolean;
  reason?: string;
  size: number;
  type: string;
  forceInclude?: boolean;
  skipped?: boolean;
  skipReason?: string;
  /** Content classification from ingest. A `binary` file is locked out of
   * curation — no inclusion toggle, no preview — because it has no recoverable
   * text to add (ADR-0009). */
  classification?: TextClassification;
  /** True when this file's content is text extracted from a document
   * (PDF/Office/ODF) rather than the file's own bytes (ADR-0003). */
  extracted?: boolean;
  index: number; // Required index for reliable matching
};

export type ProcessingConfig = {
  maxFileSizeMB: number;
  excludeHiddenFiles: boolean;
  excludeBinaryFiles: boolean;
};

/**
 * Current schema version for {@link UserConfig}. Bump when the persisted
 * shape changes and update the `migrateConfig` handler in the web app
 * accordingly. The literal lives here so the type definition and every
 * migration consumer share one source of truth.
 *
 * 8 repairs data rather than changing shape. Every build shipped with
 * `ignorePatterns` frozen as `undefined` (see `defaultConfig()` in
 * `use-config.ts`), and `JSON.stringify` drops an `undefined` value entirely —
 * so anyone who saved a setting in that window holds a v7 payload with no
 * `ignorePatterns` key, and `useConfig` takes such a payload verbatim because
 * the version matches. The bump forces those through `migrateConfig` once,
 * where `pickIgnorePatterns` restores the default, and the repaired config is
 * written back. One pass, not a permanent guard: the verbatim path has to keep
 * working, or a deliberately-emptied ignore box could never survive a reload.
 */
export const CONFIG_VERSION = 8;

// User configuration with schema versioning for localStorage
export type UserConfig = {
  version: typeof CONFIG_VERSION;
  maxFileSizeMB: number;
  // Pattern filtering (glob syntax)
  includePatterns: string;
  ignorePatterns: string;
  // File processing options
  showLineNumbers: boolean;
  // Output preferences
  defaultOutputFormat: OutputFormatPreference;
  outputStyle: "xml" | "markdown" | "plain";
  // Target size (KB) per part when emitting multi-part output.
  chunkSizeKB: number;
};

export type TokenCount = {
  total: number;
  byFile: Record<string, number>;
};

export type LLMContextLimit = {
  name: string;
  limit: number;
  inputLimit?: number;
};

// Import type for helper function
import type { FilteredModel } from "./models/types";
import type { TextClassification } from "./file-processing/text-classification";

// Helper: FilteredModel'den LLMContextLimit olusturma (backward compat)
export function modelToContextLimit(model: FilteredModel): LLMContextLimit {
  return {
    name: `${model.providerName} ${model.name}`,
    limit: model.contextLimit,
    inputLimit: model.contextLimit,
  };
}

export type OutputFormat = "single" | "multi";

/**
 * Persisted output-format preference. `"auto"` defers to the live token-count
 * recommendation; `"single"` / `"multi"` pin the choice across sessions.
 */
export type OutputFormatPreference = "auto" | OutputFormat;

export interface FileValidationResult {
  isValid: boolean;
  reason?: string;
  /** How the content read: text, binary (excluded), or ambiguous (kept, flagged).
   * Undefined when binary checking is off. */
  classification?: TextClassification;
}

export interface GitHubFile {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  sha: string;
  url: string;
  download_url: string | null;
  content?: string;
}

export interface GitLabFile {
  id: string;
  name: string;
  type: "tree" | "blob";
  path: string;
  mode: string;
}

export interface RepoFile {
  name: string;
  path: string;
  type: string;
  size: number;
  content?: string;
  download_url?: string;
}

export interface FetchFailure {
  /** Display path of the file the adapter listed but could not retrieve. */
  path: string;
  /** Human-readable reason, surfaced to the user rather than swallowed. */
  reason: string;
}

export interface RepositoryContent {
  files: RepoFile[];
  error?: string;
  /**
   * Files that were listed but could not be downloaded (network error,
   * rate-limit, etc). Per ADR-0004 these are surfaced to the user instead of
   * silently dropped. Absent when every listed file was fetched.
   */
  failures?: FetchFailure[];
}

export interface DownloadProgress {
  currentFile: string;
  totalFiles: number;
  completedFiles: number;
  downloadedBytes: number;
  totalBytes: number;
  speed: number;
}
