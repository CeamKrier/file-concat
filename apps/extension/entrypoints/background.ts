// Owns the work, because the panel does not.
//
// The popup could do its own clipping: dismissing it was the user abandoning
// the batch. A side panel is closed the way a drawer is closed — while you keep
// working — so a batch has to survive it. Everything with a duration lives here
// and reports by writing `chrome.storage.local`; the panel is a view.
//
// The tray is the queue. A row is `queued` until one drain loop reaches it, and
// that loop always reads the next row from storage, so a worker Chrome shut
// down mid-run leaves nothing behind that Resume cannot pick up again.

import { browser, defineBackground } from "#imports";
import { uniquePaths, type Clipping } from "../src/markdown";
import {
  JOB_KEY,
  SENT_KEY,
  SENT_TTL_MS,
  STATUS_KEY,
  TRAY_KEY,
  type FetchRequest,
  type Job,
  type PageItem,
  type PanelRequest,
  type PushAnswer,
  type PushRequest,
  type SentItem,
  type SiteRequest,
  type SiteResponse,
  type StartItem,
  type Status,
  type TrayItem,
} from "../src/messages";
import { chunk, nextSlot, pickNext, validYouTubeId } from "../src/queue";
import { ClipError, clipVideo, fetchClientVersion, innertube, playlistVideos, type Call } from "../src/youtube-clip";

/**
 * How many rows can wait at once. A bound has to exist, and it is said out
 * loud when reached; it sits above the 800 and 500 that Tubio and ScriptHaul
 * take per job, and a channel page loads about 360 a press.
 */
const QUEUE_LIMIT = 1_000;
/**
 * The gap between two YouTube requests is this plus up to this again. Measured
 * 2026-10-29 from Node with no cookies at this pace: 50 videos with comments,
 * 1,369 requests in 2,426 s, every one a 200, no 429 and no bot check. That is
 * 27 requests and 48 s a video, about 75 videos an hour; without comments a
 * video is two requests.
 */
const PACE_MS = 1_000;
/** The web app's own caps on one push (`apps/web/src/hooks/use-clipper-push.ts`). */
const PUSH_MAX_FILES = 200;
const PUSH_MAX_CHARS = 4_000_000;
const TITLE_MAX = 300;
/** Consecutive failures that stop the queue: one bad video is a video, five is the connection. */
const FAILURES_TO_STOP = 5;
/** Between two clips of a tab site, as before the queue: those sites were never limited. */
const CLIP_SPACING_MS = 400;
const NOTE_ID = "fc-job";
const FILECONCAT_TABS = ["https://fileconcat.com/*", "http://localhost/*"];
const FILECONCAT_URL = "https://fileconcat.com/";
/** 24 x 250ms: enough for a cold dev server to come up and inject the bridge. */
const PUSH_ATTEMPTS = 24;
const PUSH_RETRY_MS = 250;
/**
 * A tab that has been open for a while either has the bridge in it or never
 * will — Chrome rejects `sendMessage` immediately when nothing is listening —
 * so retrying a candidate only buys the one caught mid-navigation. Two attempts
 * is that; the full 24 would be six seconds of nothing per wrong tab, and
 * `tabs.query` can hand back several.
 */
const CANDIDATE_ATTEMPTS = 2;
/**
 * How long the bridge waits for the page to take the batch. A candidate is
 * already loaded, so `ready` is a postMessage round trip away and 1.5s is a
 * wide margin — and this one is paid again for every wrong tab, so it cannot be
 * generous. A tab opened a moment ago has to hydrate first, which on a cold dev
 * server is seconds, and that wait is only ever paid once.
 */
const CANDIDATE_WAIT_MS = 1_500;
const FRESH_TAB_WAIT_MS = 8_000;
/** `fc:fetch` runs with this extension's own permissions and cookies, so a
 *  content script cannot point it at an arbitrary host — only the ones the
 *  handlers actually call. */
const FETCH_ALLOWLIST = ["hn.algolia.com"];

const read = async (): Promise<TrayItem[]> => {
  const stored = await browser.storage.local.get(TRAY_KEY);
  return Array.isArray(stored[TRAY_KEY]) ? (stored[TRAY_KEY] as TrayItem[]) : [];
};

/**
 * Newest first, one row per id: re-clipping a video replaces its row. Nothing
 * is dropped for room: the tray holds only work not yet sent, so a row cut for
 * space was a clip lost.
 *
 * ponytail: the whole tray is rewritten on every change, clippings included.
 * At the queue's pace that is two writes a video; move the clippings to keys of
 * their own if a large tray ever makes those writes slow.
 */
