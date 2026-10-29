// Clips a YouTube video into a rendered Markdown clipping, from anywhere.
//
// Innertube POSTs and no HTML parsing beyond the client version:
//   player     -> title, author, description, publish date
//   get_panel  -> transcript segments
//   next       -> comments and their replies, only when asked for
//   browse     -> the videos a playlist holds, only when one is selected
//
// Measured 2026-08-18. The older `get_transcript` endpoint now answers
// `400 FAILED_PRECONDITION` for every request shape, including from inside
// youtube.com's own origin with the page's real INNERTUBE_CONTEXT. `get_panel`
// is what the transcript panel itself calls.
//
// Lives outside the content script because a bulk clip runs for hours in the
// worker, and a tab can be closed, reloaded or discarded under it. None of
// these calls needs the page: no API key, no visitorData and no cookies
// (measured 2026-10-29, 16 cookieless requests from Node, every one a 200).
//
// Every request goes out one at a time through the `Call` it is handed, which
// is where the worker paces them. yt-dlp and youtube-comment-downloader both
// read comment pages and reply threads strictly in sequence; nothing does
// this in parallel.

import {
  clippingPath,
  renderYouTubeClipping,
  watchUrl,
  type Clipping,
  type Comment,
  type TranscriptSegment,
} from "./markdown";
import type { PageItem } from "./messages";
import { scale } from "./youtube";

const ORIGIN = "https://www.youtube.com";
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
/** A request that has not answered by now is not going to. */
const REQUEST_TIMEOUT_MS = 20_000;
/** What YouTube answers in place of a video when it has decided you are a script. */
const BOT_CHECK = /not a bot/i;

/** The four paths there are. Nothing a page hands over composes a URL. */
export type Endpoint = "player" | "get_panel" | "next" | "browse";
export type Call = <T>(path: Endpoint, body: Record<string, unknown>) => Promise<T>;

/**
 * Why a request failed, in the terms the queue acts on. `rate` and `bot` stop
 * the whole queue, because every request after them earns the same answer and
 * yt-dlp's maintainers read a YouTube 429 as an IP block rather than a limit.
 * `stale` is the worker's own: the run was cleared, so nothing more is asked
 * or written for it. `other` is this one video's problem.
 */
export class ClipError extends Error {
  constructor(
    readonly kind: "rate" | "bot" | "stale" | "other",
    message: string,
  ) {
    super(message);
  }
}

const stops = (error: unknown) => error instanceof ClipError && error.kind !== "other";

/**
 * What a request names when the homepage did not say: a version YouTube ran
 * on 2026-10-29. Innertube goes on accepting a version for months, which is
 * why yt-dlp ships its WEB client with one written in.
 *
 * ponytail: a fixed fallback. Bump it with a live reading when requests start
 * failing with it; the homepage read covers every machine that can reach it.
 */
const FALLBACK_VERSION = "2.20261029.01.00";

/** The client version YouTube's own page runs, which every request names. */
export function readClientVersion(html: string): string | undefined {
  const version = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1];
  return version && /^\d+\.\d+[\d.]*$/.test(version) && version.length <= 32 ? version : undefined;
}

