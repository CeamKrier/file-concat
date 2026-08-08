# apps/web

TanStack Start (file-routed React + SSR) targeting Cloudflare Workers. The Vite config (`apps/web/app.config.ts`) is the spine — it composes plugins in a strict order:

1. `cloudflare({ viteEnvironment: { name: "ssr" } })` — must wrap the SSR build for the Workers runtime.
2. `tanstackStart()` — must come **before** `react()`.
3. `wasm()` + `topLevelAwait()` — required for `@dqbd/tiktoken` (excluded from `optimizeDeps` for the same reason).
4. `react()`, then `mdx()` with `remark-gfm` + `rehype-prism-plus` and `providerImportSource: "@mdx-js/react"`.

Manual `manualChunks` split tiktoken, CodeMirror, Radix, icons, file-type, and react-vendor — keep heavy deps in their own chunks when adding them.

Docs content is MDX under `apps/web/src/content/docs/`; `docs/$slug.tsx` resolves slug → MDX file.

> The SSR-worker size trap that governs how heavy code may be imported lives in the root `.claude/CLAUDE.md`, because it fires from `packages/core` too.

## Deploy targets and build artifacts

- The web build output lives in `apps/web/dist/` (the `@cloudflare/vite-plugin` v1.22+ convention; the older `.output/` directory is no longer produced). Vite emits `dist/client/` for static assets and `dist/server/index.js` plus a generated `dist/server/wrangler.json` derived from the hand-written `apps/web/wrangler.jsonc`. `pnpm start` runs the SSR worker via `node dist/server/index.js`.
- **`main` in `apps/web/wrangler.jsonc` is the real worker entry, and it is now `./src/server.ts`.** It used to point at `@tanstack/react-start/server-entry`; that is the framework's _default_ entry, which is built with `createServerEntry` and forwards **only** `fetch`, leaving nowhere to hang a cron. TanStack's own `src/server` convention does **not** help here: the Cloudflare plugin builds whatever `main` names, so the entry has to be named there. `src/server.ts` reproduces the default entry's `fetch` verbatim (`createStartHandler(defaultStreamHandler)`) and adds `scheduled` for the counter retention cron. The generated `dist/server/wrangler.json` still rewrites `main` to the emitted `index.js`; that part is unchanged. If you replace the entry, keep the `fetch` half identical or SSR breaks silently.
- Worker code is split across `dist/server/assets/*.js` (`no_bundle: true` uploads each as its own module). **When checking whether something made it into the worker, grep the whole `dist/server` tree — `index.js` is a thin re-export and will not contain it.**
- Both `dist/` and the legacy `.output/` are gitignored, alongside `.wrangler/` and `*.tsbuildinfo`.
- `nodejs_compat` is required and already enabled.
