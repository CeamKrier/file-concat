import type { SourceAdapter, ParsedSourceUrl, FetchOptions } from "../types";
import type { RepositoryContent, RepoFile } from "../../types";
import { SOURCE_METADATA } from "../metadata";

/** GitHub Gist URL patterns */
const GITHUB_GIST_REGEX = /^https?:\/\/gist\.github\.com\/([^/]+)\/([a-f0-9]+)/;

/** GitLab Snippet URL patterns */
const GITLAB_SNIPPET_REGEX = /^https?:\/\/gitlab\.com\/(?:-\/)?snippets\/(\d+)/;
const GITLAB_USER_SNIPPET_REGEX = /^https?:\/\/gitlab\.com\/([^/]+)\/(?:-\/)?snippets\/(\d+)/;

/**
 * Parse Gist/Snippet URL
 */
export function parseGistUrl(url: string): ParsedSourceUrl {
  // Try GitHub Gist
  const githubMatch = url.match(GITHUB_GIST_REGEX);
  if (githubMatch) {
    const [, owner, gistId] = githubMatch;
    return {
      type: "gist",
      isValid: true,
      owner,
      gistId,
    };
  }

  // Try GitLab global snippet
  const gitlabMatch = url.match(GITLAB_SNIPPET_REGEX);
  if (gitlabMatch) {
    const [, snippetId] = gitlabMatch;
    return {
      type: "gist",
      isValid: true,
      gistId: `gitlab:${snippetId}`,
    };
  }

  // Try GitLab user snippet
  const gitlabUserMatch = url.match(GITLAB_USER_SNIPPET_REGEX);
  if (gitlabUserMatch) {
    const [, owner, snippetId] = gitlabUserMatch;
    return {
      type: "gist",
      isValid: true,
      owner,
      gistId: `gitlab:${snippetId}`,
    };
  }

  return {
    type: "gist",
    isValid: false,
    error: "Invalid Gist URL. Supported: GitHub Gist, GitLab Snippet",
  };
}

/**
 * Fetch GitHub Gist
 */
async function fetchGitHubGist(gistId: string, signal?: AbortSignal): Promise<RepositoryContent> {
  const response = await fetch(`https://api.github.com/gists/${gistId}`, {
    signal,
    headers: {
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Gist not found");
    }
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const gist = await response.json();
  const files: RepoFile[] = [];

  for (const [filename, fileData] of Object.entries(gist.files || {})) {
    const file = fileData as {
      filename: string;
      content: string;
      size: number;
      language: string | null;
      raw_url: string;
    };

    // If content is truncated, fetch from raw_url
    let content = file.content;
    if (file.size > 10_000_000 || !content) {
      const rawResponse = await fetch(file.raw_url, { signal });
      if (rawResponse.ok) {
        content = await rawResponse.text();
      }
    }

    files.push({
      name: filename,
      path: filename,
      type: file.language ? `text/${file.language.toLowerCase()}` : "text/plain",
      size: file.size,
      content: content || "",
    });
  }

  return { files };
}

/**
 * Fetch GitLab Snippet
 */
async function fetchGitLabSnippet(
  snippetId: string,
  signal?: AbortSignal,
): Promise<RepositoryContent> {
  // Get snippet metadata
  const response = await fetch(`https://gitlab.com/api/v4/snippets/${snippetId}`, { signal });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Snippet not found");
    }
    throw new Error(`GitLab API error: ${response.status}`);
  }

  const snippet = await response.json();
  const files: RepoFile[] = [];

  // GitLab snippets can have multiple files
  if (snippet.files && Array.isArray(snippet.files)) {
    for (const file of snippet.files) {
      // Fetch raw content
      const rawResponse = await fetch(
        `https://gitlab.com/api/v4/snippets/${snippetId}/files/main/${encodeURIComponent(file.path)}/raw`,
        { signal },
      );

      if (rawResponse.ok) {
        const content = await rawResponse.text();
        files.push({
          name: file.path,
          path: file.path,
          type: "text/plain",
          size: content.length,
          content,
        });
      }
    }
  } else if (snippet.content) {
    // Old-style single-file snippet
    files.push({
      name: snippet.file_name || "snippet.txt",
      path: snippet.file_name || "snippet.txt",
      type: "text/plain",
      size: snippet.content.length,
      content: snippet.content,
    });
  }

  return { files };
}

/**
 * Fetch files from Gist/Snippet
 */
async function fetchGistFiles(url: string, options?: FetchOptions): Promise<RepositoryContent> {
  const { onProgress, signal } = options || {};

  try {
    const parsed = parseGistUrl(url);
    if (!parsed.isValid || !parsed.gistId) {
      throw new Error(parsed.error || "Invalid Gist URL");
    }

    // Show indeterminate progress
    onProgress?.({
      currentFile: "Fetching gist...",
      totalFiles: 0,
      completedFiles: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      speed: 0,
    });

    // Check if GitLab snippet
    if (parsed.gistId.startsWith("gitlab:")) {
      const snippetId = parsed.gistId.replace("gitlab:", "");
      return fetchGitLabSnippet(snippetId, signal);
    }

    // GitHub Gist
    return fetchGitHubGist(parsed.gistId, signal);
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || error.message === "Aborted")) {
      throw new Error("AbortError");
    }
    return {
      files: [],
      error: error instanceof Error ? error.message : "Failed to fetch gist",
    };
  }
}

/**
 * Gist/Snippet Source Adapter
 */
export const gistAdapter: SourceAdapter = {
  type: "gist",
  meta: SOURCE_METADATA.gist,

  matches(url: string): boolean {
    return (
      GITHUB_GIST_REGEX.test(url) ||
      GITLAB_SNIPPET_REGEX.test(url) ||
      GITLAB_USER_SNIPPET_REGEX.test(url)
    );
  },

  parseUrl(url: string): ParsedSourceUrl {
    return parseGistUrl(url);
  },

  fetchFiles(url: string, options?: FetchOptions): Promise<RepositoryContent> {
    return fetchGistFiles(url, options);
  },
};
