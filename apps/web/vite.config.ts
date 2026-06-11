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
    // TanStack Start - must come before React
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
      "@": path.resolve(__dirname, "./src"),
      "~": path.resolve(__dirname, "./src"),
      "@fileconcat/core": path.resolve(__dirname, "../../packages/core/src"),
    },
  },
  optimizeDeps: {
    exclude: ["@dqbd/tiktoken"],
  },
  build: {
    // Disable sourcemaps in production for smaller bundle size
    sourcemap: false,
    rollupOptions: {
      output: {
        // Manual chunks for better code splitting and caching
        manualChunks: {
          tiktoken: ["@dqbd/tiktoken"],
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
