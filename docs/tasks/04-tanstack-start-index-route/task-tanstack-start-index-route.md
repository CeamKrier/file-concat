# Task 04: TanStack Start Index Route (Ana Sayfa)

## Ozet

Mevcut `app.tsx` icerigini TanStack Start index route'a tasi. Bu ana uygulama sayfasi olacak.

## Oncelik

Yuksek (Faz 1 - Migration)

## Bagimliliklari

- Task 03: Root Route (tamamlanmis)

## Basari Kriterleri

- [ ] `src/routes/index.tsx` olusturuldu
- [ ] Mevcut App component'i calisiyor
- [ ] Tum state management calisiyor
- [ ] Drag & drop calisiyor
- [ ] GitHub import calisiyor
- [ ] Token estimation calisiyor

## Detayli Adimlar

### 1. Index Route Olusturma

**Dosya:** `apps/web/src/routes/index.tsx` (yeni)

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { FileConcat } from "~/components/file-concat";

export const Route = createFileRoute("/")({
  // SSR enabled for SEO
  component: IndexPage,
  head: () => ({
    meta: [
      {
        title: "FileConcat - Combine Files for AI Assistants | ChatGPT, Claude, Gemini",
      },
      {
        name: "description",
        content:
          "Free, offline tool to combine multiple files and folders into a single document optimized for Large Language Models. Import from GitHub, GitLab, or drag & drop. 100% privacy - files never leave your browser.",
      },
      // Keywords (hala bazi SEO degeri var)
      {
        name: "keywords",
        content:
          "file concat, combine files, LLM, ChatGPT, Claude, Gemini, AI assistant, code sharing, GitHub import, token counter",
      },
    ],
  }),
});

function IndexPage() {
  return <FileConcat />;
}
```

### 2. App Component'i FileConcat Olarak Yeniden Adlandir

Mevcut `apps/web/src/app.tsx` dosyasini `apps/web/src/components/file-concat.tsx` olarak tasi ve export'u guncelle.

**Dosya:** `apps/web/src/components/file-concat.tsx`

Degisiklikler:

1. `App` -> `FileConcat` olarak rename
2. Default export yerine named export
3. Import path'leri `~` alias kullanacak sekilde guncelle

```tsx
// Dosyanin basi
import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { minimatch } from "minimatch";
import { Upload, Download, Shield, Trash2, Copy, Check } from "lucide-react";
import { SiGithub, SiX } from "@icons-pack/react-simple-icons";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Alert, AlertDescription } from "~/components/ui/alert";
import RepositoryInput, { RepositoryInputRef } from "~/components/repository-input";
import { ThemeToggle } from "~/components/theme-toggle";
import OutputSettings from "~/components/output-settings";
import TokenInfoPopover from "~/components/token-info-popover";
import PreviewModal from "~/components/preview-modal";
import FileTree from "~/components/file-tree";
import FileViewerModal from "~/components/file-viewer-modal";
import AboutSection from "~/components/about-section";
import ConfigPanel from "~/components/config-panel";
import { useConfig } from "~/hooks/use-config";

import {
  DownloadProgress,
  FileEntry,
  FileStatus,
  OutputFormat,
  ProcessingConfig,
} from "@fileconcat/core";
import {
  validateFile,
  formatSize,
  estimateTokenCount,
  fetchRepositoryFiles,
  calculateTotalSize,
  generateFileTree,
  getLanguageFromPath,
  generateProjectName,
} from "~/utils";
import { processFileContent } from "@fileconcat/core";
import { LLM_CONTEXT_LIMITS, MULTI_OUTPUT_LIMIT, DEFAULT_CONFIG } from "@fileconcat/core";

import BMCLogo from "~/components/bmc-logo";

// Component'i export et
export function FileConcat() {
  // ... mevcut tum kod ayni kalacak
  // Sadece function adi ve export degisecek
}

// Eski default export kaldirilacak
// export default App; -> silinecek
```

### 3. Import Path Guncellemeleri

Tum component'lerde `@/` -> `~/` degisikligi:

```tsx
// Eski
import { Button } from "@/components/ui/button";

// Yeni
import { Button } from "~/components/ui/button";
```

Etkilenen dosyalar:

- `components/file-concat.tsx` (yeni)
- `components/config-panel.tsx`
- `components/file-tree.tsx`
- `components/repository-input.tsx`
- `components/file-viewer-modal.tsx`
- `components/token-info-popover.tsx`
- `components/output-settings.tsx`
- `components/preview-modal.tsx`
- `hooks/use-config.ts`

### 4. Eski Dosyalari Temizle

```bash
# Eski entry point
rm apps/web/src/main.tsx

# Eski app (tasindiktan sonra)
rm apps/web/src/app.tsx
```

### 5. Utils Import Path Guncelleme

**Dosya:** `apps/web/src/utils.ts`

Export'lar ayni kalacak, sadece internal import'lar guncellenecek (varsa).

## Mevcut Dosya Yapisi (Referans)

```
apps/web/src/
├── app.tsx              # -> components/file-concat.tsx olacak
├── main.tsx             # -> silinecek (entry-client.tsx ile degistirildi)
├── index.css            # -> styles/app.css olarak tasindi
├── utils.ts             # kalacak
├── components/
│   ├── ui/              # kalacak
│   ├── config-panel.tsx
│   ├── file-tree.tsx
│   └── ...
├── hooks/
│   └── use-config.ts
└── lib/
    └── utils.ts
```

## Test Etme

```bash
cd apps/web

# Route tree regenerate
pnpm tanstack-router generate

# Dev server
pnpm dev

# Test checklist:
# [ ] Sayfa yukleniyor
# [ ] Drag & drop calisiyor
# [ ] File picker calisiyor
# [ ] GitHub import calisiyor
# [ ] Token estimation calisiyor
# [ ] Config panel calisiyor
# [ ] Theme toggle calisiyor
# [ ] File tree calisiyor
# [ ] Copy to clipboard calisiyor
# [ ] Download calisiyor
```

## Notlar

- State management degismiyor, sadece file organization
- `@` alias hala calisacak ama `~` TanStack convention
- Mevcut localStorage data korunacak (use-config.ts)

## Muhtemel Hatalar

1. **Import resolution**: Alias dogru configure edilmis mi kontrol et
2. **Circular imports**: FileConcat -> utils -> FileConcat kontrolu
3. **Missing exports**: Named export kullanildigini kontrol et

## Rollback

```bash
git checkout apps/web/src/
```
