// Hacker News. One request per thread, and the whole comment tree comes back.

import { browser, defineContentScript } from "#imports";
import { announceChanges } from "../src/announce";
import { clipItem, isFrontPage, isItem, itemId, stories } from "../src/hn";
import { clippingPath, hnUrl, renderHnClipping, type Clipping } from "../src/markdown";
import type { PageReport, SiteRequest, SiteResponse } from "../src/messages";

function report(): PageReport {
  const base = { site: "hn", noun: "thread" } as const;
  if (isItem()) {
    const title = document.querySelector("tr.athing .titleline > a")?.textContent?.trim();
    return { ...base, kind: "single", items: [{ id: itemId(), title: title || `Item ${itemId()}` }] };
  }
  if (isFrontPage()) {
    const items = stories();
    return { ...base, kind: items.length ? "list" : "other", items };
  }
  return { ...base, kind: "other", items: [] };
}

async function clip(id: string, grouped: boolean): Promise<Clipping> {
  const item = await clipItem(id);
  return {
    path: clippingPath(item.title, grouped ? "hacker-news" : undefined),
    markdown: renderHnClipping(item),
    source: hnUrl(item.id),
    clippedAt: Date.now(),
  };
}

async function handle(request: SiteRequest): Promise<PageReport | Clipping> {
  if (request.type === "fc:page") return report();
  return clip(request.id, request.grouped);
}

export default defineContentScript({
  matches: ["*://news.ycombinator.com/*"],
  runAt: "document_idle",
  main() {
    announceChanges(() => `${location.pathname}${location.search}`);

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const request = message as SiteRequest;
      if (request?.type !== "fc:page" && request?.type !== "fc:clip") return;
      handle(request).then(
        (value) => sendResponse({ ok: true, value } satisfies SiteResponse<PageReport | Clipping>),
        (error: unknown) =>
          sendResponse({ ok: false, error: String((error as Error)?.message ?? error) } satisfies SiteResponse<never>),
      );
      return true;
    });
  },
});
