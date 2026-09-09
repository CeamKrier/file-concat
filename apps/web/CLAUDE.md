# apps/web

TanStack Start (file-routed React + SSR) targeting Cloudflare Workers. `apps/web/vite.config.ts` is the spine: plugins, the `@fileconcat/core` alias, `optimizeDeps` and the chunk split all live there. (`app.config.ts` is a nine-line TanStack stub that sets React strictMode and nothing else; do not go looking for build config in it.) The plugins compose in a strict order:

1. `cloudflare({ viteEnvironment: { name: "ssr" } })` — must wrap the SSR build for the Workers runtime.
2. `tanstackStart()` — must come **before** `react()`.
3. `wasm()` + `topLevelAwait()` — required for `@dqbd/tiktoken` (excluded from `optimizeDeps` for the same reason).
4. `react()`, then `mdx()` with `remark-gfm` + `rehype-prism-plus` and `providerImportSource: "@mdx-js/react"`.

`manualChunks` splits three: `radix-ui`, `icons`, `react-vendor`. **tiktoken is deliberately absent and must stay absent** — a forced entry leaves an orphan stub in the SSR bundle whose `import "./tiktoken_bg.wasm"` side effect drags 5.4 MiB of wasm into the Cloudflare Worker. The comment above `manualChunks` in `vite.config.ts` is the authority; read it before adding a line. Only a client-only dep that is imported *eagerly* belongs there. Anything loaded lazily behind an `import.meta.env.SSR` guard (tiktoken, `officeparser`, `pdfjs-dist`) is already split by that guard and goes in `optimizeDeps.exclude` instead.

Docs content is MDX under `apps/web/src/content/docs/`; `docs/$slug.tsx` resolves slug → MDX file.

> The SSR-worker size trap that governs how heavy code may be imported lives in the root `.claude/CLAUDE.md`, because it fires from `packages/core` too.

## Deploy targets and build artifacts

- The web build output lives in `apps/web/dist/` (the `@cloudflare/vite-plugin` v1.22+ convention; the older `.output/` directory is no longer produced). Vite emits `dist/client/` for static assets and `dist/server/index.js` plus a generated `dist/server/wrangler.json` derived from the hand-written `apps/web/wrangler.jsonc`. `pnpm start` runs the SSR worker via `node dist/server/index.js`.
- **`main` in `apps/web/wrangler.jsonc` is the real worker entry, and it is now `./src/server.ts`.** It used to point at `@tanstack/react-start/server-entry`; that is the framework's _default_ entry, which is built with `createServerEntry` and forwards **only** `fetch`, leaving nowhere to hang a cron. TanStack's own `src/server` convention does **not** help here: the Cloudflare plugin builds whatever `main` names, so the entry has to be named there. `src/server.ts` reproduces the default entry's `fetch` verbatim (`createStartHandler(defaultStreamHandler)`) and adds `scheduled` for the counter retention cron. The generated `dist/server/wrangler.json` still rewrites `main` to the emitted `index.js`; that part is unchanged. If you replace the entry, keep the `fetch` half identical or SSR breaks silently.
- Worker code is split across `dist/server/assets/*.js` (`no_bundle: true` uploads each as its own module). **When checking whether something made it into the worker, grep the whole `dist/server` tree — `index.js` is a thin re-export and will not contain it.**
- Both `dist/` and the legacy `.output/` are gitignored, alongside `.wrangler/` and `*.tsbuildinfo`.
- `nodejs_compat` is required and already enabled.
