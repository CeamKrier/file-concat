import { defineConfig } from "wxt";

// What was `manifest.json` by hand. Entrypoints, their match patterns and the
// popup registration are read off `entrypoints/`, so only what WXT cannot
// infer lives here.
export default defineConfig({
  manifest: {
    name: "FileConcat Clipper",
    description: "Clip YouTube transcripts to Markdown and hand them to an open fileconcat.com tab.",
    permissions: ["storage", "unlimitedStorage"],
    host_permissions: ["*://*.youtube.com/*", "https://fileconcat.com/*", "http://localhost/*"],
    action: { default_title: "FileConcat Clipper" },
  },
});
