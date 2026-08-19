// The catch-all handler. Everything that is not one of the sites with its own
// script is either an article or nothing, and Readability decides which.

import { browser, defineContentScript } from "#imports";
import { announceChanges } from "../src/announce";
import { articleTitle, clipArticle, looksLikeArticle } from "../src/article";
import { clippingPath, renderArticleClipping, type Clipping } from "../src/markdown";
import type { PageReport, SiteRequest, SiteResponse } from "../src/messages";

function report(): PageReport {
  const base = { site: "article", noun: "page" } as const;
  if (!looksLikeArticle()) return { ...base, kind: "other", items: [] };
  return { ...base, kind: "single", items: [{ id: location.href, title: articleTitle() }] };
}

function clip(): Clipping {
  const article = clipArticle();
  return {
    path: clippingPath(article.title),
    markdown: renderArticleClipping(article),
    source: article.url,
    clippedAt: Date.now(),
  };
}

export default defineContentScript({
  matches: ["<all_urls>"],
  // The sites with their own handler, plus the app itself. Two scripts
  // answering `fc:page` on one page is a race over which reply the panel keeps.
  excludeMatches: [
    "*://*.youtube.com/*",
    "*://*.reddit.com/*",
    "*://news.ycombinator.com/*",
    "https://fileconcat.com/*",
    "http://localhost/*",
  ],
  runAt: "document_idle",
  main() {
    // An SPA doc site swaps its article without a load; the title is the
    // cheapest thing that changes when it does.
    announceChanges(() => `${location.pathname}:${document.title}`);

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const request = message as SiteRequest;
      if (request?.type !== "fc:page" && request?.type !== "fc:clip") return;
      try {
        const value = request.type === "fc:page" ? report() : [clip()];
        sendResponse({ ok: true, value } satisfies SiteResponse<PageReport | Clipping[]>);
      } catch (error) {
        sendResponse({
          ok: false,
          error: String((error as Error)?.message ?? error),
        } satisfies SiteResponse<never>);
      }
    });
  },
});
