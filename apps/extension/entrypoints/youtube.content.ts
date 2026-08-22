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
import {
  clippingPath,
  renderYouTubeClipping,
  watchUrl,
  type Clipping,
  type Comment,
  type TranscriptSegment,
} from "../src/markdown";
import type { PageItem, PageReport, SiteRequest, SiteResponse } from "../src/messages";
import { isPlaylistsTab, linkTarget } from "../src/youtube";

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
  hint: "Top 20 per video. Up to 45% more tokens on a short one.",
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
  };
}

async function handle(request: SiteRequest): Promise<PageReport | Clipping | PageItem[]> {
  if (request.type === "fc:page") return report();
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
      if (request?.type !== "fc:page" && request?.type !== "fc:clip" && request?.type !== "fc:expand") return;
      handle(request).then(
        (value) => sendResponse({ ok: true, value } satisfies SiteResponse<PageReport | Clipping | PageItem[]>),
        (error: unknown) =>
          sendResponse({ ok: false, error: String((error as Error)?.message ?? error) } satisfies SiteResponse<never>),
      );
      return true;
    });
  },
});
