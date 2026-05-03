# Task 12: GitLab Adapter

## Ozet

GitLab public repository'lerden dosya cekebilen adapter olustur. Mevcut `fetchGitlabRepository` fonksiyonunu adapter pattern'e donustur.

## Oncelik

Orta (Faz 3 - Multi-Source)

## Bagimliliklari

- Task 10: Source Adapter Interface (tamamlanmis)
- Task 11: GitHub Adapter (referans)

## Basari Kriterleri

- [ ] GitLabAdapter SourceAdapter interface'ini implement ediyor
- [ ] Public repo'lardan dosya cekebiliyor
- [ ] Branch ve subdirectory destegi var
- [ ] Progress callback calisiyor
- [ ] Pagination (100+ dosya) handle ediliyor

## Detayli Adimlar

### 1. GitLab Adapter Olusturma

**Dosya:** `packages/core/src/sources/adapters/gitlab.ts` (yeni)

```typescript
import type { SourceAdapter, ParsedSourceUrl, FetchOptions } from "../types";
import type { RepositoryContent, RepoFile, DownloadProgress } from "../../types";
import { SOURCE_METADATA } from "../metadata";

/** GitLab URL regex patterns */
const GITLAB_REPO_REGEX =
  /^https?:\/\/gitlab\.com\/([^/]+(?:\/[^/]+)*)(?:\/-)?(?:\/tree\/([^/]+)(?:\/(.+))?)?(?:\.git)?$/;
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
  let cleanUrl = url.replace(/\.git$/, "");

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
function encodeProjectPath(owner: string, repo: string): string {
  return encodeURIComponent(`${owner}/${repo}`);
}

/**
 * Fetch all pages of tree (GitLab paginates at 100)
 */
async function fetchAllTreePages(
  projectId: string,
  branch: string,
  signal?: AbortSignal,
): Promise<Array<{ path: string; type: string; name: string }>> {
  const allItems: Array<{ path: string; type: string; name: string }> = [];
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

    const items = await response.json();
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
          const projectData = await projectResponse.json();
          branch = projectData.default_branch || "main";
        }
      } catch {
        // Fall back to "main"
      }
    }

    // Fetch file tree
    const tree = await fetchAllTreePages(projectId, branch, signal);

    // Filter to only blobs (files)
    let files = tree.filter((item) => item.type === "blob");

    // Filter by subdirectory if specified
    if (subPath) {
      files = files.filter((item) => item.path.startsWith(subPath + "/") || item.path === subPath);

      if (files.length === 0) {
        throw new Error(`Path '${subPath}' not found in branch '${branch}'`);
      }
    }

    // Setup progress tracking
    let completedFiles = 0;
    const totalFiles = files.length;

    const updateProgress = (currentFile: string) => {
      onProgress?.({
        currentFile,
        totalFiles,
        completedFiles,
        downloadedBytes: completedFiles,
        totalBytes: totalFiles,
        speed: 0,
      });
    };

    // Fetch file contents
    const filePromises = files.map(async (item) => {
      const encodedPath = encodeURIComponent(item.path);
      const contentUrl = `https://gitlab.com/api/v4/projects/${projectId}/repository/files/${encodedPath}/raw?ref=${branch}`;

      try {
        updateProgress(item.path);

        const response = await fetch(contentUrl, { signal });
        if (!response.ok) {
          throw new Error(`Failed to fetch ${item.path}`);
        }

        const content = await response.text();
        completedFiles++;

        // Adjust path if subdirectory
        const displayPath =
          subPath && item.path.startsWith(subPath + "/")
            ? item.path.substring(subPath.length + 1)
            : item.path;

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

/**
 * GitLab Source Adapter
 */
export const gitlabAdapter: SourceAdapter = {
  type: "gitlab",
  meta: SOURCE_METADATA.gitlab,

  matches(url: string): boolean {
    return (
      url.includes("gitlab.com") &&
      !GITLAB_SNIPPET_REGEX.test(url) &&
      GITLAB_REPO_REGEX.test(url.replace(/\.git$/, ""))
    );
  },

  parseUrl(url: string): ParsedSourceUrl {
    return parseGitLabUrl(url);
  },

  fetchFiles(url: string, options?: FetchOptions): Promise<RepositoryContent> {
    return fetchGitLabFiles(url, options);
  },
};
```

### 2. Adapters Index Guncelleme

**Dosya:** `packages/core/src/sources/adapters/index.ts`

```typescript
export { githubAdapter } from "./github";
export { gitlabAdapter } from "./gitlab";
// Future adapters:
// export { bitbucketAdapter } from "./bitbucket";
// export { gistAdapter } from "./gist";
// export { urlAdapter } from "./url";
```

### 3. Sources Index Guncelleme

**Dosya:** `packages/core/src/sources/index.ts`

```typescript
// Adapters
export { githubAdapter, gitlabAdapter } from "./adapters";
```

## GitLab API Notlari

### Rate Limits

- Unauthenticated: 60 requests/hour/IP
- Bu cok dusuk, buyuk repo'lar icin sorun olabilir

### URL Formats

```
# Basic
https://gitlab.com/owner/repo

# Nested groups (GitLab-specific)
https://gitlab.com/group/subgroup/project

# With branch
https://gitlab.com/owner/repo/-/tree/main

# With subdirectory
https://gitlab.com/owner/repo/-/tree/main/src
```

### API Endpoints

```
# Project info
GET /api/v4/projects/:id

# File tree (paginated, max 100)
GET /api/v4/projects/:id/repository/tree?ref=:branch&recursive=true

# File content
GET /api/v4/projects/:id/repository/files/:path/raw?ref=:branch
```

## Test Etme

```bash
cd packages/core
pnpm check

# Web app'te test
cd apps/web
pnpm dev

# GitLab import test:
# https://gitlab.com/inkscape/inkscape
# https://gitlab.com/gitlab-org/gitlab-runner
```

## Notlar

- GitLab nested groups destekliyor (group/subgroup/project)
- Pagination gerekli (100 dosya limiti)
- Default branch API'den alinabiliyor
- Rate limit dusuk, dikkatli kullanim gerekli

## Rollback

```bash
rm packages/core/src/sources/adapters/gitlab.ts
# adapters/index.ts ve sources/index.ts'ten export'u kaldir
```
