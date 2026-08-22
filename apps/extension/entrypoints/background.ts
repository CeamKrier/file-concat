// Owns the work, because the panel does not.
//
// The popup could do its own clipping: dismissing it was the user abandoning
// the batch. A side panel is closed the way a drawer is closed — while you keep
// working — so a batch has to survive it. Everything with a duration lives here
// and reports by writing `chrome.storage.local`; the panel is a view.

import { browser, defineBackground } from "#imports";
import { uniquePaths, type Clipping } from "../src/markdown";
import {
  SENT_KEY,
  SENT_TTL_MS,
  STATUS_KEY,
  TRAY_KEY,
  type FetchRequest,
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

/** Enough to hold a session's worth of work and re-send the whole set. */
const TRAY_LIMIT = 50;
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
/** Requests go out one at a time; this is the pause between them. */
const CLIP_SPACING_MS = 400;
/** `fc:fetch` runs with this extension's own permissions and cookies, so a
 *  content script cannot point it at an arbitrary host — only the ones the
 *  handlers actually call. */
const FETCH_ALLOWLIST = ["hn.algolia.com"];

const read = async (): Promise<TrayItem[]> => {
  const stored = await browser.storage.local.get(TRAY_KEY);
  return Array.isArray(stored[TRAY_KEY]) ? (stored[TRAY_KEY] as TrayItem[]) : [];
};

/** Newest first, one row per id: re-clipping a video replaces its row. */
const write = (items: TrayItem[]) =>
  browser.storage.local.set({
    [TRAY_KEY]: [...new Map(items.map((item) => [item.id, item])).values()]
      .sort((a, b) => b.addedAt - a.addedAt)
      .slice(0, TRAY_LIMIT),
  });

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

/** Read-modify-write on one row. The tray is small and the panel is the only
 *  other reader, so a lock would cost more than the race it prevents. */
async function patch(id: string, change: Partial<TrayItem>) {
  const items = await read();
  await write(items.map((item) => (item.id === id ? { ...item, ...change } : item)));
}

/**
 * Opens out any selected row that names a set rather than an item — a YouTube
 * playlist — into what it holds, in the page's own order.
 *
 * Clipping such a row directly is what used to go wrong: its id is the
 * playlist's, so the video the playlist opens with arrived filed under the
 * playlist's name, a wrong file rather than a failed one. A set that cannot be
 * opened keeps its own row and fails there, where the panel shows it, rather
 * than in a status line nobody may be looking at.
 */
async function expand(
  tabId: number,
  items: StartItem[],
): Promise<{ work: StartItem[]; failed: TrayItem[]; unopened: number }> {
  const work: StartItem[] = [];
  const failed: TrayItem[] = [];
  let opened = 0;
  let unopened = 0;
  for (const item of items) {
    if (!item.expand) {
      work.push(item);
      continue;
    }
    // Nothing past what the tray will hold is going to be clipped, so nothing
    // past it is worth a request either. Ticking every playlist on a channel is
    // one gesture and would otherwise be fifty-odd requests for work that is
    // then thrown away.
    if (work.length >= TRAY_LIMIT) {
      unopened++;
      continue;
    }
    // Paced like the clip loop below, and for the same reason: this runs inside
    // the person's own session against a site that watches for machine pace.
    if (opened++) await new Promise((resolve) => setTimeout(resolve, CLIP_SPACING_MS));
    try {
      const request: SiteRequest = { type: "fc:expand", id: item.id };
      const response = (await browser.tabs.sendMessage(tabId, request)) as SiteResponse<PageItem[]> | undefined;
      if (!response) throw new Error("This page stopped answering. Reload it and clip again.");
      if (!response.ok) throw new Error(response.error);
      // Every item that came out of a set is filed under that set's own name:
      // it is the thing the person picked, and the site's own grouping — a
      // channel — is in every clipping's header anyway.
      work.push(...response.value.map((held) => ({ id: held.id, title: held.title, group: item.title })));
    } catch (error) {
      failed.push({
        id: item.id,
        title: item.title,
        state: "failed",
        error: String((error as Error)?.message ?? error),
        addedAt: Date.now(),
      });
    }
  }
  return { work, failed, unopened };
}

async function clip(tabId: number, items: StartItem[], option: boolean) {
  // Opening a set out is a request per set, so a few ticked playlists are a
  // couple of seconds before the first row appears.
  const opening = items.some((item) => item.expand);
  if (opening) await say("Reading what you picked…", "working");
  const { work, failed, unopened } = await expand(tabId, items);

  // `write` keeps TRAY_LIMIT rows and drops the oldest past it, so a batch
  // larger than that would evict its own earlier rows while they were still
  // being clipped — and `patch` on a row the tray no longer holds does nothing
  // at all. Ticking every playlist on a channel reaches this on the first try.
  const capped = work.slice(0, Math.max(0, TRAY_LIMIT - failed.length));
  if (opening)
    await say(
      capped.length < work.length || unopened
        ? `The tray holds ${TRAY_LIMIT}, so this is the first ${capped.length} and the rest was left out.`
        : "",
    );

  // Read once, here: whether this is a batch is a fact about the work, which
  // only exists after the sets are opened out, and the handler sees one item.
  const grouped = capped.length > 1;

  const queued: TrayItem[] = capped.map((item) => ({
    id: item.id,
    title: item.title,
    state: "queued",
    group: item.group,
    grouped,
    addedAt: Date.now(),
  }));
  await write([...failed, ...queued, ...(await read())]);

  // One id per request, which is what buys a row its own state: a batch that
  // answered once could only ever report the batch.
  for (const [index, item] of capped.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, CLIP_SPACING_MS));
    await clipOne(tabId, item, grouped, option);
  }
}

