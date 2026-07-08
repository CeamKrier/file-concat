import type { SourceAdapter, ParsedSourceUrl, FetchOptions } from "../types";
import type { RepositoryContent, RepoFile, FetchFailure } from "../../types";
import { SOURCE_METADATA } from "../metadata";
import { createProgressReporter } from "../progress";
import { DEFAULT_DOWNLOAD_CONCURRENCY, pooledMap } from "../pooled-map";
import { classifyResponseError, fetchWithRateLimitRetry } from "./_errors";

/** Bitbucket URL regex patterns */
const BITBUCKET_REPO_REGEX =
  /^https?:\/\/bitbucket\.org\/([^/]+)\/([^/]+)(?:\/src\/([^/]+)(?:\/(.+))?)?$/;

interface BitbucketDirectoryResponse {
  values?: Array<{ type: string; path: string; size?: number }>;
  next?: string;
}

export function getBitbucketDisplayPath(itemPath: string, subPath?: string): string {
  if (subPath && itemPath.startsWith(subPath + "/")) {
    return itemPath.substring(subPath.length + 1);
  }

  if (subPath && itemPath === subPath) {
    return itemPath.split("/").pop() || itemPath;
  }

  return itemPath;
}

/**
 * Parse Bitbucket repository URL
 */
function parseBitbucketUrl(url: string): ParsedSourceUrl {
  const match = url.match(BITBUCKET_REPO_REGEX);

  if (!match) {
    return {
      type: "bitbucket",
      isValid: false,
      error: "Invalid Bitbucket URL format. Expected: https://bitbucket.org/workspace/repo",
    };
  }

  const [, owner, repo, branch, path] = match;

  return {
    type: "bitbucket",
    isValid: true,
    owner,
    repo: repo.replace(/\.git$/, ""),
    branch: branch || undefined,
    path: path || undefined,
  };
}

/**
 * Recursively fetch directory contents from Bitbucket
 */
async function fetchDirectoryContents(
  workspace: string,
  repo: string,
  branch: string,
  path: string,
  signal?: AbortSignal,
  onFilesFound?: (added: number) => void,
): Promise<Array<{ path: string; type: string; size?: number }>> {
  const items: Array<{ path: string; type: string; size?: number }> = [];
  let nextUrl: string | null =
    `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/src/${branch}/${path}?pagelen=100`;

  while (nextUrl) {
    const response: Response = await fetchWithRateLimitRetry(nextUrl, { signal });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("Repository, branch, or path not found");
      }
      throw classifyResponseError(
        response,
        `Bitbucket repository ${workspace}/${repo}@${branch}`,
      );
    }

    const data = (await response.json()) as BitbucketDirectoryResponse;

    let pageFiles = 0;
    for (const item of data.values || []) {
      if (item.type === "commit_file") {
        items.push({
          path: item.path,
          type: "file",
          size: item.size,
        });
        pageFiles++;
      } else if (item.type === "commit_directory") {
        // Recursively fetch subdirectory
        const subItems = await fetchDirectoryContents(
          workspace,
          repo,
          branch,
          item.path,
          signal,
          onFilesFound,
        );
        items.push(...subItems);
      }
    }
    // Tick per page (one network round-trip) so the walk shows live movement.
    if (pageFiles > 0) onFilesFound?.(pageFiles);

    nextUrl = data.next || null;
  }

  return items;
}

/**
 * Resolve a Bitbucket ref (an explicit branch, or the repo's default branch when
 * none is given) to a commit hash by following the /src redirect and reading the
 * resolved URL. Passing a branch name straight into /src/{ref}/{path} has two
 * failure modes this avoids: a default branch that isn't "main", and branch
 * names that contain a slash (e.g. "release/public"), which the path-based
 * endpoint mis-routes into a 404.
 */
async function resolveBitbucketRef(
  workspace: string,
  repo: string,
  branch: string | undefined,
  signal?: AbortSignal,
): Promise<string> {
  const base = `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/src`;
  const url = branch ? `${base}/${branch}/` : base;
  const response = await fetchWithRateLimitRetry(url, { signal });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Repository '${workspace}/${repo}' not found`);
    }
    throw classifyResponseError(response, `Bitbucket repository ${workspace}/${repo}`);
  }
  // The URL after the redirect carries the commit: .../src/{40-hex-commit}/...
  const match = response.url?.match(/\/src\/([0-9a-f]{7,40})(?:[/?#]|$)/);
  return match?.[1] ?? branch ?? "HEAD";
}

/**
 * Fetch files from Bitbucket repository
 */
async function fetchBitbucketFiles(
  url: string,
  options?: FetchOptions,
): Promise<RepositoryContent> {
  const { onProgress, onStatus, signal } = options || {};

  try {
    onStatus?.("Connecting to Bitbucket");

    const parsed = parseBitbucketUrl(url);
    if (!parsed.isValid || !parsed.owner || !parsed.repo) {
      throw new Error(parsed.error || "Invalid Bitbucket URL");
    }

    const { owner: workspace, repo, path: subPath } = parsed;

    // Resolve the ref to a commit before listing (see resolveBitbucketRef): this
    // is what fixes default branches that aren't "main" and slashed branch names.
    onStatus?.("Finding the default branch");
    const branch = await resolveBitbucketRef(workspace, repo, parsed.branch, signal);

    // Fetch file tree
    onStatus?.("Listing files");
    const startPath = subPath || "";
    let listed = 0;
    const files = await fetchDirectoryContents(workspace, repo, branch, startPath, signal, (added) => {
      listed += added;
      onStatus?.(`Listing files… ${listed} found`);
    });

    if (files.length === 0) {
      throw new Error("No files found in repository");
    }

    onStatus?.(`Downloading ${files.length} ${files.length === 1 ? "file" : "files"}`);
    const progress = createProgressReporter({ totalFiles: files.length, onProgress });

    const failures: FetchFailure[] = [];

    const fetchedFiles = await pooledMap(files, DEFAULT_DOWNLOAD_CONCURRENCY, async (item) => {
      const contentUrl = `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/src/${branch}/${item.path}`;
      const displayPath = getBitbucketDisplayPath(item.path, subPath);

      try {
        const response = await fetchWithRateLimitRetry(contentUrl, { signal });
        if (!response.ok) {
          throw new Error(`Failed to fetch ${item.path}`);
        }

        const content = await response.text();
        progress.fileComplete(item.path);

        return {
          name: displayPath.split("/").pop() || "",
          path: displayPath,
          type: "text/plain",
          size: item.size || content.length,
          content,
        } as RepoFile;
      } catch (error) {
        if (signal?.aborted) {
          throw new Error("Aborted");
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

export const bitbucketAdapter: SourceAdapter = {
  type: "bitbucket",
  meta: SOURCE_METADATA.bitbucket,
  matches: (url) => url.includes("bitbucket.org") && BITBUCKET_REPO_REGEX.test(url),
  parseUrl: parseBitbucketUrl,
  fetchFiles: fetchBitbucketFiles,
};
