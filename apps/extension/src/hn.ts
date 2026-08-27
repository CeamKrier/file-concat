// Hacker News: the cheapest discussion source there is.
//
// `hn.algolia.com/api/v1/items/<id>` hands over the entire comment tree in one
// request, already nested, with no auth and no paging. Everything else here is
// reading the front page's table, which has not changed in a decade.

import { browser } from "#imports";
import type { HnClipping, HnComment } from "./markdown";
import type { FetchRequest, SiteResponse } from "./messages";

const API = "https://hn.algolia.com/api/v1/items";

interface AlgoliaNode {
  id: number;
  created_at: string;
  author: string | null;
  title: string | null;
  url: string | null;
  text: string | null;
  points: number | null;
  type: string;
  children: AlgoliaNode[];
}

// `id` alone also matches /user, /threads, /submitted and /favorites, which
// all carry it for a username. Without the path check, "Clip this thread" was
// offered on those pages and clipItem() then asked Algolia for a user id.
export const isItem = (search = location.search, path = location.pathname) =>
  path === "/item" && new URLSearchParams(search).has("id");
export const itemId = (search = location.search) => new URLSearchParams(search).get("id") ?? "";
export const isFrontPage = (path = location.pathname) =>
  ["/", "/news", "/newest", "/best", "/ask", "/show", "/front"].includes(path);

/** A front-page row and the subtext line under it, which is a sibling. */
export function stories() {
  return [...document.querySelectorAll("tr.athing")].map((row) => {
    const subtext = row.nextElementSibling?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const points = subtext.match(/(\d+) points?/)?.[1];
    const comments = subtext.match(/(\d+)\s+comments?/)?.[1];
    return {
      id: row.id,
      title: row.querySelector(".titleline > a")?.textContent?.trim() || row.id,
      meta: [points ? `${points} points` : null, comments ? `${comments} comments` : null].filter(Boolean).join(" - "),
    };
  });
}

/**
 * HTML entities and `<p>` tags, which is what Algolia stores comment bodies as.
 * A textarea decodes entities without running anything, which `innerHTML` on a
 * live element would.
 */
function plain(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*p\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");
  const decoder = document.createElement("textarea");
  decoder.innerHTML = withBreaks;
  return decoder.value.trim();
}

function flatten(node: AlgoliaNode, depth: number, into: HnComment[]): void {
  for (const child of node.children ?? []) {
    // A dead or deleted comment has no author and no text; its replies live on.
    if (child.type === "comment" && child.text && child.author) {
      into.push({
        author: child.author,
        created: child.created_at,
        depth,
        text: plain(child.text),
      });
    }
    flatten(child, depth + 1, into);
  }
}

export async function clipItem(id: string): Promise<HnClipping> {
  // Hacker News serves `default-src 'self'`, so this content script cannot
  // reach Algolia itself. The worker can.
  const request: FetchRequest = { type: "fc:fetch", url: `${API}/${id}` };
  const response = (await browser.runtime.sendMessage(request)) as SiteResponse<string> | undefined;
  if (!response) throw new Error("The extension's worker did not answer. Reload the extension.");
  if (!response.ok) throw new Error(response.error);

  const root = JSON.parse(response.value) as AlgoliaNode;
  if (!root?.id) throw new Error(`Hacker News has no item ${id}.`);

  const comments: HnComment[] = [];
  flatten(root, 0, comments);
  return {
    id: String(root.id),
    title: root.title?.trim() || `Item ${root.id}`,
    author: root.author ?? "unknown",
    created: root.created_at,
    points: root.points ?? 0,
    url: root.url ?? undefined,
    text: root.text ? plain(root.text) : "",
    comments,
    clippedOn: new Date().toISOString().slice(0, 10),
  };
}