const write = (items: TrayItem[]) =>
  browser.storage.local.set({
    [TRAY_KEY]: [...new Map(items.map((item) => [item.id, item])).values()].sort((a, b) => b.addedAt - a.addedAt),
  });

/**
 * Every change to the tray, one after another. The loop, a send, a remove and
 * a retry all read and rewrite the same array, and an hours-long run makes it
 * likely that two of them overlap; in turn, none can undo another.
 */
let tail: Promise<unknown> = Promise.resolve();
function mutate(change: (items: TrayItem[]) => TrayItem[]): Promise<TrayItem[]> {
  const run = tail.then(async () => {
    const next = change(await read());
    await write(next);
    return next;
  });
  tail = run.catch(() => {});
  return run;
}

const waiting = (item: TrayItem) => item.state === "queued" || item.state === "fetching";

/** The queue's state, mirrored in memory and written whole on every change. */
let job: Job | undefined;
async function setJob(change: Partial<Job>): Promise<Job> {
  job ??= ((await browser.storage.local.get(JOB_KEY))[JOB_KEY] as Job | undefined) ?? { total: 0 };
  job = { ...job, ...change };
  await browser.storage.local.set({ [JOB_KEY]: job });
  return job;
}

/** How much is left, on the toolbar, where it can be seen with the panel shut. */
async function showProgress() {
  // The queue's rows only. A tab site's clip takes seconds and has its own
  // state on its row.
  const rows = (await read()).filter((item) => item.site === "youtube");
  const current = await setJob({});
  const left = rows.filter(waiting).length;
  const done = Math.max(0, current.total - left);
  await browser.action.setBadgeBackgroundColor({ color: current.paused ? "#b4561f" : "#2f6f4f" });
  await browser.action.setBadgeText({ text: current.paused ? "stop" : left ? String(left) : "" });
  await browser.action.setTitle({
    title: current.paused
      ? `FileConcat Clipper: stopped with ${left} left. Open the panel to resume.`
      : left
        ? `FileConcat Clipper: ${done} of ${current.total} clipped`
        : "FileConcat Clipper",
  });
}

/**
 * Only when the person allowed it: the permission is optional, asked for the
 * first time a batch starts, because a required one would disable the
 * installed extension for everyone until they accepted it. Fixed wording and
 * counts only, never a title from the page.
 */
async function notify(message: string) {
  if (!(await browser.permissions.contains({ permissions: ["notifications"] }))) return;
  await browser.notifications.create(NOTE_ID, {
    type: "basic",
    iconUrl: browser.runtime.getURL("/icon/128.png"),
    title: "FileConcat Clipper",
    message,
  });
}

/** Expiry happens here rather than on a timer: the store is only interesting
 *  when something is reading it, and a week-old row costs nothing until then. */
const readSent = async (): Promise<SentItem[]> => {
  const stored = await browser.storage.local.get(SENT_KEY);
  const rows = Array.isArray(stored[SENT_KEY]) ? (stored[SENT_KEY] as SentItem[]) : [];
  const cutoff = Date.now() - SENT_TTL_MS;
  return rows.filter((row) => row.sentAt > cutoff);
};

/** One row per path, not per id: a corrected re-clip of the same file is the
 *  same receipt, and the tab it was pushed into holds one file for that path. */
const writeSent = (rows: SentItem[]) =>
  browser.storage.local.set({
    [SENT_KEY]: [...new Map(rows.map((row) => [row.clipping.path, row])).values()].sort((a, b) => b.sentAt - a.sentAt),
  });

const say = (text: string, tone: Status["tone"] = "") =>
  browser.storage.local.set({ [STATUS_KEY]: { text, tone, at: Date.now() } satisfies Status });

/** One row changed. A row the tray no longer holds stays gone. */
const patch = (id: string, change: Partial<TrayItem>) =>
  mutate((items) => items.map((item) => (item.id === id ? { ...item, ...change } : item)));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// A row stored before rows said their site has none. A YouTube video id is
// eleven characters and no other site's id is, so those are read as YouTube's.
const isYouTube = (item: TrayItem) => item.site === "youtube" || (item.site === undefined && /^[A-Za-z0-9_-]{11}$/.test(item.id));
/** Stops that are YouTube pushing back. Only Resume lifts them. */
const held = (current: Job) => current.paused?.reason === "rate" || current.paused?.reason === "bot";
const HELD_TEXT = "Queued. YouTube stopped the queue; press Resume in the cart to go on.";
/** The run's size, changed inside a tray `mutate` so it moves in step with the rows. */
const grow = (by: number, before: number) => {
  job = { ...job!, total: (before ? job!.total : 0) + by };
};
const message = (error: unknown) => String((error as Error)?.message ?? error);

