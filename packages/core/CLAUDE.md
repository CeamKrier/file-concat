# packages/core

The barrel `src/index.ts` re-exports five subsystems. When adding new functionality, place it in the matching subsystem and re-export from that subsystem's `index.ts` rather than from the root barrel directly.

- `file-processing/` — transform, size, validation, `binary-extensions`. The single source of truth for what counts as text, what gets skipped for size, and how files are turned into the output blob. Three parts deserve their own mention:
  - `routing.ts` — `routeBytes(prefix)` is the **one** decision point for what a file is. It reads leading bytes, never a filename, and returns `binary` / `extract(parserId)` / `expand(archiveKind)` / `unknown` (ADR-0011). Never reintroduce an extension list to decide extraction.
  - `text-signatures.ts` — the same idea for formats whose container _is_ text: `WEBVTT`, an SRT cue, `{"cells": [{"cell_type":`, an RFC 5322 header block with an envelope header. These route to parsers like any container, so a notebook saved as `.json` still renders. Add a text-shaped format here, not as a post-classification transform — that would need the extension table ADR-0011 removed.
  - `parsers/` — the parser contract and `createParserRegistry`. Core routes; **each platform registers its own loaders** (`apps/web/src/lib/parsers.ts`, `packages/cli/src/parsers.ts`), because tsup bundles core into the published CLI and `?url` is Vite-only syntax (ADR-0012). A parser with a dependency keeps the library call in the _platform_ loader (`email`); a parser that is a pure function over text lives in core and is registered directly (`notebook`, `subtitles`).
  - `archives.ts` — bytes in, entries out. Shared by the web (always) and the CLI (behind `--expand-archives`).
- `path-utils/` — `file-tree`, `language` (extension → language id), `project-name`, `skip-paths`. Used by both the web tree view and the CLI.
- `default-ignore.ts` — gitignore-style defaults shared across web and CLI; do not duplicate ignore patterns elsewhere.
- `models/` — LLM model catalog and `cost-calculator`. Consumed by the web's cost UI and refreshed via `apps/web/scripts/fetch-models.ts` → `apps/web/src/data/models.json`.
- `sources/` — pluggable input sources. Each remote (`github`, `gitlab`, `bitbucket`, `gist`, `url`) is an adapter under `sources/adapters/`, registered in `default-registry.ts`. To add a new source, implement the adapter, register it, and the web `source-input` / CLI both pick it up automatically.

## Source adapter gotcha

When adding or modifying an adapter under `packages/core/src/sources/adapters/`, type the response payload of every `await response.json()` call explicitly. Without it `tsc --noEmit` (and therefore `pnpm check`) fails with implicit-any errors that only surface at the workspace level.
