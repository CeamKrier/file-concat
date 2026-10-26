import type { SourceAdapter, ParsedSourceUrl, FetchOptions } from "../types";
import type { RepositoryContent, RepoFile, FetchFailure } from "../../types";
import { SOURCE_METADATA } from "../metadata";
import { createProgressReporter } from "../progress";
import { DEFAULT_DOWNLOAD_CONCURRENCY, pooledMap } from "../pooled-map";
import { classifyResponseError, fetchWithRateLimitRetry } from "./_errors";

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);
// GitHub's own character sets. The parts are interpolated into API and raw
// paths, so nothing outside them gets that far.
const OWNER_REGEX = /^[A-Za-z0-9_-]{1,39}$/;
const REPO_REGEX = /^[A-Za-z0-9_.-]{1,100}$/;
const MAX_REF_LENGTH = 255;
const GITHUB_RAW_REGEX = /^https?:\/\/raw\.githubusercontent\.com\//;

interface GitHubTreeItem {
  type: string;
  path: string;
  size: number;
}

interface GitHubTreeResponse {
  tree: GitHubTreeItem[];
  /**
   * GitHub sets this when the recursive tree exceeds ~100k entries or 7MB and
   * the returned `tree` is therefore incomplete. Must not be ignored.
   */
  truncated?: boolean;
}

export function isGitHubTreeItemIncluded(
  item: { type: string; path: string },
  subPath?: string,
): boolean {
  if (item.type !== "blob") return false;
  if (subPath) {
    return item.path.startsWith(subPath + "/") || item.path === subPath;
  }
  return true;
}

export function getGitHubDisplayPath(itemPath: string, subPath?: string): string {
  if (subPath && itemPath.startsWith(subPath + "/")) {
    return itemPath.substring(subPath.length + 1);
  }

  if (subPath && itemPath === subPath) {
    return itemPath.split("/").pop() || itemPath;
  }

  return itemPath;
}

/**
 * Parse a GitHub repository URL as people paste it from the address bar:
 * `www.`, a trailing slash, `?tab=...`, `#readme` and `.git` are all fine.
 * `/tree/<ref>/<path>` and `/blob/<ref>/<path>` narrow to a ref and subpath;
 * any other page under the repo (issues, pulls) means the repo itself. The
 * URL parser resolves dot segments, `%2e%2e` included, before we split.
 */
function parseGitHubUrl(url: string): ParsedSourceUrl {
  let parsed: URL | undefined;
  try {
    parsed = new URL(url);
  } catch {
    // reported as invalid below
  }

  const [owner = "", rawRepo = "", kind, ref, ...rest] =
    parsed?.pathname.split("/").filter(Boolean) ?? [];
  const repo = rawRepo.replace(/\.git$/, "");
  const narrowed = (kind === "tree" || kind === "blob") && ref !== undefined;

  const valid =
    parsed !== undefined &&
    (parsed.protocol === "https:" || parsed.protocol === "http:") &&
    GITHUB_HOSTS.has(parsed.hostname) &&
    OWNER_REGEX.test(owner) &&
    REPO_REGEX.test(repo) &&
    repo !== "." &&
    repo !== ".." &&
    (!narrowed || ref.length <= MAX_REF_LENGTH);

  if (!valid) {
    if (GITHUB_RAW_REGEX.test(url)) {
      return {
        type: "github",
        isValid: false,
        error: "Raw GitHub URLs should use the URL adapter",
        rawUrl: url,
      };
    }

    return {
      type: "github",
      isValid: false,
      error: "Invalid GitHub URL format. Expected: https://github.com/owner/repo",
    };
  }

  return {
    type: "github",
    isValid: true,
    owner,
    repo,
    branch: narrowed ? ref : undefined,
    path: narrowed && rest.length ? rest.join("/") : undefined,
  };
}

/**
 * Fetch files from GitHub repository
 */