export async function fetchClientVersion(): Promise<string> {
  const response = await fetch(`${ORIGIN}/?hl=en`, {
    credentials: "omit",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 429) throw new ClipError("rate", "YouTube is limiting requests (429).");
  // A consent page, which a cookieless visit from the EU may get instead of
  // the homepage, holds no version.
  return (response.ok ? readClientVersion(await response.text()) : undefined) ?? FALLBACK_VERSION;
}

/**
 * One innertube request with no cookies: the job never acts as the person, and
 * a cookieless request is what was measured.
 */
export function innertube(clientVersion: string): Call {
  return async <T>(path: Endpoint, body: Record<string, unknown>) => {
    let response: Response;
    try {
      response = await fetch(`${ORIGIN}/youtubei/v1/${path}?prettyPrint=false`, {
        method: "POST",
        credentials: "omit",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion, hl: "en", gl: "US" } }, ...body }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new ClipError("other", `YouTube's ${path} endpoint did not answer.`);
    }
    if (response.status === 429) throw new ClipError("rate", "YouTube is limiting requests (429).");
    if (!response.ok) throw new ClipError("other", `YouTube's ${path} endpoint answered ${response.status}.`);
    // A consent page or an interstitial is a 200 with HTML in it, and the
    // parser's message would quote it.
    return (await response.json().catch(() => {
      throw new ClipError("other", `YouTube's ${path} endpoint answered with something other than data.`);
    })) as T;
  };
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

interface PlayerResponse {
  playabilityStatus?: { status?: string; reason?: string };
  videoDetails?: { title?: string; author?: string; shortDescription?: string };
  microformat?: { playerMicroformatRenderer?: { publishDate?: string; uploadDate?: string } };
}

/**
 * The bot check arrives as a 200: `LOGIN_REQUIRED` with youtube-transcript-api's
 * "Sign in to confirm you're not a bot" as the reason. A private or removed
 * video also says LOGIN_REQUIRED or UNPLAYABLE, with another reason, and that
 * is only this video's problem.
 */
/**
 * The bot check, and only that. A cookieless WEB player answers UNPLAYABLE
 * "Video unavailable" for ordinary videos and still sends their details
 * (measured 2026-10-29, three of three), so the status says nothing about
 * whether the clip can be made. A private or removed video arrives with no
 * details or no transcript, and fails on that.
 */
export function playability(player: PlayerResponse): ClipError | undefined {
  if (BOT_CHECK.test(player.playabilityStatus?.reason ?? "")) return new ClipError("bot", "YouTube asked to confirm this is not a bot.");
  return undefined;
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

interface Discussion {
  comments: Comment[];
  total?: string;
  /** Some of what was asked for could not be read, and the file says so. */
  incomplete?: boolean;
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
 *
 * A rate limit or bot check is thrown, never swallowed: a clip that quietly
 * lost its comments to one would be marked done and look complete. Anything
 * else that goes wrong past the first page keeps what was read and says so.
 */
async function fetchComments(call: Call, videoId: string, step: (label: string) => void): Promise<Discussion> {
  step("comments");
  const watch = await call<unknown>("next", { videoId });
  const keys = collect<{ sectionIdentifier?: string }>(watch, "itemSectionRenderer")
    .filter((section) => section.sectionIdentifier === COMMENT_SECTION)
    .flatMap((section) => continuations(section));

  const threads: Thread[] = [];
  const seen = new Set<string>();
  let total: string | undefined;
  let next: string | undefined;
  let incomplete = false;

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
    if (take(await call<unknown>("next", { continuation: key })) > 0) break;
  }
  // Comments turned off, or a video with none.
  if (threads.length === 0) return { comments: [] };

  for (let page = 1; page < COMMENT_PAGES && next; page++) {
    try {
      if (take(await call<unknown>("next", { continuation: next })) === 0) break;
    } catch (error) {
      if (stops(error)) throw error;
      incomplete = true;
      break;
    }
  }

  const wanted = threads
    .filter((thread) => thread.replies)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, REPLY_THREADS);
  const replies = new Map<string, Comment[]>();
  for (const [index, thread] of wanted.entries()) {
    step(`replies ${index + 1}/${wanted.length}`);
    try {
      const page = await call<unknown>("next", { continuation: thread.replies! });
      replies.set(thread.id, payloads(page).map((entity) => toComment(entity, 1)));
    } catch (error) {
      if (stops(error)) throw error;
      incomplete = true;
    }
  }

  return {
    comments: threads.flatMap((thread) => [thread.comment, ...(replies.get(thread.id) ?? [])]),
    total,
    incomplete,
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
 * continuation token. YouTube pages this at 100.
 *
 * ponytail: the first 100 of a longer playlist; follow the browse continuation
 * when a playlist past 100 is asked for.
 *
 * The lockups are read rather than every `videoId` in the payload: those same
 * ids appear again inside thumbnails and endpoints — 196 hits for those 38
 * videos — in an order that is not the playlist's.
 */
export async function playlistVideos(call: Call, playlistId: string): Promise<PageItem[]> {
  const payload = await call<unknown>("browse", { browseId: `VL${playlistId}` });
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
  if (unique.length === 0) throw new ClipError("other", "That playlist listed no videos. It may be private or empty.");
  return unique;
}

export async function clipVideo(
  call: Call,
  videoId: string,
  options: { grouped: boolean; comments: boolean; group?: string },
  step: (label: string) => void = () => {},
): Promise<Clipping> {
  step("details");
  const player = await call<PlayerResponse>("player", { videoId });
  const refused = playability(player);
  if (refused) throw refused;
  const details = player.videoDetails;
  if (!details?.title) throw new ClipError("other", `YouTube returned no details for ${videoId}.`);

  step("transcript");
  const panel = await call<unknown>("get_panel", { panelId: TRANSCRIPT_PANEL_ID, params: transcriptParams(videoId) });
  const segments = transcriptSegments(panel);
  if (segments.length === 0) throw new ClipError("other", "This video has no transcript.");

  // Comments are about 30 more requests and 3 to 4 times the tokens, so they
  // are asked for, never assumed. A video with them off is not a failed clip.
  let discussion: Discussion = { comments: [] };
  if (options.comments) {
    try {
      discussion = await fetchComments(call, videoId, step);
    } catch (error) {
      if (stops(error)) throw error;
      discussion = { comments: [], incomplete: true };
    }
  }

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
    commentsIncomplete: discussion.incomplete,
    clippedOn: new Date().toISOString().slice(0, 10),
  });

  return {
    // `group` is the folder the worker decided on — a playlist's own name, for
    // videos it opened out of one. It wins over the channel because it is the
    // thing the person actually picked, and the channel is in every header.
    path: clippingPath(details.title, options.group ?? (options.grouped ? author : undefined)),
    markdown,
    source: watchUrl(videoId),
    clippedAt: Date.now(),
    partial: discussion.incomplete || undefined,
  };
}
