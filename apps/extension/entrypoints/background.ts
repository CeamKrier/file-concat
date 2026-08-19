// Owns the work, because the panel does not.
//
// The popup could do its own clipping: dismissing it was the user abandoning
// the batch. A side panel is closed the way a drawer is closed — while you keep
// working — so a batch has to survive it. Everything with a duration lives here
// and reports by writing `chrome.storage.local`; the panel is a view.

import { browser, defineBackground } from "#imports";
import type { Clipping } from "../src/markdown";
import {
  STATUS_KEY,
  TRAY_KEY,
  type PanelRequest,
  type PushRequest,
  type SiteRequest,
  type SiteResponse,
  type Status,
  type TrayItem,
} from "../src/messages";

/** Enough to re-send a session's worth of work after a push replaced the last. */
const TRAY_LIMIT = 50;
const FILECONCAT_TABS = ["https://fileconcat.com/*", "http://localhost/*"];
const FILECONCAT_URL = "https://fileconcat.com/";
/** 24 x 250ms, twice: enough for a cold dev server plus one reload. */
const PUSH_ATTEMPTS = 24;
const PUSH_RETRY_MS = 250;
/** Requests go out one at a time; this is the pause between them. */
const CLIP_SPACING_MS = 400;

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

async function clip(tabId: number, items: { id: string; title: string }[], comments: boolean) {
  const queued: TrayItem[] = items.map((item) => ({ ...item, state: "queued", addedAt: Date.now() }));
  await write([...queued, ...(await read())]);

  // One id per request, which is what buys a row its own state: a batch that
  // answered once could only ever report the batch.
  for (const [index, item] of items.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, CLIP_SPACING_MS));
    await patch(item.id, { state: "fetching" });
    try {
      const request: SiteRequest = { type: "fc:clip", ids: [item.id], comments };
      const response = (await browser.tabs.sendMessage(tabId, request)) as SiteResponse<Clipping[]> | undefined;
      if (!response) throw new Error("This page stopped answering. Reload it and clip again.");
      if (!response.ok) throw new Error(response.error);
      const clipping = response.value[0];
      if (!clipping) throw new Error("Nothing came back for this one.");
      await patch(item.id, { state: "done", clipping, title: clipping.path.split("/").pop() ?? item.title });
    } catch (error) {
      await patch(item.id, { state: "failed", error: String((error as Error)?.message ?? error) });
    }
  }
}

/** Retries because a tab that is still loading has no content script yet. */
async function deliver(tabId: number, request: PushRequest): Promise<boolean> {
  for (let attempt = 0; attempt < PUSH_ATTEMPTS; attempt++) {
    try {
      await browser.tabs.sendMessage(tabId, request);
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, PUSH_RETRY_MS));
    }
  }
  return false;
}

/**
 * Reuses an open fileconcat.com tab, or opens one, and focuses it once the
 * batch is across. Unlike the popup this can focus freely: a panel stays open
 * across a tab switch, which is the point of it.
 */
async function send() {
  const files = (await read()).filter((item) => item.state === "done" && item.clipping).map((item) => item.clipping!);
  if (files.length === 0) return;
  await say("Sending…", "working");
  try {
    const [existing] = await browser.tabs.query({ url: FILECONCAT_TABS });
    const tab = existing ?? (await browser.tabs.create({ url: FILECONCAT_URL, active: false }));
    if (tab.id === undefined) throw new Error("Could not open a FileConcat tab.");

    const request: PushRequest = { type: "fc:push", files };
    if (!(await deliver(tab.id, request))) {
      // Chrome does not inject content scripts into tabs that were already open
      // when the extension was installed or reloaded, so the first push after
      // either lands on a tab with no bridge in it. One reload fixes that, and
      // is safe here because a failed delivery means the tab holds none of this
      // work.
      await browser.tabs.reload(tab.id);
      if (!(await deliver(tab.id, request))) {
        throw new Error("No answer from the FileConcat tab. Check it loads, then send again.");
      }
    }

    await browser.tabs.update(tab.id, { active: true });
    if (tab.windowId !== undefined) await browser.windows.update(tab.windowId, { focused: true });
    // The tray keeps what it sent. A push replaces whatever the tab held
    // before, so the way back from a mistake is to send the set again.
    await say(`${files.length} sent. They are in the tab now.`, "done");
  } catch (error) {
    await say(String((error as Error)?.message ?? error), "error");
  }
}

export default defineBackground(() => {
  // The action has no popup, so a click is the panel's open gesture.
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const request = message as PanelRequest;
    const done = () => sendResponse({ ok: true });
    switch (request?.type) {
      case "fc:start":
        void clip(request.tabId, request.items, request.comments).then(done);
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
