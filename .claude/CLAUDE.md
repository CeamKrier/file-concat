# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository

FileConcat (fileconcat.com) — a privacy-first tool that concatenates files into a single LLM-ready blob. Ships as both a web app (`apps/web`) and a published npm CLI (`packages/cli`), with shared logic in `packages/core`.

## Workspace layout

pnpm workspace + Nx (`pnpm-workspace.yaml`, `nx.json`). Three members: `apps/web`, `packages/cli`, `packages/core`.

`@fileconcat/core` is consumed via `workspace:*` and resolved at type-check time through the root `tsconfig.json` `paths` alias (`@fileconcat/core` → `packages/core/src/index.ts`). The web app duplicates that alias in `apps/web/app.config.ts` so Vite resolves the same source files at runtime — no build step is required to consume `core` in dev.

Per-package guidance lives in `apps/web/CLAUDE.md`, `packages/core/CLAUDE.md` and `packages/cli/CLAUDE.md`; each loads only when you work under that directory.

## Common commands

Run from the repo root unless noted. All build/check tasks go through Nx, so prefer the root scripts (`pnpm dev`, `pnpm build`, `pnpm check`, …) over per-package invocations, to get caching and task graph ordering.

Core's Vitest suite must be run from inside `packages/core/` (`pnpm vitest run`, `pnpm vitest run <file>`, `pnpm vitest -t "<pattern>"`).

`pnpm test` from the root runs all three suites through Nx (`nx run-many -t test`): core, CLI and web. The CLI target builds itself first, because its suite drives the built `dist/index.js` rather than the source.

`pnpm check` covers all three projects too. It used to cover only web and CLI — core's target was named `typecheck`, so `run-many -t check` skipped it and core's TypeScript was never checked by the root command. Core's target is now `check`; do not rename it back.

## CI

`.github/workflows/ci.yml` runs typecheck, lint, all three suites and the web
build on every push to `development` or `master`. The build step is there for
`postbuild` (`apps/web/scripts/check-worker-size.ts`), which is the only guard
against a client-only library reaching the SSR worker graph — nothing else in the
pipeline would notice.

**Push only, not `pull_request`.** Check runs attach by commit SHA, so the push
run already appears on the PR; adding `pull_request` produced two identical
checks and no YAML construct lets one trigger suppress the other. The merge
result a `pull_request` run would test is the same tree here, because `master`
only ever advances by merging `development`. The file's header comment says when
to add it back: pull requests from forks.

Steps after checkout carry `if: ${{ !cancelled() }}` so one failing step still
reports the others. Before this existed the CLI suite sat red for a month.

## Keeping heavy code out of the SSR worker

Vite **inlines dynamic imports in the SSR build**, so `await import("heavy")` alone does not keep `heavy` out of the Cloudflare worker bundle — the body lands in the SSR chunk anyway. The only thing that works is static dead-code elimination: guard with `if (import.meta.env.SSR) return …` _before_ the import, which the SSR build replaces with `true` and then drops the rest.

That is why several web modules come in pairs — `tokens.ts` / `tokens-client.ts`, `prepare-batch.ts` / `prepare-batch-client.ts`, `parsers.ts` → `extract-document-client.ts` and `extract-email-client.ts`. Follow the pattern for any new parser, wasm blob, or detector.

`apps/web/scripts/check-worker-size.ts` runs as `postbuild` and watches this. It prunes SSR assets no server module references (Vite emits `?url` assets into the SSR output even when the importing module is dead code) and fails the build past a 1 MiB gzip budget. **The enforced Cloudflare limit is on the gzipped total, not the raw one** — the raw figure sits near 3 MiB and means nothing. The script's header comment is the authority; read it before changing the numbers.

## Tooling conventions

- Use `pnpm` for installs/scripts so the workspace protocol resolves.
- Prettier's `endOfLine: "crlf"` in `.prettierrc` is **intentional — do not switch to `lf`**.

## Tracked files the build rewrites

`prebuild` regenerates `apps/web/public/sitemap.xml`, `apps/web/public/llms.txt`,
`apps/web/public/llms-full.txt` and `apps/web/src/data/models.json`. They are
tracked, so any `pnpm build` leaves them dirty in the working tree whether or not
your change had anything to do with them.

**Do not commit them.** The next build regenerates them anyway, and staging them
puts a model-catalog refresh or a `lastmod` churn inside a commit that claims to
be about something else. `git add` the files you actually edited, by path; never
`git add -A` or `git add .` after a build. Leave them dirty and say so.

The one thing that does need saying: if a change of yours *should* alter one of
them (a new route or blog post changes the sitemap; a new docs page changes
`llms.txt`), verify the regenerated file picked it up, then still leave it
uncommitted.
