# app.tsx Architecture Refactor — zustand-backed slices, decomposed render tree

**Status**: Approved (design only; implementation deferred to future session)
**Date**: 2026-05-18
**Owner**: ceamkrier

## Context

`apps/web/src/app.tsx` is a 1213-line monolith holding all client state, all
upload/edit/output orchestration, and the entire render tree. Reasoning about
it is painful — a recent regression (stale `localStorage`
`includePatterns: "src/**/*"` silently whitelisted nothing, producing a
"fresh page" UX dead-end) was hard to trace because the data flow spans 8+
`useCallback`s and 4 `useEffect`s across one file. The bug was diagnosed and
patched (`filterDropNotice` alert at `app.tsx:1058`), but the underlying
architecture is what made the diagnosis cost a full session.

The web app has no component- or hook-level test surface beyond the
integration test added alongside that fix (`apps/web/tests/file-upload-flow.test.tsx`).
A clean refactor unlocks per-slice and per-component testing, which is the
"long-term stability mechanism" the user wants.

## Goals

1. `apps/web/src/app.tsx` shrinks to a thin shell (~30 lines).
2. Logical concerns isolated into composable units with explicit boundaries.
3. Fine-grained re-rendering: a keystroke during inline editing must not
   re-render `FileTree`, `OutputPanel`, or `TokenSection`.
4. Each unit has a clear seam for unit testing — pure modules in `lib/`,
   slice actions via store API, components via RTL.
5. Behaviour is byte-identical to the current app at every phase boundary.

## Non-goals

- Fixing the `isExcludedPath` slashed-pattern matching bug (slated separately,
  recorded in `.claude/napkin.md`).
- Migrating stale `localStorage` configs that contain demonstrably broken
  patterns. The `filterDropNotice` alert is the chosen UX recovery.
- Touching the existing UI primitives (`file-tree`, `file-viewer-modal`,
  `config-panel`, `source-input`, `output-settings`, `token-section`,
  `preview-modal`). Only their parents change.
- Adding e2e / Playwright. jsdom + RTL is the chosen test layer.

## High-level architecture

```
apps/web/src/
├── app.tsx                          # ~30 lines: <AppShell/>
├── components/
│   ├── app-shell.tsx                # NEW — top-level layout, header slot, panels
│   ├── app-header.tsx               # NEW — extracted CardHeader block
│   ├── upload-zone.tsx              # NEW — dropzone + browse buttons + SourceInput
│   ├── filter-drop-alert.tsx        # NEW — alert added in 2026-05-17 session
│   ├── failed-files-alert.tsx       # NEW — extracted failedFiles render
│   ├── reset-button.tsx             # NEW — "Start Over"
│   ├── files-panel.tsx              # NEW — FileTree + FileViewerModal integration
│   ├── output-panel.tsx             # NEW — OutputSettings + TokenSection + PreviewModal
│   └── (existing UI primitives kept in place)
├── store/
│   ├── index.ts                     # `useFileConcatStore` = zustand `create()(...slices)`
│   ├── types.ts                     # slice interface types
│   ├── upload-slice.ts
│   ├── editing-slice.ts
│   ├── tokens-slice.ts
│   ├── output-slice.ts
│   └── config-slice.ts              # wraps current `use-config.ts`
├── hooks/
│   ├── use-config.ts                # existing — eventually folded into config-slice
│   └── use-media-query.ts           # NEW — generic, replaces inline matchMedia effect
└── lib/
    ├── path-filters.ts              # NEW — pure: isExcludedPath, isIgnoredDirectory
    ├── chunk-calculator.ts          # NEW — pure: calculateChunks
    └── output-formatter.ts          # NEW — pure: formatOutputs, buildConcatBlob
```

## Store: zustand with slice composition

Rationale: vanilla React context re-renders every consumer on any state change.
For a tool with keystroke-frequent state (`editorDraftByPath`), that's a
real perf and clarity drag — components like `FileTree` would re-render on
every character typed. zustand's selector API (`useStore(s => s.x)`) gives
per-selector subscriptions with ~1.2KB bundle cost and a familiar mental
model that maps cleanly to slices.

### Slice composition

