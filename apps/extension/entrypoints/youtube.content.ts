// Extracts a YouTube video into a rendered Markdown clipping.
//
// Two innertube POSTs per video and no HTML parsing beyond the client version:
//   player     -> title, author, description, publish date
//   get_panel  -> transcript segments
//   browse     -> the videos a playlist holds, only when one is selected
//
// Measured 2026-08-18. The older `get_transcript` endpoint now answers
// `400 FAILED_PRECONDITION` for every request shape, including from inside
// youtube.com's own origin with the page's real INNERTUBE_CONTEXT. `get_panel`
// is what the transcript panel itself calls.

import { browser, defineContentScript } from "#imports";
import { announceChanges } from "../src/announce";
import { loadMore } from "../src/more";
import {
  clippingPath,
  renderYouTubeClipping,
  watchUrl,
  type Clipping,
  type Comment,
  type TranscriptSegment,
} from "../src/markdown";
import type { PageItem, PageReport, SiteRequest, SiteResponse } from "../src/messages";
import { isPlaylistsTab, linkTarget, scale } from "../src/youtube";

const INNERTUBE = "https://www.youtube.com/youtubei/v1";
const TRANSCRIPT_PANEL_ID = "PAmodern_transcript_view";
const COMMENT_SECTION = "comment-item-section";
/**
 * How many pages of top-level comments one clip spends. YouTube serves 20 a
 * page, so this is 60 — about as far as a person scrolls before they stop.
 * Measured 2026-09-01: page-level continuations keep coming well past this, so
 * the cap is the only thing that ends it.
 */
const COMMENT_PAGES = 3;
/**
 * How many threads get their replies read, most-replied first. One request
 * each, and one page is 10 replies — which is exactly what YouTube's own
 * "N replies" opens with. Deeper paging exists (measured: 10, then ~50 a page)
 * and is not spent here, so a 963-reply thread contributes 10 and says so.
 */
const REPLY_THREADS = 25;
/** Requests in flight at once, for the reply pass. */
const LANES = 6;

interface PlayerResponse {
  videoDetails?: { title?: string; author?: string; shortDescription?: string };
  microformat?: { playerMicroformatRenderer?: { publishDate?: string; uploadDate?: string } };
}

let clientVersion: string | undefined;

/**
 * A content script runs in the isolated world, so `window.ytcfg` is out of
 * reach. The client version is the only thing we need from the page, and an
 * inline script carries it. No API key and no visitorData: both calls work
 * without them.
 */
function context() {
  if (!clientVersion) {
    for (const script of document.scripts) {
      const match = script.textContent?.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/);
      if (match) {
        clientVersion = match[1];
        break;
      }
    }
  }
  if (!clientVersion) throw new Error("Could not read the YouTube client version from this page. Try reloading it.");
  return { client: { clientName: "WEB", clientVersion, hl: "en", gl: "US" } };
}

async function innertube<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${INNERTUBE}/${path}?prettyPrint=false`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ context: context(), ...body }),
  });
  if (!response.ok) throw new Error(`YouTube's ${path} endpoint answered ${response.status}.`);
  return (await response.json()) as T;
}

/**
 * The panel request wants a protobuf blob that is just the video id in a
 * wrapper, so we build it rather than scraping `getTranscriptEndpoint.params`
 * out of a watch page — which is what makes clipping a video you are not
 * watching a single request instead of a page fetch.
 *
 * Bytes: field 149 (length-delimited) wrapping { 1: videoId, 3: 2 }.
 *
 * ponytail: hand-built protobuf. If YouTube adds a field, capture the live
 * request from the transcript panel again and copy the new shape.
 */
function transcriptParams(videoId: string): string {
  const id = [...new TextEncoder().encode(videoId)];
  const inner = [0x0a, id.length, ...id, 0x18, 0x02];
  return btoa(String.fromCharCode(0xaa, 0x09, inner.length, ...inner));
}

