import type { SourceAdapter, ParsedSourceUrl, FetchOptions } from "../types";
import type { RepositoryContent, RepoFile } from "../../types";
import { SOURCE_METADATA } from "../metadata";
import { createProgressReporter } from "../progress";

interface GitLabProjectResponse {
  default_branch?: string;
}

interface GitLabTreeItem {
  path: string;
  type: string;
  name: string;
}

/** GitLab URL regex patterns */
// Lazy `*?` on the path group lets `/-/tree/<branch>/<path>` actually match
// instead of being absorbed into the project path (the canonical GitLab URL
// always carries the `-/` segment, so a greedy quantifier swallowed both
// the marker and the branch).
const GITLAB_REPO_REGEX =
  /^https?:\/\/gitlab\.com\/([^/]+(?:\/[^/]+)*?)(?:\/-\/tree\/([^/]+)(?:\/(.+))?)?$/;
const GITLAB_SNIPPET_REGEX = /^https?:\/\/gitlab\.com\/snippets\//;

/**
 * Parse GitLab repository URL
 * GitLab supports nested groups: gitlab.com/group/subgroup/project
 */
function parseGitLabUrl(url: string): ParsedSourceUrl {
  // Handle snippet URLs
  if (GITLAB_SNIPPET_REGEX.test(url)) {
    return {
      type: "gitlab",
      isValid: false,
      error: "GitLab Snippets should use the Gist adapter",
    };
  }

  // Clean URL
  const cleanUrl = url.replace(/\.git$/, "");

  // Try to parse
  const match = cleanUrl.match(GITLAB_REPO_REGEX);

  if (!match) {
    return {
      type: "gitlab",
      isValid: false,
      error: "Invalid GitLab URL format. Expected: https://gitlab.com/owner/repo",
    };
  }

  const [, fullPath, branch, subPath] = match;

  // Split full path to get owner/repo
  // GitLab allows nested groups: group/subgroup/project
  const pathParts = fullPath.split("/");

  if (pathParts.length < 2) {
    return {
      type: "gitlab",
      isValid: false,
      error: "Invalid GitLab URL: missing project path",
    };
  }

  return {
    type: "gitlab",
    isValid: true,
    owner: pathParts.slice(0, -1).join("/"),
    repo: pathParts[pathParts.length - 1],
    branch: branch || undefined,
    path: subPath || undefined,
  };
}

/**
 * Encode GitLab project path for API
 */
export function encodeProjectPath(owner: string, repo: string): string {
  return encodeURIComponent(`${owner}/${repo}`);
}

export function getGitLabDisplayPath(itemPath: string, subPath?: string): string {
  if (subPath && itemPath.startsWith(subPath + "/")) {
    return itemPath.substring(subPath.length + 1);
  }

  return itemPath;
}

export function filterGitLabTreeItems<T extends { path: string; type: string }>(
  items: T[],
  subPath?: string,
): T[] {
  let files = items.filter((item) => item.type === "blob");

  if (subPath) {
    files = files.filter((item) => item.path.startsWith(subPath + "/") || item.path === subPath);
  }

  return files;
}

/**
 * Fetch all pages of tree (GitLab paginates at 100)
 */
async function fetchAllTreePages(
  projectId: string,
  branch: string,
  signal?: AbortSignal,
): Promise<GitLabTreeItem[]> {
  const allItems: GitLabTreeItem[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = `https://gitlab.com/api/v4/projects/${projectId}/repository/tree?ref=${branch}&recursive=true&per_page=${perPage}&page=${page}`;

    const response = await fetch(url, { signal });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("Repository or branch not found");
      }
      throw new Error(`GitLab API error: ${response.status}`);
    }

    const items = (await response.json()) as GitLabTreeItem[];
    allItems.push(...items);

    // Check if there are more pages
    const totalPages = parseInt(response.headers.get("x-total-pages") || "1", 10);
    if (page >= totalPages || items.length < perPage) {
      break;
    }
    page++;
  }

  return allItems;
}

/**
 * Fetch files from GitLab repository
 */
async function fetchGitLabFiles(url: string, options?: FetchOptions): Promise<RepositoryContent> {
  const { onProgress, signal } = options || {};

  try {
    const parsed = parseGitLabUrl(url);
    if (!parsed.isValid || !parsed.owner || !parsed.repo) {
      throw new Error(parsed.error || "Invalid GitLab URL");
    }

    const { owner, repo, path: subPath } = parsed;
    let branch = parsed.branch || "main";

    const projectId = encodeProjectPath(owner, repo);

    // If no branch specified, try to get default branch
    if (!parsed.branch) {
      try {
        const projectResponse = await fetch(`https://gitlab.com/api/v4/projects/${projectId}`, {
          signal,
        });
        if (projectResponse.ok) {
          const projectData = (await projectResponse.json()) as GitLabProjectResponse;
          branch = projectData.default_branch || "main";
        }
      } catch {
        // Fall back to "main"
      }
    }

    // Fetch file tree
    const tree = await fetchAllTreePages(projectId, branch, signal);

    // Filter to only blobs (files)
    const files = filterGitLabTreeItems(tree, subPath);

    if (subPath && files.length === 0) {
      throw new Error(`Path '${subPath}' not found in branch '${branch}'`);
    }

    const progress = createProgressReporter({ totalFiles: files.length, onProgress });

    const filePromises = files.map(async (item) => {
      const encodedPath = encodeURIComponent(item.path);
      const contentUrl = `https://gitlab.com/api/v4/projects/${projectId}/repository/files/${encodedPath}/raw?ref=${branch}`;

      try {
        const response = await fetch(contentUrl, { signal });
        if (!response.ok) {
          throw new Error(`Failed to fetch ${item.path}`);
        }

        const content = await response.text();
        progress.fileComplete(item.path);

        const displayPath = getGitLabDisplayPath(item.path, subPath);

        return {
          name: item.name,
          path: displayPath,
          type: "text/plain",
          size: content.length,
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

export const gitlabAdapter: SourceAdapter = {
  type: "gitlab",
  meta: SOURCE_METADATA.gitlab,
  matches: (url) =>
    url.includes("gitlab.com") &&
    !GITLAB_SNIPPET_REGEX.test(url) &&
    GITLAB_REPO_REGEX.test(url.replace(/\.git$/, "")),
  parseUrl: parseGitLabUrl,
  fetchFiles: fetchGitLabFiles,
};