/**
 * New rows on top of the cart. A row already there takes the new state but
 * keeps its clipping, which `settle` needs to tell a partial re-read from a
 * full one.
 */
function requeue(rows: TrayItem[], fresh: TrayItem[]): TrayItem[] {
  const held = new Map(rows.map((row) => [row.id, row.clipping]));
  const ids = new Set(fresh.map((row) => row.id));
  return [...fresh.map((row) => ({ ...row, clipping: held.get(row.id) })), ...rows.filter((row) => !ids.has(row.id))];
}

/**
 * A clip came back. Bulk-clipping a subreddit must not silently downgrade a
 * thread already clipped in full: a partial read keeps the row but not the file.
 */
async function settle(row: TrayItem, clipping: Clipping) {
  const held = (await read()).find((item) => item.id === row.id)?.clipping;
  if (clipping.partial && held && !held.partial) await patch(row.id, { state: "done" });
  else await patch(row.id, { state: "done", clipping, title: clipping.path.split("/").pop() ?? row.title });
}

// ---------- every other site: clipped at once, through its own tab ----------

/**
 * Opens out any selected row that names a set rather than an item — a
 * conversation and the files it created — through the page that offers it.
 * A set that cannot be opened keeps its own row and fails there, where the
 * panel shows it, rather than in a status line nobody may be looking at.
 */
async function expandInTab(tabId: number, items: StartItem[]): Promise<{ work: StartItem[]; failed: { item: StartItem; error: string }[] }> {
  const work: StartItem[] = [];
  const failed: { item: StartItem; error: string }[] = [];
  let opened = 0;
  for (const item of items) {
    if (!item.expand) {
      work.push(item);
      continue;
    }
    if (opened++) await sleep(CLIP_SPACING_MS);
    try {
      const request: SiteRequest = { type: "fc:expand", id: item.id };
      const response = (await browser.tabs.sendMessage(tabId, request)) as SiteResponse<PageItem[]> | undefined;
      if (!response) throw new Error("This page stopped answering. Reload it and clip again.");
      if (!response.ok) throw new Error(response.error);
      work.push(...response.value.map((held) => ({ id: held.id, title: held.title, group: item.title })));
    } catch (error) {
      failed.push({ item, error: message(error) });
    }
  }
  return { work, failed };
}

/**
 * A pick on a page that is not YouTube, clipped now, one id per request, which
 * is what buys a row its own state. These never wait behind a YouTube run: the
 * page they ask is the one in front of the person, and it will not stay there.
 */
async function clipTab(tabId: number, site: string, items: StartItem[], option: boolean) {
  const opening = items.some((item) => item.expand);
  if (opening) await say("Reading what you picked…", "working");
  const { work, failed } = await expandInTab(tabId, items);
  if (opening) await say("");
  // Read once, here: whether this is a batch is a fact about the work, which
  // only exists after the sets are opened out, and the handler sees one item.
  const grouped = work.length > 1;
  const at = Date.now();
  const rows: TrayItem[] = work.map((item) => ({
    id: item.id,
    title: item.title,
    state: "queued",
    group: item.group,
    grouped,
    site,
    tabId,
    option,
    addedAt: at,
  }));
  const broken: TrayItem[] = failed.map(({ item, error }) => ({
    id: item.id,
    title: item.title,
    state: "failed",
    error,
    site,
    tabId,
    option,
    addedAt: at,
  }));
  await mutate((items) => requeue(items, [...broken, ...rows]));
  for (const [index, row] of rows.entries()) {
    if (index > 0) await sleep(CLIP_SPACING_MS);
    await clipInTab(row);
  }
}

/**
 * One row through its tab. A retry comes through here too, with the `grouped`
 * and `group` the row remembers rather than what its own size of one would
 * imply: every handler folders a batch and leaves a lone clip at the top
 * level, so recomputing either would file the retried clip somewhere its
 * siblings are not.
 */
async function clipInTab(row: TrayItem) {
  await patch(row.id, { state: "fetching", error: undefined });
  try {
    if (row.tabId === undefined) throw new Error("The tab this came from is not known any more. Clip it again from its page.");
    const request: SiteRequest = {
      type: "fc:clip",
      id: row.id,
      grouped: row.grouped === true,
      option: row.option === true,
      group: row.group,
    };
    const response = (await browser.tabs.sendMessage(row.tabId, request)) as SiteResponse<Clipping> | undefined;
    if (!response) throw new Error("This page stopped answering. Reload it and clip again.");
    if (!response.ok) throw new Error(response.error);
    if (!response.value) throw new Error("Nothing came back for this one.");
    await settle(row, response.value);
  } catch (error) {
    await patch(row.id, { state: "failed", error: message(error) });
  }
}