/**
 * Collects every value stored under `key`, wherever it sits. The nesting around
 * these renderers is YouTube's business and changes; the key names are the part
 * that has held.
 */
function collect<T>(payload: unknown, key: string): T[] {
  const found: T[] = [];
  JSON.stringify(payload, (k, value) => {
    if (k === key) found.push(value as T);
    return value;
  });
  return found;
}

function transcriptSegments(payload: unknown): TranscriptSegment[] {
  return collect<{ timestamp?: string; simpleText?: string }>(payload, "transcriptSegmentViewModel")
    .filter((segment) => segment.timestamp && segment.simpleText)
    .map((segment) => ({ timestamp: segment.timestamp!, text: segment.simpleText! }));
}

interface CommentPayload {
  properties?: { commentId?: string; content?: { content?: string }; replyLevel?: number };
  author?: { displayName?: string; isCreator?: boolean };
  toolbar?: { likeCountNotliked?: string; replyCount?: string };
}

/** Every continuation under a node, whatever renderer holds it. */
function continuations(node: unknown): string[] {
  return collect<{ continuationEndpoint?: { continuationCommand?: { token?: string } } }>(
    node,
    "continuationItemRenderer",
  )
    .map((item) => item.continuationEndpoint?.continuationCommand?.token)
    .filter((token): token is string => Boolean(token));
}

function toComment(entity: CommentPayload, depth: number): Comment {
  return {
    author: entity.author?.displayName ?? "unknown",
    // Blank, not absent, on a comment nobody liked — measured on replies, where
    // it rendered as "-   likes -". Trimmed before the fallback so a zero says
    // zero.
    likes: entity.toolbar?.likeCountNotliked?.trim() || "0",
    text: entity.properties!.content!.content!,
    isCreator: entity.author?.isCreator === true,
    depth,
  };
}

const payloads = (page: unknown) =>
  collect<CommentPayload>(page, "commentEntityPayload").filter((entity) => entity.properties?.content?.content);

interface Thread {
  id: string;
  comment: Comment;
  /** The thread's own continuation, which answers with its first 10 replies. */
  replies?: string;
  /** How many replies YouTube says it has, only ever compared with another. */
  weight: number;
}

/**
 * One page of comments, read as threads.
 *
 * The comments themselves arrive as entity payloads in a flat batch, keyed by
 * id, while the thread renderers carry the order and the per-thread reply
 * continuation — so the two are joined on `commentId` rather than by position.
 */
function readPage(page: unknown): { threads: Thread[]; next?: string; total?: string } {
  const entities = new Map(
    payloads(page)
      .filter((entity) => entity.properties?.commentId)
      .map((entity) => [entity.properties!.commentId!, entity]),
  );

  const threads: Thread[] = [];
  const spent: string[] = [];
  for (const thread of collect<{ replies?: unknown }>(page, "commentThreadRenderer")) {
    const view = collect<{ commentId?: string }>(thread, "commentViewModel").find((model) => model.commentId);
    const entity = view?.commentId ? entities.get(view.commentId) : undefined;
    if (!view?.commentId || !entity) continue;
    const replies = thread.replies ? continuations(thread.replies)[0] : undefined;
    if (replies) spent.push(replies);
    threads.push({
      id: view.commentId,
      comment: { ...toComment(entity, 0), replyTotal: entity.toolbar?.replyCount || undefined },
      replies,
      weight: scale(entity.toolbar?.replyCount),
    });
  }

  // What is left once the per-thread ones are accounted for is the page's own
  // "more comments" continuation — the thing scrolling the page would spend.
  const next = continuations(page).find((key) => !spent.includes(key));
  const total = collect<{ countText?: { runs?: { text?: string }[] } }>(page, "commentsHeaderRenderer")
    .map((header) => header.countText?.runs?.map((run) => run.text).join(""))
    .find(Boolean);
  return { threads, next, total: total?.replace(/\s*comments?$/i, "") };
}

