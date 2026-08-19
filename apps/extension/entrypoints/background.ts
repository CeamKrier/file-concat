// Owns the work, because the panel does not.
//
// The popup could do its own clipping: dismissing it was the user abandoning
// the batch. A side panel is closed the way a drawer is closed — while you keep
// working — so a batch has to survive it. Everything with a duration lives here
// and reports by writing `chrome.storage.local`; the panel is a view.

import { browser, defineBackground } from "#imports";
import { uniquePaths, type Clipping } from "../src/markdown";
import {
  STATUS_KEY,
  TRAY_KEY,
  type FetchRequest,
  type PanelRequest,
  type PushRequest,
  type SiteRequest,
  type SiteResponse,
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

const say = (text: string, tone: Status["tone"] = "") =>
  browser.storage.local.set({ [STATUS_KEY]: { text, tone, at: Date.now() } satisfies Status });

/** Read-modify-write on one row. The tray is small and the panel is the only
 *  other reader, so a lock would cost more than the race it prevents. */
async function patch(id: string, change: Partial<TrayItem>) {
  const items = await read();
  await write(items.map((item) => (item.id === id ? { ...item, ...change } : item)));
}

async function clip(tabId: number, items: { id: string; title: string }[], option: boolean) {
  const queued: TrayItem[] = items.map((item) => ({ ...item, state: "queued", addedAt: Date.now() }));
  await write([...queued, ...(await read())]);

  // Read once, here: whether this is a batch is a fact about the selection, and
  // the handler sees only its own item.
  const grouped = items.length > 1;

  // One id per request, which is what buys a row its own state: a batch that
  // answered once could only ever report the batch.
  for (const [index, item] of items.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, CLIP_SPACING_MS));
    await patch(item.id, { state: "fetching" });
    try {
      const request: SiteRequest = { type: "fc:clip", id: item.id, grouped, option };
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
async function deliver(tabId: number, request: PushRequest, attempts: number): Promise<SiteResponse<number>> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = (await browser.tabs.sendMessage(tabId, request)) as SiteResponse<number> | undefined;
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
 */
async function sendOnce() {
  const files = uniquePaths(
    (await read()).filter((item) => item.state === "done" && item.clipping).map((item) => item.clipping!),
  );
  if (files.length === 0) return;
  await say("Sending…", "working");
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
        accepted = { tabId: candidate.id, windowId: candidate.windowId, count: answer.value };
        break;
      }
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
      if (!answer.ok) throw new Error(answer.error);
      accepted = { tabId: tab.id, windowId: tab.windowId, count: answer.value };
    }

    await browser.tabs.update(accepted.tabId, { active: true });
    if (accepted.windowId !== undefined) await browser.windows.update(accepted.windowId, { focused: true });
    // The page's count, not `files.length`: it is the only number here that
    // anything outside this worker has vouched for. It says the batch crossed
    // and was accepted, not that the tab finished reading it, so the line stops
    // there. The tray keeps what it sent, and a push appends to the tab and
    // replaces same-path files, so re-sending a corrected set fixes one in place.
    await say(`${accepted.count} sent. The tab took them.`, "done");
  } catch (error) {
    await say(String((error as Error)?.message ?? error), "error");
  }
}

/**
 * Sends run one at a time. Two quick clicks used to put two batches in flight
 * at once against a bridge that holds exactly one, and the first vanished.
 */
let queue: Promise<void> = Promise.resolve();
function send(): Promise<void> {
  queue = queue.then(sendOnce, sendOnce);
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
      case "fc:send":
        void send().then(done);
        return true;
      case "fc:remove":
        void read()
          .then((items) => write(items.filter((item) => item.id !== request.id)))
          .then(done);
        return true;
      case "fc:clear":
        void Promise.all([write([]), say("")]).then(done);
        return true;
      default:
        return;
    }
  });
});
