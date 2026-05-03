# Task 10: Source Adapter Interface Tasarimi

## Ozet

Farkli veri kaynaklari (GitHub, GitLab, Bitbucket, Gist, URL) icin ortak adapter interface'i tanimla. Bu pattern tum source'larin ayni sekilde kullanilmasini saglayacak.

## Oncelik

Orta (Faz 3 - Multi-Source)

## Bagimliliklari

- Faz 1 ve 2 tamamlanmis olmali (opsiyonel)

## Basari Kriterleri

- [ ] SourceAdapter interface tanimli
- [ ] SourceType enum tanimli
- [ ] ParsedUrl type tanimli
- [ ] Adapter registry olusturuldu
- [ ] TypeScript hata vermiyor

## Detayli Adimlar

### 1. Source Types Tanimlama

**Dosya:** `packages/core/src/sources/types.ts` (yeni)

```typescript
/**
 * Source Adapter Types
 * Unified interface for fetching files from different sources
 */

import type { DownloadProgress, RepoFile, RepositoryContent } from "../types";

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
```

### 2. Source Metadata Definitions

**Dosya:** `packages/core/src/sources/metadata.ts` (yeni)

```typescript
import type { SourceMeta, SourceType } from "./types";

/** Source metadata definitions */
export const SOURCE_METADATA: Record<SourceType, SourceMeta> = {
  github: {
    type: "github",
    name: "GitHub",
    icon: "github",
    placeholder: "https://github.com/owner/repo",
    helpText: "Public GitHub repository. Supports branches and subdirectories.",
    examples: [
      "https://github.com/facebook/react",
      "https://github.com/vercel/next.js/tree/canary/packages/next",
    ],
  },
  gitlab: {
    type: "gitlab",
    name: "GitLab",
    icon: "gitlab",
    placeholder: "https://gitlab.com/owner/repo",
    helpText: "Public GitLab repository.",
    examples: ["https://gitlab.com/gitlab-org/gitlab", "https://gitlab.com/inkscape/inkscape"],
  },
  bitbucket: {
    type: "bitbucket",
    name: "Bitbucket",
    icon: "bitbucket",
    placeholder: "https://bitbucket.org/workspace/repo",
    helpText: "Public Bitbucket repository.",
    examples: ["https://bitbucket.org/atlassian/python-bitbucket"],
  },
  gist: {
    type: "gist",
    name: "Gist",
    icon: "file-code",
    placeholder: "https://gist.github.com/user/id",
    helpText: "GitHub Gist or GitLab Snippet.",
    examples: ["https://gist.github.com/octocat/6cad326836d38bd3a7ae"],
  },
  url: {
    type: "url",
    name: "URL",
    icon: "link",
    placeholder: "https://example.com/file.txt",
    helpText: "Any publicly accessible URL. Fetches raw content.",
    examples: [
      "https://raw.githubusercontent.com/owner/repo/main/file.ts",
      "https://example.com/code.js",
    ],
  },
  local: {
    type: "local",
    name: "Local Files",
    icon: "folder",
    placeholder: "Drag & drop or browse",
    helpText: "Upload files from your computer.",
    examples: [],
  },
};

/** Get metadata for source type */
export function getSourceMeta(type: SourceType): SourceMeta {
  return SOURCE_METADATA[type];
}

/** Get all source types (excluding local) */
export function getRemoteSourceTypes(): SourceType[] {
  return ["github", "gitlab", "bitbucket", "gist", "url"];
}
```

### 3. Source Registry Implementation

**Dosya:** `packages/core/src/sources/registry.ts` (yeni)

```typescript
import type { SourceAdapter, SourceRegistry, SourceType } from "./types";

/**
 * Create a source registry from adapters
 */
export function createSourceRegistry(adapters: SourceAdapter[]): SourceRegistry {
  return {
    adapters,

    getAdapter(url: string): SourceAdapter | undefined {
      return adapters.find((adapter) => adapter.matches(url));
    },

    getByType(type: SourceType): SourceAdapter | undefined {
      return adapters.find((adapter) => adapter.type === type);
    },

    detectType(url: string): SourceType | undefined {
      const adapter = this.getAdapter(url);
      return adapter?.type;
    },
  };
}
```

### 4. Index Export

**Dosya:** `packages/core/src/sources/index.ts` (yeni)

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

// Adapters will be exported here as they're created
// export { githubAdapter } from "./adapters/github";
// export { gitlabAdapter } from "./adapters/gitlab";
// etc.
```

### 5. Core Package Export

**Dosya:** `packages/core/src/index.ts`

Ekle:

```typescript
// Sources
export * from "./sources";
```

## Test Etme

```bash
cd packages/core

# TypeScript check
pnpm check
```

## Type Kullanim Ornekleri

```typescript
import type { SourceAdapter, SourceType } from "@fileconcat/core";
import { SOURCE_METADATA, createSourceRegistry } from "@fileconcat/core";

// Get metadata for UI
const githubMeta = SOURCE_METADATA.github;
console.log(githubMeta.name); // "GitHub"

// Create registry with adapters
const registry = createSourceRegistry([
  githubAdapter,
  gitlabAdapter,
  // ...
]);

// Auto-detect source
const type = registry.detectType("https://github.com/owner/repo");
// type = "github"

// Get adapter for URL
const adapter = registry.getAdapter("https://gitlab.com/owner/repo");
// adapter.type = "gitlab"
```

## Notlar

- Interface-first design: once type'lar, sonra implementation
- SourceMeta UI icin gerekli tum bilgileri iceriyor
- Registry pattern adapter bulma isini kolaylastiriyor
- `local` type drag & drop icin, adapter yok

## Rollback

```bash
rm -rf packages/core/src/sources
# index.ts'ten export'u kaldir
```
