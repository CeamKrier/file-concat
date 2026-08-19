import { defineConfig } from "wxt";

// What was `manifest.json` by hand. Entrypoints, their match patterns and the
// side panel registration are read off `entrypoints/`, so only what WXT cannot
// infer lives here.
export default defineConfig({
  manifest: {
    name: "FileConcat Clipper",
    description: "Clip YouTube transcripts to Markdown and hand them to an open fileconcat.com tab.",
    permissions: ["storage", "unlimitedStorage", "sidePanel"],
    host_permissions: ["*://*.youtube.com/*", "https://fileconcat.com/*", "http://localhost/*"],
    // No `default_popup`: the action click opens the panel instead, which
    // the background asks for with `setPanelBehavior`.
    action: { default_title: "FileConcat Clipper" },
  },
});
