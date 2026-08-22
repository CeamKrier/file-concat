// Reddit's half of the same contract YouTube answers: report what this page
// offers, clip what was asked for.

import { browser, defineContentScript } from "#imports";
import { announceChanges } from "../src/announce";
import { clippingPath, redditUrl, renderRedditClipping, type Clipping } from "../src/markdown";
import type { ItemRequest, PageReport, SiteRequest, SiteResponse } from "../src/messages";
import {
  clipListedPost,
  clipOpenThread,
  expandComments,
  isListing,
  isThread,
  postSummary,
  posts,
} from "../src/reddit";

const OPTION = {
  label: "Expand more comments",
  hint: "Clicks the thread's own “more replies”, three rounds. Slower, and never all of them.",
};

function report(): PageReport {
  const base = { site: "reddit", noun: "post" } as const;

  if (isThread()) {
    const post = posts()[0];
    if (!post) return { ...base, kind: "other", items: [] };
    const { id, title, meta } = postSummary(post);
    return { ...base, kind: "single", items: [{ id, title, meta }], option: OPTION };
  }

  if (isListing()) {
    const items = posts().filter((post) => post.checkVisibility()).map(postSummary);
    // No option here: a listing clip cannot reach comments at any price, so
    // offering to spend more effort on them would be a lie.
    return { ...base, kind: items.length ? "list" : "other", items };
  }

  return { ...base, kind: "other", items: [] };
}

async function clip(id: string, grouped: boolean, expand: boolean): Promise<Clipping> {
  let clipping;
  if (isThread()) {
    if (expand) await expandComments();
    clipping = clipOpenThread();
  } else {
    const post = posts().find((node) => node.getAttribute("id")?.endsWith(id));
    const permalink = post?.getAttribute("permalink");
    if (!permalink) throw new Error("That post is no longer on this page. Reload it and try again.");
    clipping = await clipListedPost(permalink);
  }
  return {
    path: clippingPath(clipping.title, grouped ? clipping.subreddit.replace("/", "-") : undefined),
    markdown: renderRedditClipping(clipping),
    source: redditUrl(clipping.permalink),
    clippedAt: Date.now(),
    partial: !clipping.commentsAvailable,
  };
}

async function handle(request: ItemRequest): Promise<PageReport | Clipping> {
  if (request.type === "fc:page") return report();
  return clip(request.id, request.grouped, request.option);
}

export default defineContentScript({
  matches: ["*://*.reddit.com/*"],
  runAt: "document_idle",
  main() {
    // Reddit navigates without a page load, and its feed fills in after one.
    // Both show up as a change in "where am I, and how much is here".
    announceChanges(() => `${location.pathname}:${posts().length}`);

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