// ---------- YouTube: the paced queue ----------

/** One drain loop at a time, and the slot the last YouTube request was given. */
let draining = false;
let lastSlot = 0;
/** Bumped by Clear, so a run in flight stops at its next request. */
let generation = 0;
let clientVersion: string | undefined;

/**
 * Every YouTube request, one at a time, through one global slot: each waits for
 * the slot after the last one handed out, whoever asked for it.
 */
function pacedCall(run: number): Call {
  return async <T>(path: Parameters<Call>[0], body: Record<string, unknown>): Promise<T> => {
    const slot = nextSlot(Date.now(), lastSlot, PACE_MS, Math.random());
    lastSlot = slot.at;
    await sleep(slot.wait);
    if (run !== generation) throw new ClipError("stale", "The cart was cleared.");
    // An extension API call per request. `fetch` and timers do not count as
    // activity, so without this Chrome shuts the worker down 30 s into any
    // stretch of requests that writes nothing.
    await setJob({});
    clientVersion ??= await fetchClientVersion();
    return innertube(clientVersion)<T>(path, body);
  };
}

type Outcome = "go" | "failed" | "stale" | "rate" | "bot";

/** What a failed request means for its row, and for the queue. */
async function fail(row: TrayItem, error: unknown, run: number): Promise<Outcome> {
  if (run !== generation || (error instanceof ClipError && error.kind === "stale")) return "stale";
  if (error instanceof ClipError && (error.kind === "rate" || error.kind === "bot")) {
    // Back in line, not failed: it is the queue that stopped, not this video.
    await patch(row.id, { state: "queued" });
    return error.kind;
  }
  await patch(row.id, { state: "failed", error: message(error) });
  return "failed";
}

/**
 * Puts what was picked on YouTube on the queue and starts the loop. Quick: a
 * playlist is queued as a row of its own and opened by the loop, so nothing
 * picked lives only in this worker's memory while requests go out.
 *
 * What the page handed over is checked here, at the boundary: an id that is
 * not an id never reaches a request, and a title is cut to a length a row can
 * show.
 */
async function enqueue(items: StartItem[], option: boolean) {
  const checked = items
    .filter((item) => typeof item.id === "string" && validYouTubeId(item.id))
    .map((item) => ({ ...item, title: String(item.title ?? item.id).slice(0, TITLE_MAX) }));
  const grouped = checked.length > 1;
  const at = Date.now();
  let over = 0;
  // A press of Clip goes on after a restart or a run of failures. A stop that
  // was YouTube pushing back waits for Resume: a request straight after a 429
  // earns another.
  const holding = held(await setJob({}));
  if (!holding) await setJob({ paused: undefined });
  await mutate((rows) => {
    const busy = new Set(rows.filter((row) => isYouTube(row) && waiting(row)).map((row) => row.id));
    // A row already waiting is not queued twice; the loop reaches it anyway.
    const fresh = checked.filter((item) => !busy.has(item.id));
    const take = fresh.slice(0, Math.max(0, QUEUE_LIMIT - busy.size));
    over = fresh.length - take.length;
    grow(take.length, busy.size);
    return requeue(
      rows,
      take.map((item) => ({
        id: item.id,
        title: item.title,
        state: "queued",
        group: item.group,
        grouped,
        site: "youtube",
        expand: item.expand || undefined,
        option,
        addedAt: at,
      })),
    );
  });
  await setJob({});
  if (over) await say(`The queue holds ${QUEUE_LIMIT}, so ${over} of these were not queued. Clip them once it drains.`, "error");
  else if (holding) await say(HELD_TEXT);
  await showProgress();
  void drain();
}

/**
 * A playlist row, replaced in place by the videos it holds, which then queue
 * as its batch. Filed under the playlist's own name: it is the thing the
 * person picked, and the channel is in every clipping's header anyway.
 */
