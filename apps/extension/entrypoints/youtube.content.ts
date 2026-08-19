// Extracts a YouTube video into a rendered Markdown clipping.
//
// Two innertube POSTs and no HTML parsing beyond the client version:
//   player     -> title, author, description, publish date
//   get_panel  -> transcript segments
//
// Measured 2026-08-18. The older `get_transcript` endpoint now answers
// `400 FAILED_PRECONDITION` for every request shape, including from inside
// youtube.com's own origin with the page's real INNERTUBE_CONTEXT. `get_panel`
// is what the transcript panel itself calls.

import { browser, defineContentScript } from "#imports";
import {
  clippingPath,
  renderYouTubeClipping,
  watchUrl,
  type Clipping,
  type Comment,
  type TranscriptSegment,
} from "../src/markdown";
import type { NavSignal, PageReport, SiteRequest, SiteResponse } from "../src/messages";

const INNERTUBE = "https://www.youtube.com/youtubei/v1";
const TRANSCRIPT_PANEL_ID = "PAmodern_transcript_view";
/**
 * One page of comments, which is what YouTube itself serves first and what its
 * own ranking calls the top ones. Paging further means finding the page
 * continuation among the per-thread reply stubs, for comments nobody ranked
 * highly. Raise this only if a reading says the top of the thread was not
 * enough.
 */
const COMMENT_SECTION = "comment-item-section";
/** Requests go out one at a time; this is the pause between them. */
const CLIP_SPACING_MS = 400;

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
  properties?: { content?: { content?: string }; publishedTime?: string; replyLevel?: number };
  author?: { displayName?: string; isCreator?: boolean };
  toolbar?: { likeCountNotliked?: string };
}

/**
 * Comments are not in the watch payload; they arrive behind a continuation.
 * `next` for the video hands out that token, a second `next` spends it.
 *
 * The token cannot be built from the video id the way the transcript params
 * can, so this is two requests. Both tokens under the comments section are
 * tried because one of them is a stub that answers with nothing.
 */
async function fetchComments(videoId: string): Promise<{ comments: Comment[]; total?: string }> {
  const watch = await innertube<unknown>("next", { videoId });
  const tokens = collect<{ sectionIdentifier?: string }>(watch, "itemSectionRenderer")
    .filter((section) => section.sectionIdentifier === COMMENT_SECTION)
    .flatMap((section) =>
      collect<{ continuationEndpoint?: { continuationCommand?: { token?: string } } }>(section, "continuationItemRenderer"),
    )
    .map((item) => item.continuationEndpoint?.continuationCommand?.token)
    .filter((token): token is string => Boolean(token));

  for (const token of tokens) {
    const page = await innertube<unknown>("next", { continuation: token });
    const comments = collect<CommentPayload>(page, "commentEntityPayload")
      .filter((entity) => (entity.properties?.replyLevel ?? 0) === 0 && entity.properties?.content?.content)
      .map((entity) => ({
        author: entity.author?.displayName ?? "unknown",
        publishedTime: entity.properties?.publishedTime ?? "",
        likes: entity.toolbar?.likeCountNotliked || "0",
        text: entity.properties!.content!.content!,
        isCreator: entity.author?.isCreator === true,
      }));
    if (comments.length === 0) continue;
    const total = collect<{ countText?: { runs?: { text?: string }[] } }>(page, "commentsHeaderRenderer")
      .map((header) => header.countText?.runs?.map((run) => run.text).join(""))
      .find(Boolean);
    return { comments, total: total?.replace(/\s*comments?$/i, "") };
  }
  // Comments turned off, or a video with none.
  return { comments: [] };
}

async function clipVideo(videoId: string, grouped: boolean, comments: boolean): Promise<Clipping> {
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
    path: clippingPath(details.title, grouped ? author : undefined),
    markdown,
    source: watchUrl(videoId),
    clippedAt: Date.now(),
  };
}

/**
 * Every video the page has already loaded. A card links to the same video
 * twice — once from the thumbnail, whose text is the duration overlay, and once
 * from the title — so the longer text wins. Reading the href rather than a
 * class name is what survives YouTube's markup churn.
 *
 * Hidden anchors are skipped because YouTube keeps the page you came from in
 * the DOM: measured 2026-08-18, a channel's Videos tab reached by clicking
 * carries 46 video ids of which only the 30 real ones are visible. Without this
 * the listing shows the previous channel until you reload the page.
 */
function pageVideos(): PageReport["videos"] {
  const found = new Map<string, { title: string; duration?: string }>();
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>('a[href*="/watch?v="]')) {
    if (!anchor.checkVisibility()) continue;
    const id = new URL(anchor.href, location.origin).searchParams.get("v");
    if (!id) continue;
    const text = anchor.textContent?.trim() ?? "";
    // A link inside a description or community post carries the URL as its own
    // text, and a URL outruns most titles, so it would win the contest below.
    // Observed once on a channel page, as a tray row titled
    // "https://www.youtube.com/watch?v=xsVTq…". Skipping the anchor entirely
    // also drops ids that appear only in prose, which are not videos this page
    // loaded; measured on a channel page (22 videos) and a search page (23),
    // that dropped none of them.
    if (/^(https?:\/\/|www\.)/i.test(text)) continue;
    const entry = found.get(id) ?? { title: "" };
    // The thumbnail link's text is the duration overlay, so the longer of a
    // card's two links is the title and the clock-shaped one is the length.
    if (text.length > entry.title.length) entry.title = text;
    if (/^(\d+:)?\d?\d:\d\d$/.test(text)) entry.duration = text;
    found.set(id, entry);
  }
  return [...found].map(([id, { title, duration }]) => ({ id, title: title || id, duration }));
}

function report(): PageReport {
  if (location.pathname === "/watch") {
    const id = new URL(location.href).searchParams.get("v");
    return { kind: id ? "watch" : "other", videos: id ? [{ id, title: document.title.replace(/ - YouTube$/, "") }] : [] };
  }
  const videos = pageVideos();
  return { kind: videos.length ? "list" : "other", videos };
}

async function handle(request: SiteRequest): Promise<PageReport | Clipping[]> {
  if (request.type === "fc:page") return report();

  const clippings: Clipping[] = [];
  const grouped = request.ids.length > 1;
  for (const [index, id] of request.ids.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, CLIP_SPACING_MS));
    clippings.push(await clipVideo(id, grouped, request.comments));
  }
  return clippings;
}

export default defineContentScript({
  matches: ["*://*.youtube.com/*"],
  runAt: "document_idle",
  main() {
    // A YouTube navigation replaces the page without a load Chrome reports, so
    // the panel would keep showing the page you came from. YouTube announces
    // its own; the panel debounces because the DOM lands after the event.
    //
    // ponytail: YouTube's own event. A site without one needs a history patch
    // or a URL poll — write that when the second such handler arrives, not now.
    document.addEventListener("yt-navigate-finish", () => {
      void browser.runtime.sendMessage({ type: "fc:nav" } satisfies NavSignal).catch(() => {});
    });

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const request = message as SiteRequest;
      if (request?.type !== "fc:page" && request?.type !== "fc:clip") return;
      handle(request).then(
        (value) => sendResponse({ ok: true, value } satisfies SiteResponse<PageReport | Clipping[]>),
        (error: unknown) =>
          sendResponse({ ok: false, error: String((error as Error)?.message ?? error) } satisfies SiteResponse<never>),
      );
      return true;
    });
  },
});
