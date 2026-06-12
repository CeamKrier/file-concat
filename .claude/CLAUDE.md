# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository

FileConcat (fileconcat.com) — a privacy-first tool that concatenates files into a single LLM-ready blob. Ships as both a web app (`apps/web`) and a published npm CLI (`packages/cli`), with shared logic in `packages/core`.

## Workspace layout

pnpm workspace + Nx (`pnpm-workspace.yaml`, `nx.json`). Three members:

| Path             | Name                | Role                                                                 |
| ---------------- | ------------------- | -------------------------------------------------------------------- |
| `apps/web`       | `@fileconcat/web`   | TanStack Start app deployed to Cloudflare Workers                    |
| `packages/cli`   | `fileconcat`        | Commander CLI, published to npm, built with tsup                     |
| `packages/core`  | `@fileconcat/core`  | Shared library: file processing, path utils, source adapters, models |

`@fileconcat/core` is consumed via `workspace:*` and resolved at type-check time through the root `tsconfig.json` `paths` alias (`@fileconcat/core` → `packages/core/src/index.ts`). The web app duplicates that alias in `apps/web/app.config.ts` so Vite resolves the same source files at runtime — no build step is required to consume `core` in dev.

## Common commands

Run from the repo root unless noted. All build/check tasks go through Nx, so prefer the root scripts to get caching and task graph ordering.

```bash
pnpm dev              # nx run @fileconcat/web:dev   (Vite dev server)
pnpm build            # nx run @fileconcat/web:build (web only)
pnpm build:all        # nx run-many -t build         (every package)
pnpm preview          # nx run @fileconcat/web:preview
pnpm check            # nx run-many -t check         (tsc --noEmit per package)
pnpm lint             # eslint .
pnpm format           # prettier --write .
```

Web app, from `apps/web/`:

```bash
pnpm fetch-models       # refresh src/data/models.json from upstream pricing source
pnpm generate-sitemap   # rewrite public/sitemap.xml
pnpm prebuild           # runs both above (fires automatically before build)
pnpm deploy             # pnpm build && wrangler deploy
pnpm start              # node .output/server/index.mjs (run the built SSR server)
```

CLI, from `packages/cli/`:

```bash
pnpm dev                # tsx src/index.ts  (run from source)
pnpm build              # tsup → dist/
```

Core tests use Vitest (`packages/core/vitest.config.ts`); run from inside `packages/core/`:

```bash
pnpm vitest run                  # full suite
pnpm vitest run path/to/file     # single file
pnpm vitest -t "pattern"         # by test name
```

There is no root `test` script — Nx does not currently wire a `test` target.

## Architecture notes

### `packages/core`

The barrel `src/index.ts` re-exports five subsystems. When adding new functionality, place it in the matching subsystem and re-export from that subsystem's `index.ts` rather than from the root barrel directly.

- `file-processing/` — transform, size, validation, `binary-extensions`. The single source of truth for what counts as text, what gets skipped for size, and how files are turned into the output blob.
- `path-utils/` — `file-tree`, `language` (extension → language id), `project-name`, `skip-paths`. Used by both the web tree view and the CLI.
- `default-ignore.ts` — gitignore-style defaults shared across web and CLI; do not duplicate ignore patterns elsewhere.
- `models/` — LLM model catalog and `cost-calculator`. Consumed by the web's cost UI and refreshed via `apps/web/scripts/fetch-models.ts` → `apps/web/src/data/models.json`.
- `sources/` — pluggable input sources. Each remote (`github`, `gitlab`, `bitbucket`, `gist`, `url`) is an adapter under `sources/adapters/`, registered in `default-registry.ts`. To add a new source, implement the adapter, register it, and the web `source-input` / CLI both pick it up automatically.

### `apps/web`

TanStack Start (file-routed React + SSR) targeting Cloudflare Workers. The Vite config (`apps/web/app.config.ts`) is the spine — it composes plugins in a strict order:

1. `cloudflare({ viteEnvironment: { name: "ssr" } })` — must wrap the SSR build for the Workers runtime.
2. `tanstackStart()` — must come **before** `react()`.
3. `wasm()` + `topLevelAwait()` — required for `@dqbd/tiktoken` (excluded from `optimizeDeps` for the same reason).
4. `react()`, then `mdx()` with `remark-gfm` + `rehype-prism-plus` and `providerImportSource: "@mdx-js/react"`.

Manual `manualChunks` split tiktoken, CodeMirror, Radix, icons, file-type, and react-vendor — keep heavy deps in their own chunks when adding them.

Routes live in `apps/web/src/routes/` (`__root.tsx`, `index.tsx`, `app.tsx`, `docs/index.tsx`, `docs/$slug.tsx`, `api/models.ts`). Docs content is MDX under `apps/web/src/content/docs/`; `docs/$slug.tsx` resolves slug → MDX file.

Path aliases inside the web app: `@` and `~` → `apps/web/src`, plus the `@fileconcat/core` alias mentioned above.

### `packages/cli`

Single-purpose Commander program (`src/index.ts` → `src/commands/concat.ts`). The default command and the explicit `concat` command share the same flag set. Filtering, ignore handling, and output formatting all delegate to `@fileconcat/core` — keep CLI-specific code limited to argv parsing, file I/O, and progress reporting.

## Deploy targets and build artifacts

- The web build output lives in `apps/web/dist/` (the `@cloudflare/vite-plugin` v1.22+ convention; the older `.output/` directory is no longer produced). Vite emits `dist/client/` for static assets and `dist/server/index.js` plus a generated `dist/server/wrangler.json` derived from the hand-written `apps/web/wrangler.jsonc`. `pnpm start` runs the SSR worker via `node dist/server/index.js`.
- The hand-written `apps/web/wrangler.jsonc` points `main` at `@tanstack/react-start/server-entry` (a virtual module). Do not rewrite it to a relative path — the Cloudflare Vite plugin substitutes the real entry into the generated `dist/server/wrangler.json` at build time.
- Both `dist/` and the legacy `.output/` are gitignored, alongside `.wrangler/` and `*.tsbuildinfo`.
- `nodejs_compat` is required and already enabled.

## Tooling conventions

- pnpm 10.x is the package manager (see root `packageManager` field). Use `pnpm` for installs/scripts so the workspace protocol resolves.
- TypeScript 5.6, strict, ESNext modules, `moduleResolution: "bundler"`. Per-package `tsconfig.json` extends the root one.
- ESLint 9 flat config (`eslint.config.js`) with `typescript-eslint`, `react-hooks`, `react-refresh`. Lint runs from the root via `eslint .`.
- Prettier 3 with `prettier-plugin-tailwindcss`. Settings in `.prettierrc`: `printWidth: 100`, double quotes, semicolons, 2-space, **`endOfLine: "crlf"`** (intentional — do not switch to lf).

## Source adapter gotcha

When adding or modifying an adapter under `packages/core/src/sources/adapters/`, type the response payload of every `await response.json()` call explicitly. Without it `tsc --noEmit` (and therefore `pnpm check`) fails with implicit-any errors that only surface at the workspace level.
