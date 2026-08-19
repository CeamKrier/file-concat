// The panel is a view. It asks the current tab what it offers, hands work to
// the background, and renders `chrome.storage.local`.
//
// Nothing here has a duration, which is the whole difference from the popup it
// replaces: close the panel mid-batch and the batch carries on, because the
// batch was never running in here.

import { browser } from "#imports";
import {
  COMMENTS_KEY,
  STATUS_KEY,
  TRAY_KEY,
  type PageReport,
  type PanelRequest,
  type SiteRequest,
  type SiteResponse,
  type Status,
  type TrayItem,
} from "../../src/messages";

/** YouTube settles its DOM after announcing a navigation, and a tab switch can
 *  arrive in a burst. One pause absorbs both. */
const SETTLE_MS = 250;

const STATE_LABEL: Record<TrayItem["state"], string> = {
  queued: "Queued",
  fetching: "Reading…",
  done: "",
  failed: "Failed",
};

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ui = {
  origin: el("origin"),
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

let tray: TrayItem[] = [];
let page: PageReport = { kind: "other", videos: [] };
let activeTabId: number | undefined;

const tell = (request: PanelRequest) => browser.runtime.sendMessage(request);

function say(status: Status | undefined) {
  ui.status.textContent = status?.text ?? "";
  ui.status.dataset.tone = status?.tone ?? "";
}

/** A drawn mark rather than a glyph: × is a letter wearing an icon's clothes. */
function removeIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 12 12");
  svg.setAttribute("width", "12");
  svg.setAttribute("height", "12");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M3 3 L9 9 M9 3 L3 9");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.5");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("fill", "none");
  svg.append(path);
  return svg;
}

function checkboxRow(id: string, title: string, meta: string): HTMLLIElement {
  const item = document.createElement("li");
  const label = document.createElement("label");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.value = id;
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
    ui.pageLabel.textContent = "Now";
    ui.pageNote.textContent = "Open a YouTube video, channel or search page to clip from it.";
    ui.pageNote.hidden = false;
    return;
  }

  if (page.kind === "watch") {
    ui.pageLabel.textContent = "Now · this video";
    ui.pageNote.textContent = page.videos[0].title;
    ui.pageNote.hidden = false;
    ui.clip.textContent = "Clip this video";
    ui.clip.hidden = false;
    return;
  }

  ui.pageLabel.textContent = `Now · ${page.videos.length} on this page`;
  ui.selectAll.hidden = false;
  ui.selectAll.textContent = "Select all";
  for (const video of page.videos) {
    ui.pageList.append(checkboxRow(video.id, video.title, video.duration ?? ""));
  }
  ui.clip.hidden = false;
  renderClipButton();
}

function renderClipButton() {
  if (page.kind !== "list") return;
  const count = selected(ui.pageList).length;
  ui.clip.disabled = count === 0;
  ui.clip.textContent = count === 0 ? "Select videos to clip" : count === 1 ? "Clip 1 video" : `Clip ${count} videos`;
}

function trayRow(item: TrayItem): HTMLLIElement {
  const row = document.createElement("li");
  row.className = "tray-row";
  row.dataset.state = item.state;

  const text = document.createElement("span");
  text.className = "row-text";
  const titleLine = document.createElement("span");
  titleLine.className = "row-title";
  titleLine.textContent = item.clipping?.path.split("/").pop() ?? item.title;
  // A panel is narrow enough that most names truncate; the full one has to be
  // reachable without widening the panel.
  titleLine.title = titleLine.textContent;
  const metaLine = document.createElement("span");
  metaLine.className = "row-meta";
  // A finished row shows where it landed; a failed one shows why. Neither
  // needs the word "done" to say which it is.
  metaLine.textContent =
    item.state === "failed" ? (item.error ?? "") : (item.clipping?.path.split("/").slice(0, -1).join("/") ?? "");
  text.append(titleLine, metaLine);

  const state = document.createElement("span");
  state.className = "state";
  state.textContent = STATE_LABEL[item.state];

  const remove = document.createElement("button");
  remove.className = "remove";
  remove.type = "button";
  remove.title = `Remove ${item.title}`;
  remove.setAttribute("aria-label", `Remove ${item.title}`);
  remove.append(removeIcon());
  remove.addEventListener("click", () => void tell({ type: "fc:remove", id: item.id }));

  row.append(text, state, remove);
  return row;
}

