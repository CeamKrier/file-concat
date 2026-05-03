# Task 15: URL Adapter

## Ozet

Herhangi bir public URL'den raw text/code cekebilen adapter olustur.

## Oncelik

Orta (Faz 3 - Multi-Source)

## Bagimliliklari

- Task 10: Source Adapter Interface (tamamlanmis)

## Basari Kriterleri

- [ ] UrlAdapter SourceAdapter interface'ini implement ediyor
- [ ] Herhangi bir URL'den text cekebiliyor
- [ ] Content-Type detection var
- [ ] CORS hatasi durumunda anlamli mesaj veriyor

## Detayli Adimlar

### 1. URL Adapter Olusturma

**Dosya:** `packages/core/src/sources/adapters/url.ts` (yeni)

```typescript
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
function getFilenameFromUrl(url: string): string {
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
function getLanguageFromFilename(filename: string): string {
  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
  return EXT_TO_LANGUAGE[ext] || "text";
}

/**
 * Check if URL is likely to have CORS issues
 */
function mightHaveCorsIssues(url: string): boolean {
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
function parseUrl(url: string): ParsedSourceUrl {
  // Basic URL validation
  if (!URL_REGEX.test(url)) {
    return {
      type: "url",
      isValid: false,
      error: "Invalid URL format. Must start with http:// or https://",
    };
  }

  try {
    const urlObj = new URL(url);

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
    const parsed = parseUrl(url);
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

    // Warn about potential CORS issues
    const corsWarning = mightHaveCorsIssues(url);

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

/**
 * URL Source Adapter
 */
export const urlAdapter: SourceAdapter = {
  type: "url",
  meta: SOURCE_METADATA.url,

  matches(url: string): boolean {
    // URL adapter is a fallback - matches any http(s) URL
    // that doesn't match other adapters
    return URL_REGEX.test(url);
  },

  parseUrl(url: string): ParsedSourceUrl {
    return parseUrl(url);
  },

  fetchFiles(url: string, options?: FetchOptions): Promise<RepositoryContent> {
    return fetchUrlFiles(url, options);
  },
};
```

### 2. Adapters Index Guncelleme

**Dosya:** `packages/core/src/sources/adapters/index.ts`

```typescript
export { githubAdapter } from "./github";
export { gitlabAdapter } from "./gitlab";
export { bitbucketAdapter } from "./bitbucket";
export { gistAdapter } from "./gist";
export { urlAdapter } from "./url";
```

### 3. Sources Index Guncelleme

**Dosya:** `packages/core/src/sources/index.ts`

```typescript
// Adapters
export {
  githubAdapter,
  gitlabAdapter,
  bitbucketAdapter,
  gistAdapter,
  urlAdapter,
} from "./adapters";
```

### 4. Default Adapter Registry Olusturma

**Dosya:** `packages/core/src/sources/default-registry.ts` (yeni)

```typescript
import { createSourceRegistry } from "./registry";
import { githubAdapter } from "./adapters/github";
import { gitlabAdapter } from "./adapters/gitlab";
import { bitbucketAdapter } from "./adapters/bitbucket";
import { gistAdapter } from "./adapters/gist";
import { urlAdapter } from "./adapters/url";

/**
 * Default source registry with all built-in adapters
 * Order matters: more specific adapters first, URL adapter last (fallback)
 */
export const defaultSourceRegistry = createSourceRegistry([
  githubAdapter,
  gitlabAdapter,
  bitbucketAdapter,
  gistAdapter,
  urlAdapter, // Fallback - matches any URL
]);
```

### 5. Sources Index'e Registry Export Ekleme

**Dosya:** `packages/core/src/sources/index.ts`

```typescript
// Default registry
export { defaultSourceRegistry } from "./default-registry";
```

## CORS Notlari

### CORS-Friendly Hosts

Bu hostlar genellikle CORS izni veriyor:

- raw.githubusercontent.com
- gist.githubusercontent.com
- cdn.jsdelivr.net
- unpkg.com
- cdnjs.cloudflare.com

### CORS Sorunlari

Cogu website CORS izni vermiyor. Bu durumda:

1. Kullaniciya anlamli hata mesaji goster
2. Raw content URL kullanmasini oner

### Server-Side Proxy (Gelecek Task)

CORS sorunlarini tamamen cozmek icin server-side proxy eklenebilir:

```typescript
// /api/proxy?url=https://example.com/file.txt
// Server tarafinda fetch yapip client'a dondur
```

## Test Etme

```bash
cd packages/core
pnpm check

# Web app'te test
cd apps/web
pnpm dev

# Test URLs:
# https://raw.githubusercontent.com/vercel/swr/main/package.json
# https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js
# https://unpkg.com/vue@3/dist/vue.global.js
```

## Notlar

- URL adapter fallback olarak en son kontrol edilmeli
- CORS en buyuk sorun, kullaniciya bilgilendirme onemli
- Filename URL'den cikarilmaya calisiliyor
- Language detection file extension'a dayali

## Rollback

```bash
rm packages/core/src/sources/adapters/url.ts
rm packages/core/src/sources/default-registry.ts
# adapters/index.ts ve sources/index.ts'ten export'lari kaldir
```
