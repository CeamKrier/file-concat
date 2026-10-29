// Says what a YouTube page lists, and scrolls it for more when asked.
//
// Clipping itself is not done here any more. A bulk clip runs for hours, and
// this tab can be closed, reloaded or discarded under it, so the worker calls
// innertube directly (`src/youtube-clip.ts`). What only the page can answer
// stays: which videos it has loaded, and loading more of them.

import { browser, defineContentScript } from "#imports";
import { announceChanges } from "../src/announce";
import { loadMore } from "../src/more";
import type { PageItem, PageReport, SiteRequest, SiteResponse } from "../src/messages";
import { isPlaylistsTab, linkTarget } from "../src/youtube";
import { innertube, playlistVideos, readClientVersion } from "../src/youtube-clip";

/**
 * The client version is the only thing we need from the page, and an inline
 * script carries it. A content script runs in the isolated world, so
 * `window.ytcfg` is out of reach.
 */
function clientVersion(): string {
  for (const script of document.scripts) {
    const version = readClientVersion(script.textContent ?? "");
    if (version) return version;
  }
  throw new Error("Could not read the YouTube client version from this page. Try reloading it.");
}

/**
 * Every video the page has already loaded — or, on the Playlists tab, every
 * playlist, which is a set to open out rather than a thing to clip.
 *
 * A card links to the same target twice, once from the thumbnail and once from
 * the title, so the longest of a target's texts is its title and the runner-up
 * is the thumbnail's overlay badge. Reading the href rather than a class name
 * is what survives YouTube's markup churn.
 *
 * Hidden anchors are skipped because YouTube keeps the page you came from in
 * the DOM: measured 2026-08-18, a channel's Videos tab reached by clicking
 * carries 46 video ids of which only the 30 real ones are visible. Without this
 * the listing shows the previous channel until you reload the page.
 */
function pageItems(): PageReport["items"] {
  const pageList = new URL(location.href).searchParams.get("list");
  const playlists = isPlaylistsTab(location.pathname);
  const found = new Map<string, string[]>();
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>('a[href*="/watch?v="]')) {
    if (!anchor.checkVisibility()) continue;
    const target = linkTarget(anchor.href, pageList);
    if (!target) continue;
    // One page, one kind. Off the Playlists tab a playlist card sits among real
    // videos — a search page, a channel's home shelves — and listing it would
    // put a name in the panel that clips something else, so it is left out
    // rather than misdescribed.
    if ((target.kind === "playlist") !== playlists) continue;
    const text = anchor.textContent?.trim() ?? "";
    // A link inside a description or community post carries the URL as its own
    // text, and a URL outruns most titles, so it would win the contest below.
    // Observed once on a channel page, as a tray row titled
    // "https://www.youtube.com/watch?v=xsVTq…". Skipping the anchor entirely
    // also drops ids that appear only in prose, which are not videos this page
    // loaded; measured on a channel page (22 videos) and a search page (23),
    // that dropped none of them.
    if (/^(https?:\/\/|www\.)/i.test(text)) continue;
    found.set(target.id, [...(found.get(target.id) ?? []), text]);
  }
  return [...found].map(([id, texts]) => {
    const [title, second] = [...texts].sort((a, b) => b.length - a.length);
    // A playlist's badge is YouTube's own wording in the viewer's language
    // ("7 videos", "7 video"), so it is taken by position. A video's is a clock
    // and can be recognised, which keeps a stray second line off those rows.
    const meta = playlists ? second : texts.find((text) => /^(\d+:)?\d?\d:\d\d$/.test(text));
    return { id, title: title || id, meta: meta || undefined, expand: playlists || undefined };
  });
}

const OPTION = {
  label: "Include comments",
  // Measured 2026-09-01 through the built extension: about 30 requests a video,
  // and the clipping went 3,622 -> 12,898 tokens on the Stanford commencement
  // address and 2,377 -> 7,238 on a shorter talk. The time is the worker's
  // pace now, one request at a time.
  hint: "Top 60 and their first replies. About 30 requests a video, so a large batch takes a while, and 3 to 4 times the clipping's size.",
};

function report(): PageReport {
  if (location.pathname === "/watch") {
    const id = new URL(location.href).searchParams.get("v");
    if (!id) return { site: "youtube", noun: "video", kind: "other", items: [] };
    return {
      site: "youtube",
      noun: "video",
      kind: "single",
      items: [{ id, title: document.title.replace(/ - YouTube$/, "") }],
      option: OPTION,
    };
  }
  const items = pageItems();
  return {
    site: "youtube",
    // A page of playlists is counted in playlists, so the panel says "Clip 3
    // playlists". What arrives is still one file per video.
    noun: isPlaylistsTab(location.pathname) ? "playlist" : "video",
    kind: items.length ? "list" : "other",
    items,
    option: items.length ? OPTION : undefined,
    // Every YouTube listing is lazy: a channel's Videos tab holds 30 until it
    // is scrolled, and the panel can only offer what the page has loaded.
    more: items.length > 0,
  };
}

async function handle(request: SiteRequest): Promise<PageReport | PageItem[]> {
  if (request.type === "fc:more") {
    // The raw anchor count, the same number `announceChanges` watches: it moves
    // as soon as a continuation lands, without a style pass per anchor.
    await loadMore(() => document.querySelectorAll('a[href*="/watch?v="]').length);
    return report();
  }
  // The panel's look inside a playlist row: one request, asked for by a press.
  if (request.type === "fc:expand") return playlistVideos(innertube(clientVersion()), request.id);
  return report();
}

export default defineContentScript({
  matches: ["*://*.youtube.com/*"],
  runAt: "document_idle",
  main() {
    // A navigation replaces the page without a load Chrome reports, and
    // scrolling a channel loads more videos without any navigation at all.
    // Both are "where am I, and how much is here".
    //
    // The count in the key is the raw anchor count, not `pageVideos().length`:
    // this only needs to change when the real count changes, and
    // `checkVisibility()` on every anchor forces a style/layout pass every
    // 800ms for the tab's whole life. The panel re-asks with `fc:page` on
    // change and gets the filtered, deduped list from `pageVideos()` then.
    announceChanges(
      () => `${location.pathname}${location.search}:${document.querySelectorAll('a[href*="/watch?v="]').length}`,
    );

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const request = message as SiteRequest;
      if (request?.type !== "fc:page" && request?.type !== "fc:expand" && request?.type !== "fc:more") return;
      handle(request).then(
        (value) => sendResponse({ ok: true, value } satisfies SiteResponse<PageReport | PageItem[]>),
        (error: unknown) =>
          sendResponse({ ok: false, error: String((error as Error)?.message ?? error) } satisfies SiteResponse<never>),
      );
      return true;
    });
  },
});