function renderTray() {
  ui.trayList.replaceChildren(...tray.map(trayRow));
  const ready = tray.filter((item) => item.state === "done").length;
  ui.trayLabel.textContent = tray.length ? `Tray · ${tray.length}` : "Tray";
  ui.trayNote.hidden = tray.length > 0;
  ui.clear.hidden = tray.length === 0;
  ui.send.disabled = ready === 0;
  ui.send.textContent =
    ready === 0 ? "Send to FileConcat" : ready === 1 ? "Send 1 file to FileConcat" : `Send ${ready} files to FileConcat`;
}

/**
 * What the current tab offers. Called on every signal that the tab or its page
 * changed, which is what makes the panel current without a click — the popup
 * could only ever answer this once, when it opened.
 */
async function refreshNow() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id;
  ui.origin.textContent = tab?.url ? new URL(tab.url).hostname.replace(/^www\./, "") : "";

  if (!tab?.id || !tab.url || !/^https?:\/\/([^/]*\.)?youtube\.com\//.test(tab.url)) {
    page = { kind: "other", videos: [] };
    renderPage();
    return;
  }
  try {
    const request: SiteRequest = { type: "fc:page" };
    const response = (await browser.tabs.sendMessage(tab.id, request)) as SiteResponse<PageReport> | undefined;
    page = response?.ok ? response.value : { kind: "other", videos: [] };
  } catch {
    // A tab that predates the extension has no content script in it. Saying so
    // beats an empty listing that looks like a page with nothing on it.
    page = { kind: "other", videos: [] };
    renderPage();
    ui.pageNote.textContent = "Reload this tab — it was open before the extension was.";
    ui.pageNote.hidden = false;
    return;
  }
  renderPage();
}

let settle: ReturnType<typeof setTimeout> | undefined;
const refreshSoon = () => {
  clearTimeout(settle);
  settle = setTimeout(() => void refreshNow(), SETTLE_MS);
};

function clip() {
  const items =
    page.kind === "watch"
      ? [{ id: page.videos[0].id, title: page.videos[0].title }]
      : selected(ui.pageList).map((id) => ({
          id,
          title: page.videos.find((video) => video.id === id)?.title ?? id,
        }));
  if (items.length === 0 || activeTabId === undefined) return;
  void tell({ type: "fc:start", tabId: activeTabId, items, comments: ui.comments.checked });
}

ui.selectAll.addEventListener("click", () => {
  const boxes = [...ui.pageList.querySelectorAll<HTMLInputElement>("input")];
  const turningOn = boxes.some((box) => !box.checked);
  for (const box of boxes) box.checked = turningOn;
  ui.selectAll.textContent = turningOn ? "Select none" : "Select all";
  renderClipButton();
});
ui.pageList.addEventListener("change", renderClipButton);
ui.comments.addEventListener("change", () => void browser.storage.local.set({ [COMMENTS_KEY]: ui.comments.checked }));
ui.clip.addEventListener("click", clip);
ui.clear.addEventListener("click", () => void tell({ type: "fc:clear" }));
ui.send.addEventListener("click", () => void tell({ type: "fc:send" }));

// The background reports by writing storage, so this is the whole update path:
// a panel that was shut for the entire batch opens onto the finished result.
browser.storage.local.onChanged.addListener((changes) => {
  if (changes[TRAY_KEY]) {
    tray = (changes[TRAY_KEY].newValue as TrayItem[] | undefined) ?? [];
    renderTray();
  }
  if (changes[STATUS_KEY]) say(changes[STATUS_KEY].newValue as Status | undefined);
});

browser.tabs.onActivated.addListener(refreshSoon);
browser.tabs.onUpdated.addListener((_tabId, change) => {
  if (change.status === "complete" || change.url) refreshSoon();
});
// A soft navigation changes no tab state Chrome will tell us about, so the
// content script says so itself.
browser.runtime.onMessage.addListener((message) => {
  if ((message as { type?: string })?.type === "fc:nav") refreshSoon();
});

async function start() {
  const stored = await browser.storage.local.get([TRAY_KEY, COMMENTS_KEY, STATUS_KEY]);
  tray = Array.isArray(stored[TRAY_KEY]) ? (stored[TRAY_KEY] as TrayItem[]) : [];
  ui.comments.checked = stored[COMMENTS_KEY] === true;
  say(stored[STATUS_KEY] as Status | undefined);
  renderTray();
  await refreshNow();
}

void start();
