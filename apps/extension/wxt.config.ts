import { defineConfig } from "wxt";

// What was `manifest.json` by hand. Entrypoints, their match patterns and the
// side panel registration are read off `entrypoints/`, so only what WXT cannot
// infer lives here.
export default defineConfig({
  // Shipped as authored, which the Chrome Web Store asks for where possible:
  // minified code is allowed but harder to review, and review time is the
  // thing being bought here. Measured 2026-08-20 — the package goes from
  // 107,354 to 216,830 raw bytes and from 39,991 to 58,788 zipped, so the
  // whole cost is 19 KB in the zip. Source maps would have been the other way
  // to hand over the sources and are the worst of the three: 181 KB zipped,
  // and read through a mapping rather than directly.
  //
  // What this does *not* buy is a readable `article.js`: 110,931 of its
  // 124,292 unminified bytes are Readability and Turndown, ahead of our first
  // line. The 81 KB that is ours — the four handlers, the worker, the panel —
  // is what a reviewer can now read as written.
  vite: () => ({ build: { minify: false } }),
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
