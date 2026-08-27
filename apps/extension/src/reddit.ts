// Reads a Reddit post out of the DOM. No API and no `.json` suffix: measured
// 2026-08-18 and again 2026-08-19, `.json` answers 403 from inside reddit.com
// itself, and `/svc/shreddit/more-comments/...` now answers 200 with the whole
// 299KB challenge page and zero `<shreddit-comment>` in it.
//
// What does work is the markup Reddit already shipped. `shreddit-post` and
// `shreddit-comment` carry author, score, depth and timestamps as attributes,
// which is a far more stable contract than any class name.

import type { RedditClipping, RedditComment } from "./markdown";

/** How many "N more replies" expanders one opt-in will spend. */
const EXPAND_ROUNDS = 3;
const EXPAND_SETTLE_MS = 1200;

const attr = (el: Element | null, name: string) => el?.getAttribute(name)?.trim() ?? "";
const slotText = (root: Element | null, slot: string) =>
  (root?.querySelector(`[slot="${slot}"]`) as HTMLElement | null)?.innerText?.trim() ?? "";

/** `t3_1vsf9eg` -> `1vsf9eg`, and anything already bare is left alone. */
export const bareId = (id: string) => id.replace(/^t[13]_/, "");

export function isThread(path = location.pathname): boolean {
  return /^\/r\/[^/]+\/comments\/[^/]+/.test(path);
}

export function isListing(path = location.pathname): boolean {
  return /^\/r\/[^/]+\/?$/.test(path) || /^\/r\/[^/]+\/(hot|new|top|rising|best)\/?$/.test(path);
}

/**
 * Every post element in a document, live or fetched. A listing holds many; a
 * thread page holds exactly one.
 */
export const posts = (doc: Document | Element = document) =>
  [...doc.querySelectorAll("shreddit-post")] as HTMLElement[];

export function postSummary(post: HTMLElement) {
  const comments = Number(attr(post, "comment-count")) || 0;
  return {
    id: bareId(attr(post, "id")),
    title: attr(post, "post-title") || "untitled",
    meta: `${attr(post, "score") || "0"} points - ${comments} comment${comments === 1 ? "" : "s"}`,
  };
}

function comments(doc: Document | Element): RedditComment[] {
  return ([...doc.querySelectorAll("shreddit-comment")] as HTMLElement[])
    .map((node) => ({
      author: attr(node, "author") || "unknown",
      created: attr(node, "created"),
      score: attr(node, "score") || "0",
      depth: Number(attr(node, "depth")) || 0,
      text: slotText(node, "comment"),
    }))
    .filter((comment) => comment.text);
}

/**
 * Spends the page's own "N more replies" controls rather than a route.
 *
 * Measured 2026-08-19 on a 36-comment thread: 25 on load, 33 after six clicks.
 * This can never reach every comment on a large thread — the clipping says how
 * many it got against the total, because a reader who is not told will assume
 * these are all of them.
 */
export async function expandComments(rounds = EXPAND_ROUNDS): Promise<void> {
  for (let round = 0; round < rounds; round++) {
    const expanders = [...document.querySelectorAll("button, summary")].filter((node) =>
      /more repl|more comment|view more|load more/i.test(node.textContent ?? ""),
    ) as HTMLElement[];
    if (expanders.length === 0) return;
    for (const expander of expanders) expander.click();
    await new Promise((resolve) => setTimeout(resolve, EXPAND_SETTLE_MS));
  }
}

/** The one shape both routes below produce, so the renderer sees no difference. */
function toClipping(post: HTMLElement, discussion: RedditComment[], available: boolean): RedditClipping {
  const linkUrl = attr(post, "content-href");
  const domain = attr(post, "domain");
  return {
    id: bareId(attr(post, "id")),
    title: attr(post, "post-title") || "untitled",
    author: attr(post, "author") || "unknown",
    subreddit: attr(post, "subreddit-prefixed-name") || `r/${attr(post, "subreddit-name")}`,
    score: attr(post, "score") || "0",
    created: attr(post, "created-timestamp"),
    permalink: attr(post, "permalink"),
    body: slotText(post, "text-body"),
    // A self-post's href points back at Reddit and says nothing; a link post's
    // is the whole point of it.
    linkUrl: linkUrl && !/(^|\.)redd(it|\.it)/.test(domain) ? linkUrl : undefined,
    comments: discussion,
    commentTotal: Number(attr(post, "comment-count")) || 0,
    commentsAvailable: available,
    clippedOn: new Date().toISOString().slice(0, 10),
  };
}

/** The thread this page *is*, comments included. */
export function clipOpenThread(): RedditClipping {
  const post = posts()[0];
  if (!post) throw new Error("No post on this page. Reload it and try again.");
  return toClipping(post, comments(document), true);
}

/**
 * A post from a listing, fetched by its permalink.
 *
 * Measured 2026-08-19: the fetched HTML carries the post and its full body
 * (3,849 chars on the sample) but **no** `<shreddit-comment>` at all — Reddit
 * renders those on the client. So this is honestly a post without its
 * discussion, and the clipping says exactly that rather than implying the
 * thread had none.
 */
export async function clipListedPost(permalink: string): Promise<RedditClipping> {
  const response = await fetch(permalink, { credentials: "include" });
  if (!response.ok) throw new Error(`Reddit answered ${response.status} for this post.`);
  const doc = new DOMParser().parseFromString(await response.text(), "text/html");
  const post = posts(doc)[0];
  if (!post) throw new Error("Reddit returned a page with no post in it.");
  return toClipping(post, [], false);
}
