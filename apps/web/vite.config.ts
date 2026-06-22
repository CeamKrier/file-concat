import path from "path";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import mdx from "@mdx-js/rollup";
import remarkGfm from "remark-gfm";
import rehypePrismPlus from "rehype-prism-plus";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  appType: "custom",
  plugins: [
    // Cloudflare SSR environment
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    // TanStack Start - must come before React.
    //
    // NOTE on prerender: TanStack Start exposes a `prerender` config that
    // runs after the SSR build via Vite 6's plugin `buildApp` lifecycle.
    // The current `@cloudflare/vite-plugin@1.22.0` overrides `builder.buildApp`
    // with its own implementation (see CF dist/index.mjs around line 21477,
    // function createBuildApp) which builds the worker + client environments
    // but does NOT invoke other plugins' `buildApp` hooks. That means
    // TanStack's prerender pass never runs in this stack — no `pages` /
    // `prerender` options here will emit static HTML. Until CF restores the
    // plugin hook chain (or we replace CF's buildApp ourselves), all routes
    // are served by the SSR worker; the docs flash was eliminated upstream
    // by eager-importing the MDX in routes/docs/$slug.tsx instead.
    tanstackStart(),
    // WASM support for tiktoken
    wasm(),
    topLevelAwait(),
    // React
    react(),
    mdx({
      remarkPlugins: [remarkGfm],
      rehypePlugins: [rehypePrismPlus],
      providerImportSource: "@mdx-js/react",
    }),
    // Bundle analyzer (dev only)
    visualizer({
      open: false,
      gzipSize: true,
      brotliSize: true,
      filename: "dist/stats.html",
    }),
  ],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
      "@fileconcat/core": path.resolve(__dirname, "../../packages/core/src"),
    },
  },
  optimizeDeps: {
    exclude: ["@dqbd/tiktoken"],
    // CodeMirror highlighting breaks if the optimizer inlines separate copies
    // of these shared cores into each pre-bundled chunk: the grammar's syntax
    // tags (from @lezer/highlight) end up as different object identities than
    // the ones the highlight styles reference, so highlightTree matches nothing
    // and the editor renders as flat, uncolored text. Forcing them into their
    // own optimized chunks makes every CodeMirror package share one instance.
    include: [
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/language",
      "@lezer/common",
      "@lezer/highlight",
      "@lezer/lr",
    ],
  },
  build: {
    // Disable sourcemaps in production for smaller bundle size
    sourcemap: false,
    rollupOptions: {
      output: {
        // Manual chunks for client-side code splitting and caching.
        // Tiktoken is deliberately NOT listed: it is loaded lazily from the
        // client via tokens-client.ts and DCE'd out of the SSR worker by
        // tokens.ts's `import.meta.env.SSR` guard. A forced manualChunks
        // entry for tiktoken creates an orphan stub in the SSR bundle whose
        // side-effect `import "./tiktoken_bg.wasm"` drags the 5.4 MiB wasm
        // into the Cloudflare Worker bundle and busts the 3 MiB free-plan
        // size limit.
        manualChunks: {
          codemirror: ["@uiw/react-codemirror"],
          "radix-ui": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-label",
            "@radix-ui/react-popover",
            "@radix-ui/react-progress",
            "@radix-ui/react-scroll-area",
            "@radix-ui/react-slot",
            "@radix-ui/react-tabs",
          ],
          icons: ["lucide-react", "@icons-pack/react-simple-icons"],
          "react-vendor": ["react", "react-dom"],
        },
      },
    },
  },
});
