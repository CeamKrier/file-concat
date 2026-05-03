/**
 * Source Adapter Types
 * Unified interface for fetching files from different sources
 */

import type { DownloadProgress, RepositoryContent } from "../types";

/** Supported source types */
export type SourceType = "github" | "gitlab" | "bitbucket" | "gist" | "url" | "local";

/** Source metadata for UI */
export interface SourceMeta {
  /** Source type identifier */
  type: SourceType;
  /** Display name */
  name: string;
  /** Icon name (lucide icon) */
  icon: string;
  /** Placeholder text for input */
  placeholder: string;
  /** Help text */
  helpText: string;
  /** Example URLs */
  examples: string[];
}

/** Parsed URL result */
export interface ParsedSourceUrl {
  /** Source type */
  type: SourceType;
  /** Is URL valid for this source */
  isValid: boolean;
  /** Parsed components */
  owner?: string;
  repo?: string;
  branch?: string;
  path?: string;
  /** For gists */
  gistId?: string;
  /** For URLs */
  rawUrl?: string;
  /** Error message if invalid */
  error?: string;
}

/** Fetch options */
export interface FetchOptions {
  /** Progress callback */
  onProgress?: (progress: DownloadProgress) => void;
  /** Abort signal */
  signal?: AbortSignal;
  /** Authentication token (optional) */
  token?: string;
}

/** Source adapter interface */
export interface SourceAdapter {
  /** Source type */
  type: SourceType;

  /** Source metadata for UI */
  meta: SourceMeta;

  /**
   * Check if URL matches this source
   * @param url URL to check
   * @returns true if URL is for this source
   */
  matches(url: string): boolean;

  /**
   * Validate and parse URL
   * @param url URL to parse
   * @returns Parsed URL components
   */
  parseUrl(url: string): ParsedSourceUrl;

  /**
   * Fetch files from source
   * @param url Source URL
   * @param options Fetch options
   * @returns Repository content with files
   */
  fetchFiles(url: string, options?: FetchOptions): Promise<RepositoryContent>;
}

/** Source adapter registry */
export interface SourceRegistry {
  /** All registered adapters */
  adapters: SourceAdapter[];

  /**
   * Get adapter for URL
   * @param url URL to match
   * @returns Matching adapter or undefined
   */
  getAdapter(url: string): SourceAdapter | undefined;

  /**
   * Get adapter by type
   * @param type Source type
   * @returns Adapter for type or undefined
   */
  getByType(type: SourceType): SourceAdapter | undefined;

  /**
   * Auto-detect source type from URL
   * @param url URL to detect
   * @returns Detected source type or undefined
   */
  detectType(url: string): SourceType | undefined;
}