/** Runs `work` over `items` a few at a time, so 25 reply pages are not 25 waits. */
async function inLanes<T>(items: T[], work: (item: T) => Promise<void>): Promise<void> {
  for (let index = 0; index < items.length; index += LANES) {
    await Promise.all(items.slice(index, index + LANES).map(work));
  }
}

/**
 * Comments are not in the watch payload; they arrive behind a continuation.
 * `next` for the video hands out that token, a second `next` spends it, and
 * every page hands back the next one — which is what scrolling the comments
 * spends, so a clip that stopped at the first page stopped where the page did
 * before anyone scrolled.
 *
 * Replies are not in those pages at all (measured 2026-09-01: 20 threads,
 * `replyLevel` 0 for every entity, 19 of them carrying a replies continuation).
 * Each is its own request, so they go to the threads with the most replies and
 * stop at {@link REPLY_THREADS}.
 *
 * Both tokens under the comments section are tried because one of them is a
 * stub that answers with nothing.
 */
async function fetchComments(videoId: string): Promise<{ comments: Comment[]; total?: string }> {
  const watch = await innertube<unknown>("next", { videoId });
  const keys = collect<{ sectionIdentifier?: string }>(watch, "itemSectionRenderer")
    .filter((section) => section.sectionIdentifier === COMMENT_SECTION)
    .flatMap((section) => continuations(section));

  const threads: Thread[] = [];
  const seen = new Set<string>();
  let total: string | undefined;
  let next: string | undefined;

  const take = (page: unknown) => {
    const read = readPage(page);
    total ??= read.total;
    next = read.next;
    const fresh = read.threads.filter((thread) => !seen.has(thread.id));
    for (const thread of fresh) seen.add(thread.id);
    threads.push(...fresh);
    return fresh.length;
  };

  for (const key of keys) {
    if (take(await innertube<unknown>("next", { continuation: key })) > 0) break;
  }
  // Comments turned off, or a video with none.
  if (threads.length === 0) return { comments: [] };

  for (let page = 1; page < COMMENT_PAGES && next; page++) {
    if (take(await innertube<unknown>("next", { continuation: next })) === 0) break;
  }

  const wanted = new Set(
    [...threads]
      .filter((thread) => thread.replies)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, REPLY_THREADS)
      .map((thread) => thread.id),
  );
  const replies = new Map<string, Comment[]>();
  await inLanes(
    threads.filter((thread) => wanted.has(thread.id)),
    async (thread) => {
      // One thread's replies failing is not the clip failing.
      const page = await innertube<unknown>("next", { continuation: thread.replies! }).catch(() => undefined);
      if (page) replies.set(thread.id, payloads(page).map((entity) => toComment(entity, 1)));
    },
  );

  return {
    comments: threads.flatMap((thread) => [thread.comment, ...(replies.get(thread.id) ?? [])]),
    total,
  };
}

interface Lockup {
  contentId?: string;
  contentType?: string;
  metadata?: { lockupMetadataViewModel?: { title?: { content?: string } } };
}

/**
 * The videos a playlist holds, in its own order.
 *
 * `browse` on `VL<playlistId>` is the request the playlist page itself makes,
 * so this needs no page fetch and no host the manifest does not already carry.
 * Measured 2026-08-22: a 38-video playlist answers with 38 lockups and no
 * continuation token. YouTube pages this at 100, above anything the worker will
 * take in one batch, so there is no paging here.
 *
 * The lockups are read rather than every `videoId` in the payload: those same
 * ids appear again inside thumbnails and endpoints — 196 hits for those 38
 * videos — in an order that is not the playlist's.
 */
