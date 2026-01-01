import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
    // Bundle analyzer - generates stats.html in root
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
    },
  },
  build: {
    // Disable sourcemaps in production for smaller bundle size
    sourcemap: false,
    // Increase chunk size warning limit (Cloudflare Pages uses Brotli compression)
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Manual chunks for better code splitting and caching
        manualChunks: (id) => {
          // Tiktoken - large tokenizer library with WASM
          if (id.includes("@dqbd/tiktoken")) {
            return "tiktoken";
          }
          // CodeMirror - code editor (already lazy loaded, but separate vendor chunk)
          if (id.includes("@codemirror") || id.includes("@uiw/react-codemirror")) {
            return "codemirror";
          }
          // Radix UI - all UI primitives in one chunk
          if (id.includes("@radix-ui")) {
            return "radix-ui";
          }
          // Icons - lucide-react and simple-icons
          if (id.includes("lucide-react") || id.includes("@icons-pack")) {
            return "icons";
          }
          // File type detection library
          if (id.includes("file-type")) {
            return "file-type";
          }
          // React and React DOM - core framework
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) {
            return "react-vendor";
          }
        },
      },
    },
  },
});
