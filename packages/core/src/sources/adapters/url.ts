import type { SourceAdapter, ParsedSourceUrl, FetchOptions } from "../types";
import type { RepositoryContent, RepoFile } from "../../types";
import { SOURCE_METADATA } from "../metadata";

/** URL validation regex */
const URL_REGEX = /^https?:\/\/.+/;

/** Known raw content hosts (no CORS issues) */
const RAW_HOSTS = [
  "raw.githubusercontent.com",
  "gist.githubusercontent.com",
  "gitlab.com", // when using /raw endpoint
  "pastebin.com",
  "hastebin.com",
  "cdn.jsdelivr.net",
  "unpkg.com",
  "cdnjs.cloudflare.com",
];

/** File extension to language mapping */
const EXT_TO_LANGUAGE: Record<string, string> = {
  ".js": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".py": "python",
  ".rb": "ruby",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".kt": "kotlin",
  ".swift": "swift",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".php": "php",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".xml": "xml",
  ".html": "html",
  ".css": "css",
  ".scss": "scss",
  ".less": "less",
  ".md": "markdown",
  ".sql": "sql",
  ".graphql": "graphql",
  ".vue": "vue",
  ".svelte": "svelte",
};

/**
 * Extract filename from URL
 */
export function getFilenameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const segments = pathname.split("/").filter(Boolean);

    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1];
      // Remove query params from filename
      return lastSegment.split("?")[0] || "file.txt";
    }

    return "file.txt";
  } catch {
    return "file.txt";
  }
}

/**
 * Get language from filename
 */
export function getLanguageFromFilename(filename: string): string {
  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
  return EXT_TO_LANGUAGE[ext] || "text";
}

/**
 * Check if URL is likely to have CORS issues
 */
export function mightHaveCorsIssues(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return !RAW_HOSTS.some((host) => urlObj.hostname.includes(host));
  } catch {
    return true;
  }
}

/**
 * Parse URL
 */
export function parseUrlSource(url: string): ParsedSourceUrl {
  // Basic URL validation
  if (!URL_REGEX.test(url)) {
    return {
      type: "url",
      isValid: false,
      error: "Invalid URL format. Must start with http:// or https://",
    };
  }

  try {
    new URL(url);

    return {
      type: "url",
      isValid: true,
      rawUrl: url,
    };
  } catch {
    return {
      type: "url",
      isValid: false,
      error: "Invalid URL format",
    };
  }
}

/**
 * Fetch file from URL
 */
async function fetchUrlFiles(url: string, options?: FetchOptions): Promise<RepositoryContent> {
  const { onProgress, signal } = options || {};

  try {
    const parsed = parseUrlSource(url);
    if (!parsed.isValid) {
      throw new Error(parsed.error || "Invalid URL");
    }

    // Show indeterminate progress
    onProgress?.({
      currentFile: "Fetching URL...",
      totalFiles: 1,
      completedFiles: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      speed: 0,
    });

    const response = await fetch(url, {
      signal,
      // Some servers need these headers
      headers: {
        Accept: "text/plain, */*",
      },
    });

    if (!response.ok) {
      if (response.status === 0) {
        throw new Error(
          "Request failed (possibly CORS). Try using a raw content URL from GitHub, GitLab, or a CDN.",
        );
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Check content type
    const contentType = response.headers.get("Content-Type") || "";
    const isText =
      contentType.includes("text/") ||
      contentType.includes("application/json") ||
      contentType.includes("application/javascript") ||
      contentType.includes("application/xml") ||
      contentType.includes("application/x-yaml");

    if (!isText && !contentType.includes("charset")) {
      // Might be binary, warn user
      console.warn(`Content-Type "${contentType}" might not be text`);
    }

    const content = await response.text();
    const filename = getFilenameFromUrl(url);
    const language = getLanguageFromFilename(filename);

    // Update progress
    onProgress?.({
      currentFile: filename,
      totalFiles: 1,
      completedFiles: 1,
      downloadedBytes: content.length,
      totalBytes: content.length,
      speed: 0,
    });

    const file: RepoFile = {
      name: filename,
      path: filename,
      type: contentType || `text/${language}`,
      size: content.length,
      content,
    };

    return { files: [file] };
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || error.message === "Aborted")) {
      throw new Error("AbortError");
    }

    // Enhance error message for CORS
    if (error instanceof TypeError && error.message.includes("fetch")) {
      return {
        files: [],
        error:
          "Failed to fetch URL. This might be due to CORS restrictions. Try using a raw content URL from GitHub, GitLab, or a CDN.",
      };
    }

    return {
      files: [],
      error: error instanceof Error ? error.message : "Failed to fetch URL",
    };
  }
}

export const urlAdapter: SourceAdapter = {
  type: "url",
  meta: SOURCE_METADATA.url,
  // Fallback: the registry only consults this adapter when no specific
  // adapter matched, so a broad http(s) regex is safe.
  priority: "fallback",
  matches: (url) => URL_REGEX.test(url),
  parseUrl: parseUrlSource,
  fetchFiles: fetchUrlFiles,
};