async function playlistVideos(playlistId: string): Promise<PageItem[]> {
  const payload = await innertube<unknown>("browse", { browseId: `VL${playlistId}` });
  const videos = collect<Lockup>(payload, "lockupViewModel")
    .filter(
      (lockup): lockup is Lockup & { contentId: string } =>
        lockup.contentType === "LOCKUP_CONTENT_TYPE_VIDEO" && Boolean(lockup.contentId),
    )
    .map((lockup) => ({
      id: lockup.contentId,
      title: lockup.metadata?.lockupMetadataViewModel?.title?.content ?? lockup.contentId,
    }));
  // A playlist can hold the same video twice. The tray is keyed by id and would
  // collapse them anyway, so dropping them here keeps the count honest.
  const unique = [...new Map(videos.map((video) => [video.id, video])).values()];
  if (unique.length === 0) throw new Error("That playlist listed no videos. It may be private or empty.");
  return unique;
}

async function clipVideo(videoId: string, grouped: boolean, comments: boolean, group?: string): Promise<Clipping> {
  const [player, panel, discussion] = await Promise.all([
    innertube<PlayerResponse>("player", { videoId }),
    innertube<unknown>("get_panel", { panelId: TRANSCRIPT_PANEL_ID, params: transcriptParams(videoId) }),
    // Comments are two extra requests and about 45% more tokens, so they are
    // asked for, never assumed. A video with them off is not a failed clip.
    comments
      ? fetchComments(videoId).catch(() => ({ comments: [] as Comment[], total: undefined }))
      : { comments: [] as Comment[], total: undefined },
  ]);

  const details = player.videoDetails;
  if (!details?.title) throw new Error(`YouTube returned no details for ${videoId}.`);

  const segments = transcriptSegments(panel);
  if (segments.length === 0) throw new Error(`"${details.title}" has no transcript.`);

  const author = details.author ?? "Unknown";
  const micro = player.microformat?.playerMicroformatRenderer;
  const markdown = renderYouTubeClipping({
    videoId,
    title: details.title,
    author,
    description: details.shortDescription ?? "",
    publishDate: micro?.publishDate ?? micro?.uploadDate ?? "",
    segments,
    comments: discussion.comments,
    commentTotal: discussion.total,
    clippedOn: new Date().toISOString().slice(0, 10),
  });

  return {
    // `group` is the folder the worker decided on — a playlist's own name, for
    // videos it opened out of one. It wins over the channel because it is the
    // thing the person actually picked, and the channel is in every header.
    path: clippingPath(details.title, group ?? (grouped ? author : undefined)),
    markdown,
    source: watchUrl(videoId),
    clippedAt: Date.now(),
  };
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
  // Measured 2026-09-01 through the built extension: about 30 requests and 4-6
  // seconds a video, and the clipping went 3,622 -> 12,898 tokens on the
  // Stanford commencement address and 2,377 -> 7,238 on a shorter talk.
  hint: "Top 60 and their first replies. About 5s a video, and 3 to 4 times the clipping's size.",
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

async function handle(request: SiteRequest): Promise<PageReport | Clipping | PageItem[]> {
  if (request.type === "fc:page") return report();
  if (request.type === "fc:more") {
    // The raw anchor count, the same number `announceChanges` watches: it moves
    // as soon as a continuation lands, without a style pass per anchor.
    await loadMore(() => document.querySelectorAll('a[href*="/watch?v="]').length);
    return report();
  }
  if (request.type === "fc:expand") return playlistVideos(request.id);
  return clipVideo(request.id, request.grouped, request.option, request.group);
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
      if (
        request?.type !== "fc:page" &&
        request?.type !== "fc:clip" &&
        request?.type !== "fc:expand" &&
        request?.type !== "fc:more"
      )
        return;
      handle(request).then(
        (value) => sendResponse({ ok: true, value } satisfies SiteResponse<PageReport | Clipping | PageItem[]>),
        (error: unknown) =>
          sendResponse({ ok: false, error: String((error as Error)?.message ?? error) } satisfies SiteResponse<never>),
      );
      return true;
    });
  },
});