```ts
// store/index.ts
import { create } from "zustand";
import { createUploadSlice } from "./upload-slice";
// ... others
import type { FileConcatState } from "./types";

export const useFileConcatStore = create<FileConcatState>()((...args) => ({
  ...createConfigSlice(...args),
  ...createUploadSlice(...args),
  ...createEditingSlice(...args),
  ...createTokensSlice(...args),
  ...createOutputSlice(...args),
}));
```

### Slice contracts

| Slice | State | Actions | Cross-slice deps |
|---|---|---|---|
| **config** | `userConfig` (mirrors `useConfig()` shape) | `setConfig`, `resetConfig`, `exportConfig`, `importConfig`, `isLoaded` | none |
| **upload** | `files`, `fileStatuses`, `rawContents`, `processedContents` (computed via `get()`), `failedFiles`, `filterDropNotice`, `isProcessing`, `processingStatus`, `isRepoLoading` | `handleFilesBatch`, `handleFileInputChange`, `handleDrop`, `handleRepositorySubmit`, `toggleFileInclusion(i)`, `toggleMultipleFiles(indices, include)`, `commitFileEdit(path, content)`, `reset`, `dismissFilterNotice` | reads `userConfig` from config slice via `get()` for `lib/path-filters` |
| **editing** | `activeFilePath`, `editingPath`, `editorDirtyByPath`, `editorDraftByPath`, `isEditorEnabled` | `openFile(path)`, `closeFile()`, `startEdit(path)`, `cancelEdit(path)`, `changeEdit(path, value)`, `saveEdit(path)` | `saveEdit` calls `get().commitFileEdit(path, draft)` on upload slice |
| **tokens** | `tokens`, `recommendedFormat` (derived from `tokens`) | `estimate(text)` (manual), internal subscription updates on `processedContents`/`fileStatuses` changes | reads `processedContents`, `fileStatuses` via subscription |
| **output** | `output`, `selectedFormat`, `isCopied`, `isPreviewOpen` | `generate()`, `preview()`, `copy()`, `setFormat(f)`, `getEstimations()`, `openPreview()`, `closePreview()` | reads `processedContents`, `fileStatuses`, `userConfig.maxFileSizeMB` via `get()` |

#### Decisions baked in

- **`activeFilePath` lives in the editing slice** (rather than a separate
  viewer slice). The open → view → edit → save flow is one path; splitting
  is YAGNI.
- **`maxFileSizeMB` unified onto `userConfig.maxFileSizeMB`**. The current
  app has a duplicated `maxFileSize` `useState` (`app.tsx:58`) that diverges
  from `userConfig.maxFileSizeMB` (used by `validateFile`). The duplicate is
  removed; `resetAll`'s `setMaxFileSize(32)` becomes a no-op and is deleted.
- **`isEditorEnabled` stays as a constant `true`** for now (feature flag
  scaffold preserved without UI). Will be wired to settings later.

## Pure lib modules

```ts
// lib/path-filters.ts
export function isExcludedPath(
  path: string,
  config: Pick<UserConfig, "includePatterns" | "ignorePatterns">,
): boolean;

export function isIgnoredDirectory(
  path: string,
  config: Pick<UserConfig, "includePatterns" | "ignorePatterns">,
): boolean;
```

Migrated verbatim from `app.tsx:159-252`. The pre-existing
`[isIgnoredDirectory] …` console.log noise (`app.tsx:161-189`) is dropped
during extraction (it was diagnostic spam, not production logging).

```ts
// lib/chunk-calculator.ts
export function calculateChunks(
  contents: Array<{ path: string; content: string }>,
  maxFileSizeMB: number,
): Array<Array<{ path: string; content: string }>>;
```

Migrated from `app.tsx:458-503`.

```ts
// lib/output-formatter.ts
export function buildConcatBlob(
  contents: Array<{ path: string; content: string }>,
): string;

export function formatOutputs(
  contents: Array<{ path: string; content: string }>,
  options: { format: "single" | "multi"; maxFileSizeMB: number },
): Array<{ name: string; content: string }>;
```

`buildConcatBlob` extracts the preamble + XML body construction in
`generateOutput` (`app.tsx:505-660`); `formatOutputs` covers the
`generatePreview` paths (`app.tsx:829-856`).

## Component decomposition