async function openPlaylist(row: TrayItem, run: number): Promise<Outcome> {
  if (run !== generation) return "stale";
  await patch(row.id, { state: "fetching", error: undefined });
  try {
    const videos = await playlistVideos(pacedCall(run), row.id);
    if (run !== generation) return "stale";
    let over = 0;
    await mutate((rows) => {
      // Removed while it was being opened: nothing to put in its place, and
      // nothing of the cart's to touch.
      if (!rows.some((item) => item.id === row.id)) return rows;
      const busy = new Set(rows.filter((item) => isYouTube(item) && waiting(item) && item.id !== row.id).map((item) => item.id));
      // A video two picked playlists share is clipped once, under the first.
      const batch = new Set(rows.filter((item) => item.addedAt === row.addedAt && item.state === "done").map((item) => item.id));
      const fresh = videos.filter((video) => !busy.has(video.id) && !batch.has(video.id));
      const take = fresh.slice(0, Math.max(0, QUEUE_LIMIT - busy.size));
      over = fresh.length - take.length;
      // The playlist row was one of the run's; its videos take its place.
      grow(take.length - 1, 1);
      const held = new Map(rows.map((item) => [item.id, item.clipping]));
      const ids = new Set(take.map((video) => video.id));
      const queued = take.map(
        (video): TrayItem => ({
          id: video.id,
          title: video.title.slice(0, TITLE_MAX),
          state: "queued",
          group: row.title,
          grouped: row.grouped === true || take.length > 1,
          site: "youtube",
          option: row.option,
          addedAt: row.addedAt,
          clipping: held.get(video.id),
        }),
      );
      return rows.flatMap((item) => (item.id === row.id ? queued : ids.has(item.id) ? [] : [item]));
    });
    await setJob({});
    if (over) await say(`The queue holds ${QUEUE_LIMIT}, so ${over} videos from a playlist were not queued.`, "error");
    return "go";
  } catch (error) {
    return fail(row, error, run);
  }
}

async function clipQueued(row: TrayItem, run: number): Promise<Outcome> {
  if (run !== generation) return "stale";
  await patch(row.id, { state: "fetching", error: undefined });
  try {
    const clipping = await clipVideo(
      pacedCall(run),
      row.id,
      { grouped: row.grouped === true, comments: row.option === true, group: row.group },
      (step) => void setJob({ step: `${row.title.slice(0, 60)}: ${step}` }),
    );
    if (run !== generation) return "stale";
    await settle(row, clipping);
    return "go";
  } catch (error) {
    return fail(row, error, run);
  }
}

const STOP_TEXT: Record<Stop, string> = {
  rate: "Stopped: YouTube is limiting requests. The rest are waiting. Resume from the panel later.",
  bot: "Stopped: YouTube asked to confirm this is not a bot. The rest are waiting. Resume from the panel later.",
  errors: `Stopped: ${FAILURES_TO_STOP} videos in a row failed. Check the connection, then resume from the panel.`,
};
type Stop = "rate" | "bot" | "errors";

/**
 * Clips the next queued YouTube row until there is none, the queue stops, or
 * Clear starts a new run. Always reads the next row from storage, never from a
 * list it holds, so anything added or removed meanwhile is seen.
 */
async function drain() {
  if (draining) return;
  draining = true;
  const run = generation;
  let failures = 0;
  try {
    for (;;) {
      if (run !== generation || (await setJob({})).paused) return;
      const row = pickNext((await read()).filter(isYouTube));
      if (!row) {
        await finish();
        return;
      }
      const outcome = row.expand ? await openPlaylist(row, run) : await clipQueued(row, run);
      if (outcome === "stale") return;
      // A run of failures is not five bad videos, it is a dropped connection
      // or a page YouTube serves instead of answers. Every row after would fail
      // the same way, a second and a half apiece.
      failures = outcome === "failed" ? failures + 1 : 0;
      const stop: Stop | undefined =
        outcome === "rate" || outcome === "bot" ? outcome : failures >= FAILURES_TO_STOP ? "errors" : undefined;
      if (stop) {
        await setJob({ paused: { reason: stop, at: Date.now() }, step: undefined });
        await showProgress();
        await notify(STOP_TEXT[stop]);
        return;
      }
      await showProgress();
    }
  } finally {
    draining = false;
    // Work that arrived while this loop was finishing, or after a Clear,
    // would otherwise sit queued with nothing left to press. Read in turn
    // with the tray's writes, so a Clear already on its way lands first.
    const rows = await mutate((items) => items);
    if (!(await setJob({})).paused && pickNext(rows.filter(isYouTube))) void drain();
  }
}

async function finish() {
  await setJob({ step: undefined });
  // Checked and reset in one tray turn: a Clip landing between the two would
  // otherwise have its run zeroed under it.
  let finished = 0;
  await mutate((rows) => {
    if (!pickNext(rows.filter(isYouTube))) {
      finished = job!.total;
      grow(0, 0);
    }
    return rows;
  });
  await setJob({});
  await showProgress();
  if (finished > 1)
    await notify(`${finished} videos done. Any that failed are marked in the cart. Open the panel to send them to FileConcat.`);
}

/**
 * A failed row, tried again with what it remembers. A YouTube row goes back
 * on the queue; any other goes to its own tab, not the active one, while that
 * tab is open. A session moves on, and retrying a Reddit thread against
 * whatever is in front of you now would clip the wrong page under the right
 * name.
 */