/**
 * One item, from "fetching" to whatever became of it.
 *
 * Both the batch loop above and a retry come through here, and a retry passes
 * the `grouped` and `group` the row remembers rather than what its own size of
 * one would imply. Every handler folders a batch and leaves a lone clip at the
 * top level, so recomputing either would file the retried clip somewhere its
 * siblings are not.
 */
async function clipOne(tabId: number, item: StartItem, grouped: boolean, option: boolean) {
  await patch(item.id, { state: "fetching" });
  try {
    const request: SiteRequest = { type: "fc:clip", id: item.id, grouped, option, group: item.group };
    const response = (await browser.tabs.sendMessage(tabId, request)) as SiteResponse<Clipping> | undefined;
    if (!response) throw new Error("This page stopped answering. Reload it and clip again.");
    if (!response.ok) throw new Error(response.error);
    const clipping = response.value;
    if (!clipping) throw new Error("Nothing came back for this one.");
    // Bulk-clipping a subreddit must not silently downgrade a thread already
    // clipped in full: a partial read keeps the row but not the file.
    const held = (await read()).find((row) => row.id === item.id)?.clipping;
    if (clipping.partial && held && !held.partial) {
      await patch(item.id, { state: "done" });
    } else {
      await patch(item.id, { state: "done", clipping, title: clipping.path.split("/").pop() ?? item.title });
    }
  } catch (error) {
    await patch(item.id, { state: "failed", error: String((error as Error)?.message ?? error) });
  }
}

/**
 * A failed row, run again against the tab it came from.
 *
 * The panel only offers this while that tab is open, because clipping is a
 * question put to a page: there is no route to the content without it.
 */
async function retry(tabId: number, id: string, option: boolean) {
  const row = (await read()).find((item) => item.id === id);
  if (!row) return;
  await clipOne(tabId, { id: row.id, title: row.title, group: row.group }, row.grouped === true, option);
}

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
  const files = uniquePaths(rows.map((item) => item.clipping!));
  if (files.length === 0) return;
  await say("Sending…", "working");
  const answer = await push(files);
  if ("error" in answer) {
    await say(answer.error, "error");
    return;
  }
  const at = Date.now();
  await writeSent([
    ...rows.map((item) => ({ id: item.id, title: item.title, clipping: item.clipping!, sentAt: at })),
    ...(await readSent()),
  ]);
  // By the ids actually pushed, not by state: a clip that finished while the
  // push was in flight is still waiting to be sent, and clearing every done row
  // would drop it without ever having sent it.
  const pushed = new Set(rows.map((item) => item.id));
  await write((await read()).filter((item) => !pushed.has(item.id)));
  await say(`${answer.count} sent. The tab took them.`, "done");
}

/** Sent rows, pushed again. Nothing moves: they are already where they belong. */
async function resendOnce(ids: string[]) {
  const files = uniquePaths((await readSent()).filter((row) => ids.includes(row.id)).map((row) => row.clipping));
  if (files.length === 0) return;
  await say("Sending…", "working");
  const answer = await push(files);
  await say(
    "error" in answer ? answer.error : `${answer.count} sent again. The tab replaced them in place.`,
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
      case "fc:start":
        void clip(request.tabId, request.items, request.option).then(done);
        return true;
      case "fc:retry":
        void retry(request.tabId, request.id, request.option).then(done);
        return true;
      case "fc:send":
        void serial(sendOnce).then(done);
        return true;
      case "fc:resend":
        void serial(() => resendOnce(request.ids)).then(done);
        return true;
      case "fc:remove":
        void read()
          .then((items) => write(items.filter((item) => item.id !== request.id)))
          .then(done);
        return true;
      // The cart only. Sent is a record of what already left, and emptying the
      // cart is not a statement about that.
      case "fc:clear":
        void Promise.all([write([]), say("")]).then(done);
        return true;
      default:
        return;
    }
  });
});