| Component | Role | Reads from store |
|---|---|---|
| `AppShell` | Top-level page layout, mounts children | nothing (passes through) |
| `AppHeader` | Logo, title, offline badge, links, theme toggle | nothing |
| `UploadZone` | Dropzone, drag visuals, browse-files/folder, SourceInput | `upload.handleDrop`, `upload.handleFileInputChange`, `upload.handleRepositorySubmit`, `upload.isProcessing`, `upload.isRepoLoading`, `upload.processingStatus` |
| `FilterDropAlert` | Alert when filter excludes everything | `upload.filterDropNotice`, `upload.dismissFilterNotice`, `config.userConfig`, `config.resetConfig` |
| `FailedFilesAlert` | Failed-files summary list | `upload.failedFiles` |
| `ResetButton` | "Start Over" button (visible when files loaded) | `upload.files.length`, `output.output`, `upload.reset` |
| `FilesPanel` | FileTree + FileViewerModal integration | `upload.fileStatuses`, `upload.files`, `editing.activeFilePath`, `editing.{open,close}File`, `editing.{start,cancel,save,change}Edit`, `editing.editorDraftByPath`, `editing.editorDirtyByPath`, `upload.toggleFileInclusion`, `upload.toggleMultipleFiles`, `upload.isProcessing` |
| `OutputPanel` | OutputSettings + TokenSection + PreviewModal + copy | `output.*`, `tokens.tokens`, `tokens.recommendedFormat`, `upload.fileStatuses` (for the included count) |

UI primitives (`FileTree`, `FileViewerModal`, `SourceInput`, `ConfigPanel`,
`OutputSettings`, `TokenSection`, `PreviewModal`, `AboutSection`,
`ThemeToggle`, `BMCLogo`) are not touched.

## Re-render strategy

- Components subscribe with the narrowest possible selector. Example:
  the inline editor body uses
  `useFileConcatStore((s) => s.editorDraftByPath[path])` — only re-renders
  on this path's draft, not on any sibling's.
- Action references are stable across the store's lifetime (zustand's
  default `set`/`get` capture). Components that only need actions can do
  `useFileConcatStore((s) => s.toggleFileInclusion)` without subscribing
  to any state.
- When equality matters (object/array selections), components use
  `useFileConcatStore(selector, shallow)` from `zustand/shallow`.

## Test pyramid

| Layer | Path | Coverage | Env |
|---|---|---|---|
| Pure lib | `apps/web/tests/lib/` | `path-filters`, `chunk-calculator`, `output-formatter` | vitest, node |
| Slice | `apps/web/tests/store/` | each slice's actions via `useFileConcatStore.getState()`/`setState()` | vitest, jsdom (zustand uses no DOM but RTL setup is shared) |
| Component | `apps/web/tests/components/` | each new component with store hydrated via `setState` | vitest, jsdom + RTL |
| Flow | `apps/web/tests/flows/` | `file-upload-flow.test.tsx` (existing), `editing-flow.test.tsx`, `output-flow.test.tsx` | vitest, jsdom + RTL, full store |

### New tests to add

- `tests/lib/path-filters.test.ts` — covers default config keep, stale
  `includePatterns: "src/**/*"` rejecting everything (regression lock),
  include/ignore precedence, segment vs full-path semantics
- `tests/lib/chunk-calculator.test.ts` — empty input, under-threshold,
  over-threshold splits, mixed
- `tests/lib/output-formatter.test.ts` — single-format XML correctness,
  multi-format chunk header naming
- `tests/store/upload-slice.test.ts` — `handleFilesBatch` happy + filter-drop
  paths, `toggleFileInclusion`, `commitFileEdit` recomputes size, `reset`
- `tests/store/editing-slice.test.ts` — open/close, start/change/cancel/save
  lifecycle, save delegates to upload commit
- `tests/store/tokens-slice.test.ts` — token estimation threshold flips
  `recommendedFormat`
- `tests/store/output-slice.test.ts` — generate, preview (single + multi),
  copy → isCopied flicker
- `tests/components/filter-drop-alert.test.tsx`
- `tests/components/upload-zone.test.tsx`
- `tests/components/files-panel.test.tsx`
- `tests/components/output-panel.test.tsx`
- `tests/flows/editing-flow.test.tsx` — upload → open → edit → save → file
  content reflected; cancel with dirty triggers confirm
- `tests/flows/output-flow.test.tsx` — generate → output rendered; format
  switch updates output; preview opens modal with correct chunks