async function retry(id: string, tabId?: number) {
  const row = (await read()).find((item) => item.id === id);
  // Only a failed row: a second press on the same Retry is not a second video.
  if (row?.state !== "failed") return;
  if (isYouTube(row)) {
    const current = await setJob({});
    await mutate((rows) => {
      grow(1, rows.filter((item) => isYouTube(item) && waiting(item)).length);
      return rows.map((item) => (item.id === id ? { ...item, state: "queued", error: undefined, site: "youtube" } : item));
    });
    if (held(current)) {
      await setJob({});
      await say(HELD_TEXT);
      await showProgress();
      return;
    }
    await resume();
    return;
  }
  // The active tab only once the remembered one is gone: a failure that says
  // to open the page again is retried where it now is.
  const alive = row.tabId !== undefined && (await browser.tabs.get(row.tabId).then(() => true, () => false));
  const next = { ...row, tabId: alive ? row.tabId : tabId };
  await patch(id, { tabId: next.tabId });
  await clipInTab(next);
}

async function resume() {
  await setJob({ paused: undefined });
  await showProgress();
  void drain();
}

/** Startup recovery, which every panel request waits behind. */
let ready: Promise<void> = Promise.resolve();

/**
 * A notification click opens the panel where it can. Whether Chrome counts the
 * click as the user gesture `sidePanel.open` asks for is untested; if not, the
 * badge still says what happened.
 */
function openPanel(id: string) {
  if (id !== NOTE_ID) return;
  browser.sidePanel.open({ windowId: browser.windows.WINDOW_ID_CURRENT }).catch(() => {});
  void browser.notifications.clear(id);
}

/** Absent until the optional permission is granted, which can happen mid-run. */
function hookNotifications() {
  if (browser.notifications && !browser.notifications.onClicked.hasListener(openPanel))
    browser.notifications.onClicked.addListener(openPanel);
}

/**
 * YouTube answers 403 to an innertube request whose Origin is this extension,
 * and 200 to the same request from its own origin or none (measured
 * 2026-10-29, Chrome 156). Chrome adds the Origin itself, so the worker's
 * requests get YouTube's, and only those: this extension's own requests to
 * the innertube path. A session rule, so it is set again on every start.
 */
const ORIGIN_RULE = 1;
const setOriginRule = () =>
  browser.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [ORIGIN_RULE],
    addRules: [
      {
        id: ORIGIN_RULE,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [{ header: "origin", operation: "set", value: "https://www.youtube.com" }],
        },
        condition: {
          urlFilter: "|https://www.youtube.com/youtubei/",
          initiatorDomains: [browser.runtime.id],
          resourceTypes: ["xmlhttprequest"],
        },
      },
    ],
  });

/**
 * Pushes into one tab and returns what the *page* said, not what the wire did.
 *
 * `tabs.sendMessage` resolving proves only that the bridge content script is in
 * that tab, and the bridge is in every fileconcat.com tab: /docs, /blog and
 * /privacy carry it and never mount the listener that takes a batch. So
 * "delivered" here means acknowledged by the page, and nothing less.
 *
 * Retries because a tab that is still loading has no content script yet.
 */
async function deliver(tabId: number, request: PushRequest, attempts: number): Promise<PushAnswer> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = (await browser.tabs.sendMessage(tabId, request)) as PushAnswer | undefined;
      // The bridge always answers. Anything in that tab that does not is not it.
      return response ?? { ok: false, error: "That tab did not answer." };
    } catch {
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, PUSH_RETRY_MS));
    }
  }
  return { ok: false, error: "No FileConcat page in that tab." };
}

/**
 * Reuses an open fileconcat.com tab, or opens one, and focuses it once the
 * batch is across. Unlike the popup this can focus freely: a panel stays open
 * across a tab switch, which is the point of it.
 *
 * Answers rather than reports. Sending a fresh batch and sending one again from
 * Sent are different acts and say different things afterwards, so the status
 * line belongs to the callers below and the count comes back to them.
 */
