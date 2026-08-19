import { defineConfig } from "wxt";

// What was `manifest.json` by hand. Entrypoints, their match patterns and the
// side panel registration are read off `entrypoints/`, so only what WXT cannot
// infer lives here.
export default defineConfig({
  manifest: {
    name: "FileConcat Clipper",
    description: "Clip articles, YouTube transcripts and Reddit threads to Markdown and hand them to an open fileconcat.com tab.",
    permissions: ["storage", "unlimitedStorage", "sidePanel"],
    // The article handler is the catch-all, so the host list is the web. That
    // is the cost of "any article", and it is the feature rather than a side
    // effect of it; nothing is read from a page until you ask for it.
    host_permissions: ["<all_urls>"],
    // No `default_popup`: the action click opens the panel instead, which
    // the background asks for with `setPanelBehavior`.
    action: { default_title: "FileConcat Clipper" },
  },
});
