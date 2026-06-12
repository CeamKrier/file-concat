import type { SourceAdapter, ParsedSourceUrl, FetchOptions } from "../types";
import type { RepositoryContent, RepoFile } from "../../types";
import { SOURCE_METADATA } from "../metadata";
import { createProgressReporter } from "../progress";
import { classifyResponseError, fetchWithRateLimitRetry } from "./_errors";

/** Bitbucket URL regex patterns */
const BITBUCKET_REPO_REGEX =
  /^https?:\/\/bitbucket\.org\/([^/]+)\/([^/]+)(?:\/src\/([^/]+)(?:\/(.+))?)?$/;

interface BitbucketDirectoryResponse {
  values?: Array<{ type: string; path: string; size?: number }>;
  next?: string;
}

interface BitbucketRepoResponse {
  mainbranch?: { name?: string };
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

    for (const item of data.values || []) {
      if (item.type === "commit_file") {
        items.push({
          path: item.path,
          type: "file",
          size: item.size,
        });
      } else if (item.type === "commit_directory") {
        // Recursively fetch subdirectory
        const subItems = await fetchDirectoryContents(workspace, repo, branch, item.path, signal);
        items.push(...subItems);
      }
    }

    nextUrl = data.next || null;
  }

  return items;
}

/**
 * Fetch files from Bitbucket repository
 */
async function fetchBitbucketFiles(
  url: string,
  options?: FetchOptions,
): Promise<RepositoryContent> {
  const { onProgress, signal } = options || {};

  try {
    const parsed = parseBitbucketUrl(url);
    if (!parsed.isValid || !parsed.owner || !parsed.repo) {
      throw new Error(parsed.error || "Invalid Bitbucket URL");
    }

    const { owner: workspace, repo, path: subPath } = parsed;
    let branch = parsed.branch || "main";

    // If no branch specified, get default branch
    if (!branch) {
      const repoResponse = await fetch(
        `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}`,
        { signal },
      );

      if (!repoResponse.ok) {
        if (repoResponse.status === 404) {
          throw new Error(`Repository '${workspace}/${repo}' not found`);
        }
        throw new Error("Failed to fetch repository information");
      }

      const repoData = (await repoResponse.json()) as BitbucketRepoResponse;
      branch = repoData.mainbranch?.name || "main";
    }

    // Fetch file tree
    const startPath = subPath || "";
    const files = await fetchDirectoryContents(workspace, repo, branch, startPath, signal);

    if (files.length === 0) {
      throw new Error("No files found in repository");
    }

    const progress = createProgressReporter({ totalFiles: files.length, onProgress });

    const filePromises = files.map(async (item) => {
      const contentUrl = `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/src/${branch}/${item.path}`;

      try {
        const response = await fetch(contentUrl, { signal });
        if (!response.ok) {
          throw new Error(`Failed to fetch ${item.path}`);
        }

        const content = await response.text();
        progress.fileComplete(item.path);

        const displayPath = getBitbucketDisplayPath(item.path, subPath);

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
        console.warn(`Failed to fetch ${item.path}:`, error);
        return null;
      }
    });

    const fetchedFiles = await Promise.all(filePromises);
    const validFiles = fetchedFiles.filter((file): file is RepoFile => file !== null);

    return { files: validFiles };
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