async function push(files: Clipping[]): Promise<{ count: number } | { error: string }> {
  try {
    // Every match is a guess. `tabs.query` returns them in no particular order,
    // so a /docs tab can come back ahead of the tool; `http://localhost/*`
    // ignores the port, so any dev server on the machine matches too. They are
    // tried in turn and the first one the page itself acknowledges wins.
    const candidates = await browser.tabs.query({ url: FILECONCAT_TABS });
    let accepted: { tabId: number; windowId?: number; count: number } | null = null;

    for (const candidate of candidates) {
      if (candidate.id === undefined) continue;
      const request: PushRequest = { type: "fc:push", files, waitMs: CANDIDATE_WAIT_MS };
      const answer = await deliver(candidate.id, request, CANDIDATE_ATTEMPTS);
      if (answer.ok) {
        accepted = { tabId: candidate.id, windowId: candidate.windowId, count: answer.count };
        break;
      }
      // A refusal is about the batch, not the tab. Walking on would open a
      // fresh tab to be refused by the same limit and leave it standing.
      if (answer.final) throw new Error(answer.error);
    }

    if (!accepted) {
      // A new tab covers what the candidates could not, including the case a
      // reload used to: Chrome does not inject content scripts into tabs that
      // were already open when the extension was installed or reloaded, so the
      // first push after either finds a tab with no bridge in it. Reloading was
      // the old fix and it threw away whatever bundle the user had assembled in
      // that tab by hand, with no undo — for a batch that tab never held.
      const tab = await browser.tabs.create({ url: FILECONCAT_URL, active: false });
      if (tab.id === undefined) throw new Error("Could not open a FileConcat tab.");
      const request: PushRequest = { type: "fc:push", files, waitMs: FRESH_TAB_WAIT_MS };
      const answer = await deliver(tab.id, request, PUSH_ATTEMPTS);
      // A tab this worker just opened on the tool's own page has not "gone
      // somewhere that is not the tool", which is what the bridge's timeout
      // says. Only a refusal is the page's own words and worth repeating.
      if (!answer.ok)
        throw new Error(
          answer.final
            ? answer.error
            : "Opened a FileConcat tab and it never took the batch. Let it load, then send again.",
        );
      accepted = { tabId: tab.id, windowId: tab.windowId, count: answer.count };
    }

    await browser.tabs.update(accepted.tabId, { active: true });
    if (accepted.windowId !== undefined) await browser.windows.update(accepted.windowId, { focused: true });
    // The page's count, not `files.length`: it is the only number here that
    // anything outside this worker has vouched for. It says the batch crossed
    // and was accepted, not that the tab finished reading it, so whatever the
    // caller says stops there.
    return { count: accepted.count };
  } catch (error) {
    return { error: String((error as Error)?.message ?? error) };
  }
}

/**
 * The tray's finished rows, pushed, then moved into Sent.
 *
 * The tray used to keep what it sent, because a push replaces same-path files
 * and re-sending was how a bad clip got corrected in place. Sent inherits that
 * job — `resendOnce` below is the same act — which is what lets the cart empty
 * and go back to meaning "work not yet done".
 */
async function sendOnce() {
  const rows = (await read()).filter((item) => item.state === "done" && item.clipping);
  // Paths are made unique across the whole send, before it is split: two pushes
  // that each held an `intro.md` would have the second replace the first.
  const files = uniquePaths(rows.map((item) => item.clipping!));
  if (files.length === 0) return;
  // The page refuses a push past its caps, so a large cart goes as several, in
  // order, each one moved to Sent as soon as the page has taken it.
  const parts = chunk(
    rows.map((row, index) => ({ row, clipping: files[index] })),
    PUSH_MAX_FILES,
    PUSH_MAX_CHARS,
  );
  let count = 0;
  for (const [index, part] of parts.entries()) {
    await say(parts.length > 1 ? `Sending ${index + 1} of ${parts.length}…` : "Sending…", "working");
    const answer = await push(part.map((pair) => pair.clipping));
    if ("error" in answer) {
      await say(count ? `${count} sent, then this stopped the rest: ${answer.error}` : answer.error, "error");
      return;
    }
    count += answer.count;
    const at = Date.now();
    await writeSent([
      ...part.map(({ row }) => ({ id: row.id, title: row.title, clipping: row.clipping!, sentAt: at })),
      ...(await readSent()),
    ]);
    // By the clips actually pushed, not by state or id: a clip that finished
    // while the push was in flight is still waiting to be sent, and a row
    // queued again meanwhile is a new clip on its way.
    const pushed = new Map(part.map(({ row }) => [row.id, row.clipping!.clippedAt]));
    await mutate((items) =>
      items.filter((item) => !(item.state === "done" && pushed.has(item.id) && pushed.get(item.id) === item.clipping?.clippedAt)),
    );
  }
  await say(`${count} sent. FileConcat added them to the bundle.`, "done");
  await showProgress();
}

/** Sent rows, pushed again. Nothing moves: they are already where they belong. */
async function resendOnce(ids: string[]) {
  const files = uniquePaths((await readSent()).filter((row) => ids.includes(row.id)).map((row) => row.clipping));
  if (files.length === 0) return;
  await say("Sending…", "working");
  const answer = await push(files);
  await say(
    "error" in answer ? answer.error : `${answer.count} sent again. FileConcat replaced them in place.`,
    "error" in answer ? "error" : "done",
  );
}

