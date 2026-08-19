// The popup: what this page offers, what is in the tray, and one way out.
//
// There is no service worker. Nothing here needs to outlive the popup — the
// tray lives in browser.storage.local, and the two tab calls are available in a
// popup directly.
//
// ponytail: a clip runs for as long as the popup is open, so dismissing it
// mid-batch loses that batch. Move clipping into a service worker if batches
// grow past a handful of videos.

import { browser } from "#imports";
import type { Clipping } from "../../src/markdown";
import type { PageReport, PushRequest, SiteRequest, SiteResponse } from "../../src/messages";

const TRAY_KEY = "clippings";
const COMMENTS_KEY = "includeComments";
/** Enough to re-send a session's worth of work after a push replaced the last. */
const TRAY_LIMIT = 50;
const FILECONCAT_TABS = ["https://fileconcat.com/*", "http://localhost/*"];
const FILECONCAT_URL = "https://fileconcat.com/";
/** 24 x 250ms, twice: enough for a cold dev server plus one reload. */
const PUSH_ATTEMPTS = 24;
const PUSH_RETRY_MS = 250;

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ui = {
  origin: el("origin"),
  pageSection: el("page-section"),
  pageLabel: el("page-label"),
  pageNote: el("page-note"),
  pageList: el<HTMLUListElement>("page-list"),
  commentsRow: el("comments-row"),
  comments: el<HTMLInputElement>("comments"),
  selectAll: el<HTMLButtonElement>("select-all"),
  clip: el<HTMLButtonElement>("clip"),
  trayLabel: el("tray-label"),
  trayNote: el("tray-note"),
  trayList: el<HTMLUListElement>("tray-list"),
  clear: el<HTMLButtonElement>("clear"),
  send: el<HTMLButtonElement>("send"),
  status: el("status"),
};

let tray: Clipping[] = [];
let page: PageReport = { kind: "other", videos: [] };
let activeTabId: number | undefined;

function say(text: string, tone: "" | "working" | "done" | "error" = "") {
  ui.status.textContent = text;
  ui.status.dataset.tone = tone;
}

/** Comments default to off: they are the one part of a clip that costs real
 *  tokens, so they are asked for rather than assumed. The choice sticks. */
async function loadState() {
  const stored = await browser.storage.local.get([TRAY_KEY, COMMENTS_KEY]);
  tray = Array.isArray(stored[TRAY_KEY]) ? (stored[TRAY_KEY] as Clipping[]) : [];
  ui.comments.checked = stored[COMMENTS_KEY] === true;
}

/** Newest first, one entry per path: re-clipping a video replaces it. */
async function saveTray(clippings: Clipping[]) {
  const byPath = new Map<string, Clipping>();
  for (const clipping of clippings) byPath.set(clipping.path, clipping);
  tray = [...byPath.values()].sort((a, b) => b.clippedAt - a.clippedAt).slice(0, TRAY_LIMIT);
  await browser.storage.local.set({ [TRAY_KEY]: tray });
}

function checkboxRow(id: string, title: string, meta: string, checked: boolean): HTMLLIElement {
  const item = document.createElement("li");
  const label = document.createElement("label");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.value = id;
  box.checked = checked;
  const text = document.createElement("span");
  text.className = "row-text";
  const titleLine = document.createElement("span");
  titleLine.className = "row-title";
  titleLine.textContent = title;
  const metaLine = document.createElement("span");
  metaLine.className = "row-meta";
  metaLine.textContent = meta;
  text.append(titleLine, metaLine);
  label.append(box, text);
  item.append(label);
  return item;
}

const selected = (list: HTMLUListElement) =>
  [...list.querySelectorAll<HTMLInputElement>("input:checked")].map((box) => box.value);

function renderPage() {
  ui.pageList.replaceChildren();
  ui.pageNote.hidden = true;
  ui.selectAll.hidden = true;
  ui.clip.hidden = true;
  ui.commentsRow.hidden = page.kind === "other";

  if (page.kind === "other") {
    ui.pageLabel.textContent = "This page";
    ui.pageNote.textContent = "Open a YouTube video, channel or search page to clip from it.";
    ui.pageNote.hidden = false;
    return;
  }

  if (page.kind === "watch") {
    ui.pageLabel.textContent = "This video";
    ui.pageNote.textContent = page.videos[0].title;
    ui.pageNote.hidden = false;
    ui.clip.textContent = "Clip this video";
    ui.clip.hidden = false;
    return;
  }

  ui.pageLabel.textContent = `On this page · ${page.videos.length}`;
  ui.selectAll.hidden = false;
  for (const video of page.videos) {
    ui.pageList.append(checkboxRow(video.id, video.title, video.duration ?? "", false));
  }
  ui.pageList.addEventListener("change", renderClipButton);
  ui.clip.hidden = false;
  renderClipButton();
}

function renderClipButton() {
  if (page.kind !== "list") return;
  const count = selected(ui.pageList).length;
  ui.clip.disabled = count === 0;
  ui.clip.textContent = count === 0 ? "Select videos to clip" : count === 1 ? "Clip 1 video" : `Clip ${count} videos`;
}