async function fetchGitHubFiles(url: string, options?: FetchOptions): Promise<RepositoryContent> {
  const { onProgress, onStatus, signal } = options || {};

  try {
    onStatus?.("Connecting to GitHub");

    const parsed = parseGitHubUrl(url);
    if (!parsed.isValid || !parsed.owner || !parsed.repo) {
      throw new Error(parsed.error || "Invalid GitHub URL");
    }

    const { owner, repo, branch, path: subPath } = parsed;
    // Without a ref the tree is read at HEAD, the default branch, so one API
    // request covers the import: the anonymous budget is 60 an hour per IP.
    const ref = branch ?? "HEAD";

    onStatus?.("Listing files");
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`;
    const treeResponse = await fetchWithRateLimitRetry(treeUrl, { signal });

    if (!treeResponse.ok) {
      if (treeResponse.status === 404) {
        throw new Error(
          branch
            ? `Branch '${branch}' not found in repository`
            : `Repository '${owner}/${repo}' not found`,
        );
      }
      throw classifyResponseError(treeResponse, `GitHub repo ${owner}/${repo}`);
    }

    const treeData = (await treeResponse.json()) as GitHubTreeResponse;

    // GitHub caps the recursive tree at ~100k entries / 7MB and flags it
    // `truncated`. A partial repo is never shipped (ADR-0004). The archive
    // route is closed to a browser (codeload grants CORS to GitHub's own
    // origin only), so the way out is the user downloading the ZIP.
    if (treeData.truncated) {
      throw new Error(`Repository '${owner}/${repo}' is too large to list in the browser`);
    }

    const files = treeData.tree.filter((item) => isGitHubTreeItemIncluded(item, subPath));

    if (subPath && files.length === 0) {
      throw new Error(`Path '${subPath}' not found in branch '${branch}'`);
    }

    onStatus?.(`Downloading ${files.length} ${files.length === 1 ? "file" : "files"}`);
    const totalBytes = files.reduce((acc, file) => acc + (file.size || 0), 0);
    const progress = createProgressReporter({
      totalFiles: files.length,
      totalBytes,
      onProgress,
    });

    const failures: FetchFailure[] = [];

    const fetchedFiles = await pooledMap(files, DEFAULT_DOWNLOAD_CONCURRENCY, async (item) => {
      // A file name can hold `#`, `?` or `%`, which would cut or bend the URL.
      const encodedPath = item.path.split("/").map(encodeURIComponent).join("/");
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${encodedPath}`;
      const displayPath = getGitHubDisplayPath(item.path, subPath);

      try {
        const response = await fetchWithRateLimitRetry(rawUrl, { signal });
        if (!response.ok) {
          throw new Error(`Failed to fetch ${item.path}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("ReadableStream not supported");
        }

        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (signal?.aborted) {
            reader.cancel();
            throw new Error("Aborted");
          }
          chunks.push(value);
          progress.bytesReceived(item.path, value.length);
        }

        progress.fileComplete(item.path);

        // Combine chunks
        const allChunks = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
        let position = 0;
        for (const chunk of chunks) {
          allChunks.set(chunk, position);
          position += chunk.length;
        }

        const content = new TextDecoder().decode(allChunks);

        return {
          name: displayPath.split("/").pop() || "",
          path: displayPath,
          type: "text/plain",
          size: item.size,
          content,
          download_url: rawUrl,
        } as RepoFile;
      } catch (error) {
        if (error instanceof Error && error.message === "Aborted") {
          throw error;
        }
        failures.push({
          path: displayPath,
          reason: error instanceof Error ? error.message : "Download failed",
        });
        return null;
      }
    });

    const validFiles = fetchedFiles.filter((file): file is RepoFile => file !== null);

    return { files: validFiles, failures: failures.length ? failures : undefined };
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || error.message === "Aborted")) {
      throw new Error("AbortError");
    }
    return {
      files: [],
      error: error instanceof Error ? error.message : "Failed to fetch repository",
    };
  }
}

export const githubAdapter: SourceAdapter = {
  type: "github",
  meta: SOURCE_METADATA.github,
  matches: (url) => parseGitHubUrl(url).isValid,
  parseUrl: parseGitHubUrl,
  fetchFiles: fetchGitHubFiles,
};