/**
 * Sends run one at a time. Two quick clicks used to put two batches in flight
 * at once against a bridge that holds exactly one, and the first vanished.
 */
let queue: Promise<void> = Promise.resolve();
function serial(work: () => Promise<void>): Promise<void> {
  queue = queue.then(work, work);
  return queue;
}

export default defineBackground(() => {
  // The action has no popup, so a click is the panel's open gesture.
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

  // Registered at start so a click wakes a worker that has gone idle since,
  // and again on a grant, which comes mid-run.
  hookNotifications();
  browser.permissions.onAdded.addListener(hookNotifications);

  // A worker Chrome shut down mid-run left rows that nothing is clipping. A
  // YouTube row goes back in line, and the queue waits for Resume rather than
  // starting again on its own after a browser restart. A tab site's row
  // fails: the loop that would have reached it is gone.
  ready = (async () => {
    await setOriginRule();
    const rows = await mutate((items) =>
      items.map((item): TrayItem => {
        if (!waiting(item)) return item;
        if (isYouTube(item)) return { ...item, state: "queued" };
        return { ...item, state: "failed", error: "Stopped before it was read. Retry it." };
      }),
    );
    const current = await setJob({});
    if (rows.some((item) => isYouTube(item) && item.state === "queued") && !current.paused && !draining)
      await setJob({ paused: { reason: "interrupted", at: Date.now() } });
    await showProgress();
  })().catch(() => {});

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // A content script the page's CSP will not let reach a host.
    if ((message as FetchRequest)?.type === "fc:fetch") {
      const { url } = message as FetchRequest;
      const host = (() => {
        try {
          return new URL(url).hostname;
        } catch {
          return "";
        }
      })();
      if (!FETCH_ALLOWLIST.includes(host)) {
        sendResponse({ ok: false, error: `${host || url} is not on the fetch allowlist.` } satisfies SiteResponse<never>);
        return true;
      }
      fetch(url)
        .then(async (response) => {
          if (!response.ok) throw new Error(`${host} answered ${response.status}.`);
          return response.text();
        })
        .then(
          (body) => sendResponse({ ok: true, value: body } satisfies SiteResponse<string>),
          (error: unknown) =>
            sendResponse({ ok: false, error: String((error as Error)?.message ?? error) } satisfies SiteResponse<never>),
        );
      return true;
    }

    const request = message as PanelRequest;
    const done = () => sendResponse({ ok: true });
    switch (request?.type) {
      // Answered at once: the run can outlast the panel by hours, and the panel
      // follows it through storage.
      case "fc:start":
        void ready.then(() =>
          request.site === "youtube"
            ? enqueue(request.items, request.option)
            : clipTab(request.tabId, request.site, request.items, request.option),
        );
        done();
        return;
      case "fc:retry":
        void ready.then(() => retry(request.id, request.tabId)).then(done);
        return true;
      case "fc:resume":
        void ready.then(resume).then(done);
        return true;
      case "fc:send":
        void serial(sendOnce).then(done);
        return true;
      case "fc:resend":
        void serial(() => resendOnce(request.ids)).then(done);
        return true;
      case "fc:remove":
        // A conversation's created files are `<id>#<n>` rows and go with it.
        // Only there: an article's id is its URL, and `#` is a fragment.
        void ready
          .then(() => setJob({}))
          .then(() =>
            mutate((items) => {
              const kept = items.filter(
                (item) => item.id !== request.id && !(request.id.startsWith("chat/") && item.id.startsWith(`${request.id}#`)),
              );
              // A removed row leaves the run, and a stop with nothing left
              // behind it has nothing to resume.
              const left = kept.filter((item) => isYouTube(item) && waiting(item)).length;
              const gone = items.filter((item) => isYouTube(item) && waiting(item)).length - left;
              if (left === 0) job = { ...job!, total: 0, paused: undefined, step: undefined };
              else grow(-gone, 1);
              return kept;
            }),
          )
          .then(() => setJob({}))
          .then(showProgress)
          .then(done);
        return true;
      // The cart only. Sent is a record of what already left, and emptying the
      // cart is not a statement about that. It is also the queue's stop: the
      // run in flight ends at its next request.
      case "fc:clear":
        generation++;
        void ready
          .then(() => Promise.all([mutate(() => []), say(""), setJob({ total: 0, step: undefined, paused: undefined })]))
          .then(showProgress)
          .then(done);
        return true;
      default:
        return;
    }
  });
});