function renderTray() {
  ui.trayList.replaceChildren();
  ui.trayLabel.textContent = tray.length ? `Tray · ${tray.length}` : "Tray";
  ui.trayNote.hidden = tray.length > 0;
  ui.clear.hidden = tray.length === 0;
  for (const clipping of tray) {
    const name = clipping.path.split("/").pop() ?? clipping.path;
    const folder = clipping.path.includes("/") ? clipping.path.split("/")[0] : "";
    ui.trayList.append(checkboxRow(clipping.path, name, folder, true));
  }
  renderSendButton();
}

function renderSendButton() {
  const count = selected(ui.trayList).length;
  ui.send.disabled = count === 0;
  ui.send.textContent =
    count === 0 ? "Send to FileConcat" : count === 1 ? "Send 1 file to FileConcat" : `Send ${count} files to FileConcat`;
}

async function ask<T>(request: SiteRequest): Promise<T> {
  if (activeTabId === undefined) throw new Error("No active tab.");
  const response = (await browser.tabs.sendMessage(activeTabId, request)) as SiteResponse<T> | undefined;
  if (!response) throw new Error("This page is not answering. Reload it and try again.");
  if (!response.ok) throw new Error(response.error);
  return response.value;
}

async function clip() {
  const ids = page.kind === "watch" ? [page.videos[0].id] : selected(ui.pageList);
  if (ids.length === 0) return;
  ui.clip.disabled = true;
  say(ids.length === 1 ? "Clipping…" : `Clipping ${ids.length} videos…`, "working");
  try {
    const clippings = await ask<Clipping[]>({ type: "fc:clip", ids, comments: ui.comments.checked });
    await saveTray([...clippings, ...tray]);
    renderTray();
    say(`${clippings.length} added to the tray.`, "done");
  } catch (error) {
    say(String((error as Error).message ?? error), "error");
  } finally {
    ui.clip.disabled = false;
    renderClipButton();
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
 * batch is across.
 *
 * The new tab is opened in the background on purpose: focusing it would dismiss
 * this popup, and the popup is what is doing the sending.
 */
async function push(files: Clipping[]) {
  const [existing] = await browser.tabs.query({ url: FILECONCAT_TABS });
  const tab = existing ?? (await browser.tabs.create({ url: FILECONCAT_URL, active: false }));
  if (tab.id === undefined) throw new Error("Could not open a FileConcat tab.");

  const request: PushRequest = { type: "fc:push", files };
  if (!(await deliver(tab.id, request))) {
    // Chrome does not inject content scripts into tabs that were already open
    // when the extension was installed or reloaded, so the first push after
    // either lands on a tab with no bridge in it. One reload fixes that, and is
    // safe here because a failed delivery means the tab holds none of this work.
    await browser.tabs.reload(tab.id);
    if (!(await deliver(tab.id, request))) {
      throw new Error("No answer from the FileConcat tab. Check it loads, then send again.");
    }
  }

  await browser.tabs.update(tab.id, { active: true });
  if (tab.windowId !== undefined) await browser.windows.update(tab.windowId, { focused: true });
}

async function send() {
  const paths = new Set(selected(ui.trayList));
  const files = tray.filter((clipping) => paths.has(clipping.path));
  if (files.length === 0) return;
  ui.send.disabled = true;
  say("Sending…", "working");
  try {
    await push(files);
    // The tray keeps what it sent. A push replaces whatever the tab held
    // before, so the way back from a mistake is to send the set again.
    say(`${files.length} sent. They are in the tab now.`, "done");
  } catch (error) {
    say(String((error as Error).message ?? error), "error");
  } finally {
    renderSendButton();
  }
}

ui.selectAll.addEventListener("click", () => {
  const boxes = [...ui.pageList.querySelectorAll<HTMLInputElement>("input")];
  const turningOn = boxes.some((box) => !box.checked);
  for (const box of boxes) box.checked = turningOn;
  ui.selectAll.textContent = turningOn ? "Select none" : "Select all";
  renderClipButton();
});
ui.comments.addEventListener("change", () => void browser.storage.local.set({ [COMMENTS_KEY]: ui.comments.checked }));
ui.clip.addEventListener("click", () => void clip());
ui.trayList.addEventListener("change", renderSendButton);
ui.clear.addEventListener("click", () => void saveTray([]).then(renderTray));
ui.send.addEventListener("click", () => void send());

async function start() {
  await loadState();
  renderTray();

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id;
  ui.origin.textContent = tab?.url ? new URL(tab.url).hostname.replace(/^www\./, "") : "";

  if (!tab?.url || !/^https?:\/\/([^/]*\.)?youtube\.com\//.test(tab.url)) {
    renderPage();
    return;
  }
  try {
    page = await ask<PageReport>({ type: "fc:page" });
  } catch (error) {
    say(String((error as Error).message ?? error), "error");
  }
  renderPage();
}

void start();