The existing `tests/file-upload-flow.test.tsx` moves to `tests/flows/`.

## Execution phases

Each phase ends with an atomic commit. Acceptance bar: `pnpm check`,
`pnpm lint`, and `pnpm --filter @fileconcat/web test` all green.

### Phase 1 — Pure lib extraction
1. Add `lib/path-filters.ts`, `lib/chunk-calculator.ts`,
   `lib/output-formatter.ts` with logic moved verbatim from `app.tsx`.
2. Update `app.tsx` to import from the new modules; delete the old inline
   `useCallback`s wrapping them.
3. Drop the `[isIgnoredDirectory] …` console.log spam during extraction.
4. Add `tests/lib/*.test.ts`.
5. Commit: `refactor: extract pure path filters, chunking, and output
   formatting to lib/`

### Phase 2 — zustand store + slices
1. Add `zustand` dependency to `apps/web`.
2. Create `store/` with slice files and `useFileConcatStore`.
3. Replace `useState`/`useCallback` in `app.tsx` with selectors and store
   actions. `app.tsx` is still a single file at this point; only its
   internals change.
4. Wire `useConfig` into the config slice; remove the standalone
   `useConfig()` call (or have the config slice delegate to it during a
   bridge step).
5. Unify `maxFileSizeMB` onto `userConfig`.
6. Existing `tests/file-upload-flow.test.tsx` must still pass unchanged.
7. Add `tests/store/*.test.ts`.
8. Commit: `refactor: move app state into zustand store with composed
   slices`

### Phase 3 — Component decomposition
1. Extract `AppShell`, `AppHeader`, `UploadZone`, `FilterDropAlert`,
   `FailedFilesAlert`, `ResetButton`, `FilesPanel`, `OutputPanel`.
2. Each component reads from the store via narrow selectors.
3. `app.tsx` shrinks to `<AppShell/>` plus imports — target ~30 lines.
4. Add `tests/components/*.test.tsx`.
5. Commit: `refactor: decompose App into AppShell + panel components`

### Phase 4 — Test gap + cleanup
1. Add `tests/flows/editing-flow.test.tsx` and
   `tests/flows/output-flow.test.tsx`.
2. Move `tests/file-upload-flow.test.tsx` to `tests/flows/`.
3. Delete `apps/web/src/components/file-viewer-pane.tsx` if confirmed
   unused (verify via grep before deletion).
4. Update `CLAUDE.md` if architecture references need refresh.
5. Commit: `test: round out integration tests; remove stale code`

## Out of scope (deferred work)

- **`isExcludedPath` matching-logic fix** — slashed include patterns like
  `src/**/*` don't match rooted paths like `myrepo/src/x.ts`. This is a
  semantic bug independent of the refactor. Tracked in `.claude/napkin.md`.
- **Stale-`includePatterns` migration** — separate UX decision; the
  `filterDropNotice` alert is the chosen recovery path.
- **`isEditorEnabled` UI wiring** — flag scaffold is preserved but no UI
  toggle yet.
- **Existing UI primitives** — `FileTree`, `FileViewerModal`, etc. are
  untouched.

## Decisions log

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | Refactor scope | Full architectural reset | User wants long-term clean state |
| 2 | State sharing pattern | Context — then revisited to zustand | Re-render concern for keystroke updates; user wants proactive fix |
| 3 | `activeFilePath` location | Editing slice | Bundling open→view→edit→save into one slice; YAGNI on splitting |
| 4 | `maxFileSizeMB` source of truth | `userConfig.maxFileSizeMB` | Removes duplicate state; fixes existing inconsistency |
| 5 | Test surface | jsdom + RTL pyramid (lib → slice → component → flow) | Already accepted in prior session for the filter-drop regression test |
| 6 | Session execution scope | Design doc only this session; implementation deferred | User wants time to digest before execution |

## Open questions / future work

- Should `useTokenEstimation`'s auto-subscription happen inside the store
  (via `subscribe` API) or in a separate effect inside a top-level hook?
  Currently leaning toward in-store `subscribe` so consumers don't need to
  wire it manually. To validate during Phase 2.
- Whether to expose convenience selector hooks per slice
  (`useUploadStore`, `useEditingStore`) for ergonomic imports, or keep
  everything on `useFileConcatStore`. Phase 3 will reveal which the
  components prefer.
