# Task 11: GitHub Adapter Refactor

## Ozet

Mevcut `fetchGithubRepository` fonksiyonunu yeni SourceAdapter interface'ine uygun sekilde refactor et.

## Oncelik

Orta (Faz 3 - Multi-Source)

## Bagimliliklari

- Task 10: Source Adapter Interface (tamamlanmis)

## Basari Kriterleri

- [ ] GitHubAdapter SourceAdapter interface'ini implement ediyor
- [ ] Mevcut fonksiyonellik korunuyor
- [ ] URL parsing ayri fonksiyon
- [ ] Branch ve subdirectory destegi calisiyor
- [ ] Progress callback calisiyor

## Detayli Adimlar

### 1. GitHub Adapter Olusturma

**Dosya:** `packages/core/src/sources/adapters/github.ts` (yeni)

```typescript
import type { SourceAdapter, ParsedSourceUrl, FetchOptions } from "../types";
import type { RepositoryContent, RepoFile, DownloadProgress } from "../../types";
import { SOURCE_METADATA } from "../metadata";

/** GitHub URL regex patterns */
const GITHUB_REPO_REGEX =
  /^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+)(?:\/(.+))?)?$/;
const GITHUB_RAW_REGEX = /^https?:\/\/raw\.githubusercontent\.com\//;

/**
 * Parse GitHub repository URL
 */
function parseGitHubUrl(url: string): ParsedSourceUrl {
  const match = url.match(GITHUB_REPO_REGEX);

  if (!match) {
    // Check if it's a raw URL
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

  const [, owner, repo, branch, path] = match;

  return {
    type: "github",
    isValid: true,
    owner,
    repo: repo.replace(/\.git$/, ""),
    branch: branch || undefined,
    path: path || undefined,
  };
}

/**
 * Fetch files from GitHub repository
 */
async function fetchGitHubFiles(url: string, options?: FetchOptions): Promise<RepositoryContent> {
  const { onProgress, signal } = options || {};

  try {
    const parsed = parseGitHubUrl(url);
    if (!parsed.isValid || !parsed.owner || !parsed.repo) {
      throw new Error(parsed.error || "Invalid GitHub URL");
    }

    const { owner, repo, path: subPath } = parsed;
    let { branch } = parsed;

    // Get default branch if not specified
    if (!branch) {
      const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { signal });
      if (!repoResponse.ok) {
        if (repoResponse.status === 404) {
          throw new Error(`Repository '${owner}/${repo}' not found`);
        }
        throw new Error("Failed to fetch repository information");
      }
      const repoData = await repoResponse.json();
      branch = repoData.default_branch;
    }

    // Get file tree
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    const treeResponse = await fetch(treeUrl, { signal });

    if (!treeResponse.ok) {
      if (treeResponse.status === 404) {
        throw new Error(`Branch '${branch}' not found in repository`);
      }
      throw new Error("Failed to fetch repository contents");
    }

    const treeData = await treeResponse.json();

    // Filter files
    const files = treeData.tree.filter((item: { type: string; path: string }) => {
      if (item.type !== "blob") return false;
      if (subPath) {
        return item.path.startsWith(subPath + "/") || item.path === subPath;
      }
      return true;
    });

    if (subPath && files.length === 0) {
      throw new Error(`Path '${subPath}' not found in branch '${branch}'`);
    }

    // Setup progress tracking
    const totalBytes = files.reduce(
      (acc: number, file: { size: number }) => acc + (file.size || 0),
      0,
    );
    let downloadedBytes = 0;
    let completedFiles = 0;
    let lastUpdate = Date.now();
    let lastBytes = 0;
    let currentSpeed = 0;

    const updateProgress = (addedBytes: number, currentFile: string) => {
      downloadedBytes += addedBytes;
      const now = Date.now();

      if (now - lastUpdate > 500) {
        const timeDiff = (now - lastUpdate) / 1000;
        const bytesDiff = downloadedBytes - lastBytes;
        currentSpeed = bytesDiff / timeDiff;
        lastUpdate = now;
        lastBytes = downloadedBytes;
      }

      onProgress?.({
        currentFile,
        totalFiles: files.length,
        completedFiles,
        downloadedBytes,
        totalBytes,
        speed: currentSpeed,
      });
    };

    // Fetch file contents
    const filePromises = files.map(async (item: { path: string; size: number }) => {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}`;

      try {
        const response = await fetch(rawUrl, { signal });
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
          updateProgress(value.length, item.path);
        }

        completedFiles++;

        // Combine chunks
        const allChunks = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
        let position = 0;
        for (const chunk of chunks) {
          allChunks.set(chunk, position);
          position += chunk.length;
        }

        const content = new TextDecoder().decode(allChunks);

        // Adjust path if subdirectory
        const displayPath =
          subPath && item.path.startsWith(subPath + "/")
            ? item.path.substring(subPath.length + 1)
            : subPath && item.path === subPath
              ? item.path.split("/").pop() || item.path
              : item.path;

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
 * GitHub Source Adapter
 */
export const githubAdapter: SourceAdapter = {
  type: "github",
  meta: SOURCE_METADATA.github,

  matches(url: string): boolean {
    return GITHUB_REPO_REGEX.test(url) && !url.includes("gist.github.com");
  },

  parseUrl(url: string): ParsedSourceUrl {
    return parseGitHubUrl(url);
  },

  fetchFiles(url: string, options?: FetchOptions): Promise<RepositoryContent> {
    return fetchGitHubFiles(url, options);
  },
};
```

### 2. Adapters Index Olusturma

**Dosya:** `packages/core/src/sources/adapters/index.ts` (yeni)

```typescript
export { githubAdapter } from "./github";
// Future adapters:
// export { gitlabAdapter } from "./gitlab";
// export { bitbucketAdapter } from "./bitbucket";
// export { gistAdapter } from "./gist";
// export { urlAdapter } from "./url";
```

### 3. Sources Index Guncelleme

**Dosya:** `packages/core/src/sources/index.ts`

```typescript
// Types
export type {
  SourceType,
  SourceMeta,
  ParsedSourceUrl,
  FetchOptions,
  SourceAdapter,
  SourceRegistry,
} from "./types";

// Metadata
export { SOURCE_METADATA, getSourceMeta, getRemoteSourceTypes } from "./metadata";

// Registry
export { createSourceRegistry } from "./registry";

// Adapters
export { githubAdapter } from "./adapters";
```

### 4. Web App Entegrasyonu (Opsiyonel)

Mevcut `utils.ts`'teki `fetchGithubRepository` fonksiyonu adapter'i kullanacak sekilde guncellenebilir:

**Dosya:** `apps/web/src/utils.ts`

```typescript
import { githubAdapter } from "@fileconcat/core";
import type { DownloadProgress, RepositoryContent } from "@fileconcat/core";

export const fetchGithubRepository = async (
  url: string,
  onProgress?: (progress: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<RepositoryContent> => {
  return githubAdapter.fetchFiles(url, { onProgress, signal });
};

// fetchRepositoryFiles fonksiyonu kalacak, adapter registry ile degistirilecek
```

## Test Etme

```bash
cd packages/core
pnpm check

# Web app'te test
cd apps/web
pnpm dev

# GitHub import test:
# https://github.com/vercel/swr
# https://github.com/tanstack/router/tree/main/packages/react-router
```

## Notlar

- Mevcut fonksiyonellik 1:1 korunuyor
- file-type detection web app'te kaliyor (WASM dependency)
- Progress callback ayni API
- Abort signal destegi korunuyor

## Rollback

```bash
rm -rf packages/core/src/sources/adapters
# sources/index.ts'ten adapter export'u kaldir
```
