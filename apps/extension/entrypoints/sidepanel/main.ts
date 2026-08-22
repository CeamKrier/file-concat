// The panel is a view. It asks the current tab what it offers, hands work to
// the background, and renders `chrome.storage.local`.
//
// Nothing here has a duration, which is the whole difference from the popup it
// replaces: close the panel mid-batch and the batch carries on, because the
// batch was never running in here.
//
// The shape is a capture screen with a cart. Now owns the column; the cart is
// pinned to the floor and opens over it; Sent, Settings and Peek are overlays
// one level in. There is no navigation state to be in the wrong one of.

import { browser } from "#imports";
import {
  OPTIONS_KEY,
  SEEN_KEY,
  SENT_KEY,
  SENT_TTL_MS,
  STATUS_KEY,
  TRAY_KEY,
  type PageItem,
  type PageReport,
  type PanelRequest,
  type SentItem,
  type SiteRequest,
  type SiteResponse,
  type Status,
  type TrayItem,
} from "../../src/messages";

/** YouTube settles its DOM after announcing a navigation, and a tab switch can
 *  arrive in a burst. One pause absorbs both. */
const SETTLE_MS = 250;
/** Where a content script of ours runs: any page on the web, now that the
 *  article handler is the catch-all. Anywhere else — `chrome://`, a PDF viewer,
 *  the new tab page — Now says so instead of messaging a tab that cannot answer. */
const SUPPORTED = /^https?:\/\//;
const NO_PAGE: PageReport = { site: "", kind: "other", noun: "item", items: [] };
/** How long a finished status line stays. A working one stays until it is not. */
const TOAST_MS = 4200;
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * How much of a clipping peek puts on screen. Both ends, because the two ways a
 * read goes wrong show up at opposite ends of the file: the wrong page is
 * obvious in the first block, and a transcript or a comment tree that stopped
 * early is only visible at the last one.
 */
const PEEK_HEAD = 200;
const PEEK_TAIL = 40;

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ui = {
  settingsOpen: el<HTMLButtonElement>("settings-open"),
  scroll: el("scroll"),
  intro: el("intro"),
  introDismiss: el<HTMLButtonElement>("intro-dismiss"),
  blank: el("blank"),
  blankWhy: el("blank-why"),
  now: el("now"),
  host: el("host"),
  pageTitle: el("page-title"),
  single: el("single"),
  clip: el<HTMLButtonElement>("clip"),
  list: el("list"),
  listHint: el("list-hint"),
  bulkToggle: el<HTMLButtonElement>("bulk-toggle"),
  rows: el<HTMLUListElement>("rows"),
  echoRow: el("echo-row"),
  echo: el("echo"),
  echoChange: el<HTMLButtonElement>("echo-change"),
  listFoot: el("list-foot"),
  toast: el("toast"),
  toastText: el("toast-text"),
  toastDismiss: el<HTMLButtonElement>("toast-dismiss"),
  bulkBar: el("bulk-bar"),
  bulkCount: el("bulk-count"),
  bulkCancel: el<HTMLButtonElement>("bulk-cancel"),
  bulkClip: el<HTMLButtonElement>("bulk-clip"),
  cartBar: el<HTMLButtonElement>("cart-bar"),
  cartBarCount: el("cart-bar-count"),
  cartBarTitle: el("cart-bar-title"),
  cartBarTokens: el("cart-bar-tokens"),
  cartEmpty: el<HTMLButtonElement>("cart-empty"),
  scrim: el("scrim"),
  cart: el("cart"),
  cartGrab: el<HTMLButtonElement>("cart-grab"),
  cartCount: el("cart-count"),
  cartTitle: el("cart-title"),
  cartClear: el<HTMLButtonElement>("cart-clear"),
  cartHide: el<HTMLButtonElement>("cart-hide"),
  cartList: el<HTMLUListElement>("cart-list"),
  sending: el("sending"),
  sentOpen: el<HTMLButtonElement>("sent-open"),
  sentLinkText: el("sent-link-text"),
  cartTokens: el("cart-tokens"),
  send: el<HTMLButtonElement>("send"),
  sent: el("sent"),
  sentClose: el<HTMLButtonElement>("sent-close"),
  sentGroups: el("sent-groups"),
  sentEmpty: el("sent-empty"),
  settings: el("settings"),
  settingsClose: el<HTMLButtonElement>("settings-close"),
  setHost: el("set-host"),
  opt: el<HTMLButtonElement>("opt"),
  optName: el("opt-name"),
  optNote: el("opt-note"),
  optNone: el("opt-none"),
  introReplay: el<HTMLButtonElement>("intro-replay"),
  peek: el("peek"),
  peekClose: el<HTMLButtonElement>("peek-close"),
  peekPath: el("peek-path"),
  peekTokens: el("peek-tokens"),
  peekTitle: el("peek-title"),
  peekSource: el("peek-source"),
  peekBody: el("peek-body"),
};

let tray: TrayItem[] = [];
let sent: SentItem[] = [];
let page: PageReport = NO_PAGE;
let activeTabId: number | undefined;
/** One remembered answer per site, so YouTube's and Reddit's stay apart. */
let options: Record<string, boolean> = {};
let status: Status | undefined;

let cartOpen = false;
/** Which overlay is up, if any. One at a time: they are all the whole panel. */
let overlay: "sent" | "settings" | "peek" | null = null;
/** Where peek was opened from, so Back returns there. */
let peekFrom: "cart" | "sent" = "cart";
let bulk = false;
const picked = new Set<string>();
/** The set opened out in the list, and what it holds once the page answered. */
let expanded: string | null = null;
let held: PageItem[] = [];
/** One updater per visible row, so a tray change repaints the marks without
 *  rebuilding the list — which would throw away the scroll position every time
 *  you tapped a row halfway down a channel page. */
let repaint = new Map<string, () => void>();
let toastTimer: ReturnType<typeof setTimeout> | undefined;

const tell = (request: PanelRequest) => browser.runtime.sendMessage(request);
const option = () => options[page.site] === true;
const files = (n: number) => `${n} ${n === 1 ? "file" : "files"}`;

/** chars ÷ 4, the same forecast the web app falls back to on a bundle too big
 *  to tokenize. The tilde is not decoration: the exact count is the tab's job
 *  once the batch lands, and an unmarked approximation would be a lie. */
const tokens = (markdown: string) => Math.ceil(markdown.length / 4);
const fmt = (n: number) => (n >= 1000 ? `~${(n / 1000).toFixed(1)}k` : `~${n}`);

/** The store is filtered when it is read, in the worker and here alike: a panel
 *  opened after a week away must not show a row the next write will drop. */
const fresh = (rows: SentItem[]) => rows.filter((row) => row.sentAt > Date.now() - SENT_TTL_MS);

// ---------- drawn marks ----------

/** Drawn, not typed. A × is a letter wearing an icon's clothes, and so is a ▼. */
function icon(path: string, size = 12): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
  line.setAttribute("d", path);
  line.setAttribute("stroke", "currentColor");
  line.setAttribute("stroke-width", "1.6");
  line.setAttribute("stroke-linecap", "round");
  line.setAttribute("stroke-linejoin", "round");
  svg.append(line);
  return svg;
}

const MARK = {
  close: "M4 4 L12 12 M12 4 L4 12",
  check: "M3.5 8.5 L6.5 11.5 L12.5 4.5",
  down: "M4 6.5 L8 10.5 L12 6.5",
  up: "M4 9.5 L8 5.5 L12 9.5",
  left: "M9.5 3.5 L5 8 L9.5 12.5",
  right: "M6.5 3.5 L11 8 L6.5 12.5",
  sliders: "M2.5 5 H9 M12 5 H13.5 M2.5 11 H5 M8 11 H13.5 M10.5 3.5 V6.5 M6.5 9.5 V12.5",
};

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Puts a mark in front of a control that already has its words in the markup. */
function lead(button: HTMLElement, path: string) {
  button.prepend(icon(path, 13));
}

// ---------- Now ----------

function renderPage() {
  repaint = new Map();
  ui.rows.replaceChildren();
  ui.blank.hidden = page.kind !== "other";
  ui.now.hidden = page.kind === "other";
  ui.single.hidden = page.kind !== "single";
  ui.list.hidden = page.kind !== "list";
  ui.listFoot.hidden = page.kind !== "list";
  ui.echoRow.hidden = !page.option || page.kind === "other";

  if (page.option) {
    ui.echo.textContent = option()
      ? `${page.option.label}: on, remembered for this site`
      : `${page.option.label}: off for this site`;
  }

  if (page.kind === "other") {
    renderBulk();
    return;
  }

  if (page.kind === "single") {
    const inCart = tray.some((row) => row.id === page.items[0].id);
    ui.clip.dataset.in = String(inCart);
    ui.clip.setAttribute("aria-pressed", String(inCart));
    ui.clip.textContent = inCart ? "In cart · tap to take it out" : `Clip this ${page.noun}`;
    renderBulk();
    return;
  }

  ui.bulkToggle.textContent = bulk ? "Done" : "Select";
  ui.bulkToggle.setAttribute("aria-pressed", String(bulk));
  ui.listHint.textContent = bulk
    ? "Pick the ones you want."
    : `${page.items.length} on this page. Tap one to clip it.`;
  ui.listFoot.textContent = bulk
    ? "Multi-select ends when the batch is queued."
    : "Rows are in the page's own order.";

  for (const item of page.items) ui.rows.append(row(item));
  renderBulk();
}

function row(item: PageItem): HTMLLIElement {
  const li = h("li", "row");
  const main = h("div", "row-main");
  const tap = h("button", "row-tap");
  tap.type = "button";

  const box = h("span", "box");
  box.append(icon(MARK.check, 11));
  const text = h("span", "row-text");
  const title = h("span", "row-title", item.title);
  title.title = item.title;
  const meta = h("span", "row-meta");
  text.append(title, meta);
  tap.append(box, text);

  const rail = h("div", "row-rail");
  const mark = h("span", "rail-mark");
  mark.append(icon(MARK.check, 12));
  mark.title = "In the cart. Tap the row to take it out.";

  const caret = h("button", "rail-btn");
  caret.type = "button";
  caret.setAttribute("aria-label", `Show what ${item.title} holds`);
  caret.append(icon(MARK.down, 12));
  caret.addEventListener("click", () => void openHeld(item.id));

  main.append(tap, rail);
  li.append(main);

  const paint = () => {
    const inCart = tray.some((entry) => entry.id === item.id) && !bulk;
    const isPicked = picked.has(item.id);
    li.dataset.in = String(inCart);
    li.dataset.picked = String(isPicked);
    box.hidden = !bulk;
    meta.textContent = inCart ? "In cart · tap to take it out" : (item.meta ?? "");
    tap.setAttribute("aria-pressed", String(bulk ? isPicked : inCart));
    tap.title = inCart ? "Take this out of the cart" : "Clip this into the cart";
    const opens = item.expand === true && !bulk;
    // An empty rail is a divider drawn down the side of every row for nothing,
    // which is what a fixed-width slot costs when most rows have no use for it.
    rail.hidden = !inCart && !opens;
    rail.replaceChildren(...(inCart ? [mark] : []), ...(opens ? [caret] : []));
    caret.setAttribute("aria-expanded", String(expanded === item.id));
    caret.replaceChildren(icon(expanded === item.id ? MARK.up : MARK.down, 12));
  };

  tap.addEventListener("click", () => {
    if (bulk) {
      if (picked.has(item.id)) picked.delete(item.id);
      else picked.add(item.id);
      paint();
      renderBulk();
      return;
    }
    const inCart = tray.some((entry) => entry.id === item.id);
    if (inCart) void tell({ type: "fc:remove", id: item.id });
    else void queue([{ id: item.id, title: item.title, expand: item.expand }]);
  });

  paint();
  repaint.set(item.id, paint);
  if (expanded === item.id) li.append(heldList(item));
  return li;
}

/** What a set holds, listed under the row it belongs to. Only the panel can ask
 *  for this: the worker opens a set out at clip time, which is too late to pick
 *  one video out of a playlist you have not clipped yet. */
function heldList(parent: PageItem): HTMLElement {
  const wrap = h("div", "held");
  for (const video of held) {
    const tap = h("button", "held-tap");
    tap.type = "button";
    const text = h("span", "row-text");
    const title = h("span", "held-title", video.title);
    title.title = video.title;
    const meta = h("span", "held-meta", video.meta ?? "");
    text.append(title, meta);
    const tag = h("span", "held-tag");
    tap.append(text, tag);

    const paint = () => {
      const inCart = tray.some((entry) => entry.id === video.id);
      tag.textContent = inCart ? "in cart" : "clip";
      tap.setAttribute("aria-pressed", String(inCart));
      tap.title = inCart ? "Take this out of the cart" : "Clip this video";
    };
    tap.addEventListener("click", () => {
      if (tray.some((entry) => entry.id === video.id)) void tell({ type: "fc:remove", id: video.id });
      // Filed under the set it came out of, exactly where clipping the whole
      // row would have put it.
      else void queue([{ id: video.id, title: video.title, group: parent.title }]);
    });
    paint();
    repaint.set(video.id, paint);
    wrap.append(tap);
  }

  const foot = h("div", "held-foot");
  foot.append(
    document.createTextNode(
      held.length === 0
        ? "This page did not say what the set holds."
        : `${held.length} here. The row above clips every one.`,
    ),
  );
  wrap.append(foot);
  return wrap;
}

async function openHeld(id: string) {
  if (expanded === id) {
    expanded = null;
    held = [];
    renderPage();
    return;
  }
  if (activeTabId === undefined) return;
  try {
    const request: SiteRequest = { type: "fc:expand", id };
    const response = (await browser.tabs.sendMessage(activeTabId, request)) as SiteResponse<PageItem[]> | undefined;
    held = response?.ok ? response.value : [];
    if (response && !response.ok) say({ text: response.error, tone: "error", at: Date.now() });
  } catch {
    held = [];
    say({ text: "This page stopped answering. Reload it and try again.", tone: "error", at: Date.now() });
  }
  expanded = id;
  renderPage();
}

function renderBulk() {
  ui.bulkCount.textContent = `${picked.size} selected`;
  ui.bulkClip.textContent = `Clip ${picked.size}`;
  renderFloor();
}

function queue(items: { id: string; title: string; expand?: boolean; group?: string }[]) {
  if (items.length === 0 || activeTabId === undefined) return;
  return tell({ type: "fc:start", tabId: activeTabId, items, option: option() });
}

// ---------- the cart ----------

function renderCart() {
  const total = tray.reduce((sum, item) => sum + (item.clipping ? tokens(item.clipping.markdown) : 0), 0);
  const failed = tray.filter((item) => item.state === "failed").length;
  const ready = tray.filter((item) => item.state === "done").length;
  const label = `${tray.length === 1 ? "1 clip" : `${tray.length} clips`} in the cart`;
  const figure = failed ? `${fmt(total)} tokens · ${failed} failed` : `${fmt(total)} tokens`;

  ui.cartBarCount.textContent = String(tray.length);
  ui.cartBarTitle.textContent = label;
  ui.cartBarTokens.textContent = figure;
  ui.cartCount.textContent = String(tray.length);
  ui.cartTitle.textContent = label;
  ui.cartTokens.textContent = figure;

  ui.send.disabled = ready === 0;
  ui.send.textContent = ready === 0 ? "Nothing to send" : `Send ${ready}`;
  ui.sending.hidden = status?.tone !== "working";
  ui.sentLinkText.textContent = sent.length
    ? `Already sent · ${files(sent.length)}, last 7 days`
    : "Already sent · nothing in the last 7 days";

  ui.cartList.replaceChildren(...tray.map(clipRow));
  for (const paint of repaint.values()) paint();
  renderFloor();
}

/** The folder a clipping landed in, or nothing when it landed at the top. */
const folder = (path: string) => path.split("/").slice(0, -1).join("/");

function where(item: TrayItem): string {
  if (item.state === "failed") return item.error ?? "";
  if (item.clipping) return folder(item.clipping.path);
  return item.state === "fetching" ? "Reading…" : "Queued";
}

function clipRow(item: TrayItem): HTMLLIElement {
  const li = h("li", "clip");
  li.dataset.state = item.state;

  const head = h("div", "clip-head");
  const text = h("span", "clip-text");
  const title = h("span", "clip-title", item.clipping?.path.split("/").pop() ?? item.title);
  // A panel is narrow enough that most names truncate; the full one has to be
  // reachable without widening the panel.
  title.title = title.textContent ?? "";
  // A finished row shows where it landed; a failed one shows why. Where it
  // landed is the folder, not the whole path: the file name is already the
  // title above, so a full path repeats it word for word on every clip that
  // has no folder — which is every clip taken one at a time.
  const meta = h("span", "clip-meta", where(item));
  meta.hidden = meta.textContent === "";
  text.append(title, meta);
  const figure = h("span", "clip-tokens", item.clipping ? fmt(tokens(item.clipping.markdown)) : "—");
  head.append(text, figure);

  const acts = h("div", "clip-acts");
  if (item.clipping) {
    const peek = h("button", "mini", "Peek");
    peek.type = "button";
    peek.addEventListener("click", () =>
      openPeek({
        title: item.title,
        path: item.clipping!.path,
        markdown: item.clipping!.markdown,
        source: item.clipping!.source,
      }, "cart"),
    );
    acts.append(peek);
  }
  // Only while the tab it came from is still open: clipping is a question put
  // to a page, and there is no route to the content without one.
  if (item.state === "failed" && activeTabId !== undefined) {
    const again = h("button", "mini go", "Retry");
    again.type = "button";
    again.addEventListener("click", () => {
      if (activeTabId !== undefined) void tell({ type: "fc:retry", tabId: activeTabId, id: item.id, option: option() });
    });
    acts.append(again);
  }
  const remove = h("button", "mini quiet", "Remove");
  remove.type = "button";
  remove.addEventListener("click", () => void tell({ type: "fc:remove", id: item.id }));
  acts.append(remove);

  li.append(head, acts);
  return li;
}

/** Which of the three floor states is showing, and where that puts the toast. */
function renderFloor() {
  const busy = overlay !== null;
  const open = cartOpen && tray.length > 0 && !busy;
  const picking = bulk && picked.size > 0 && page.kind === "list" && !busy && !open;
  ui.bulkBar.hidden = !picking;
  // Picking outranks the cart: the bar you are working in is the one that
  // belongs at the floor, and two stacked bars is the thing being avoided.
  ui.cartBar.hidden = busy || open || picking || tray.length === 0;
  ui.cartEmpty.hidden = busy || picking || tray.length > 0;
  ui.scrim.hidden = !open;
  ui.cart.hidden = !open;

  const floor = [ui.bulkBar, ui.cartBar, ui.cartEmpty].find((node) => !node.hidden);
  ui.toast.style.bottom = `${(floor?.offsetHeight ?? 0) + 10}px`;
}

// ---------- overlays ----------

function renderOverlay() {
  ui.sent.hidden = overlay !== "sent";
  ui.settings.hidden = overlay !== "settings";
  ui.peek.hidden = overlay !== "peek";
  if (overlay === "sent") renderSent();
  if (overlay === "settings") renderSettings();
  renderFloor();
  // The overlay covers everything under it, so the keyboard has to come along.
  const back = { sent: ui.sentClose, settings: ui.settingsClose, peek: ui.peekClose };
  if (overlay) back[overlay].focus();
}

function renderSent() {
  ui.sentEmpty.hidden = sent.length > 0;
  const days = new Map<string, SentItem[]>();
  for (const item of sent) {
    const key = new Date(item.sentAt).toDateString();
    days.set(key, [...(days.get(key) ?? []), item]);
  }

  const today = new Date().toDateString();
  const groups = [...days].map(([key, rows]) => {
    const group = h("div", "group");
    const head = h("div", "group-head");
    const when =
      key === today
        ? "Today"
        : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(key));
    head.append(h("span", "group-label", `${when} · ${files(rows.length)}`), h("span", "group-hint", leaves(rows)));

    const again = h("button", "again", "Send again");
    again.type = "button";
    again.addEventListener("click", () => void tell({ type: "fc:resend", ids: rows.map((row) => row.id) }));
    head.append(again);

    const list = h("ul");
    for (const item of rows) {
      const li = h("li", "sent-row");
      const text = h("span", "clip-text");
      const title = h("span", "clip-title", item.title);
      title.title = item.title;
      const meta = h("span", "clip-meta", folder(item.clipping.path));
      meta.hidden = meta.textContent === "";
      text.append(title, meta);
      const peek = h("button", "again", "Peek");
      peek.type = "button";
      peek.addEventListener("click", () =>
        openPeek({
          title: item.title,
          path: item.clipping.path,
          markdown: item.clipping.markdown,
          source: item.clipping.source,
        }, "sent"),
      );
      li.append(text, h("span", "sent-tokens", fmt(tokens(item.clipping.markdown))), peek);
      list.append(li);
    }
    group.append(head, list);
    return group;
  });
  ui.sentGroups.replaceChildren(...groups);
}

/** When the oldest row in a group falls off. The group is one send, so they all
 *  go together and the earliest is the whole group's clock. */
function leaves(rows: SentItem[]): string {
  const oldest = Math.min(...rows.map((row) => row.sentAt));
  const left = Math.ceil((oldest + SENT_TTL_MS - Date.now()) / DAY_MS);
  if (left <= 0) return "leaves today";
  if (left === 1) return "leaves tomorrow";
  return `leaves in ${left} days`;
}

function renderSettings() {
  ui.setHost.textContent = ui.host.textContent || "this page";
  ui.opt.hidden = !page.option;
  ui.optNone.hidden = !!page.option;
  if (page.option) {
    ui.optName.textContent = page.option.label;
    ui.optNote.textContent = page.option.hint;
    ui.opt.setAttribute("aria-pressed", String(option()));
  }
}

function openPeek(clip: { title: string; path: string; markdown: string; source: string }, from: "cart" | "sent") {
  peekFrom = from;
  ui.peekPath.textContent = clip.path;
  ui.peekPath.title = clip.path;
  ui.peekTokens.textContent = fmt(tokens(clip.markdown));
  const heading = /^#\s+(.+)$/m.exec(clip.markdown);
  ui.peekTitle.textContent = heading?.[1] ?? clip.title;
  ui.peekSource.textContent = `Clipped from ${clip.source} · Markdown`;
  ui.peekBody.replaceChildren(...readable(heading ? clip.markdown.replace(heading[0], "") : clip.markdown));
  overlay = "peek";
  renderOverlay();
}

/**
 * Markdown as something to read, in three kinds: heading, quote, paragraph.
 *
 * Not a renderer. Peek answers one question — did the read come through — and
 * the answer is in the words, so the marks are stripped and nothing else is
 * interpreted. A parser here would be a dependency bought to make a check
 * prettier.
 */
function readable(markdown: string): HTMLElement[] {
  const blocks = markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const shown =
    blocks.length > PEEK_HEAD + PEEK_TAIL
      ? [...blocks.slice(0, PEEK_HEAD), null, ...blocks.slice(-PEEK_TAIL)]
      : blocks;

  return shown.map((block) => {
    if (block === null) {
      return h(
        "p",
        "sheet-note",
        `${blocks.length - PEEK_HEAD - PEEK_TAIL} blocks not shown. The whole file is what gets sent.`,
      );
    }
    if (/^#{1,6}\s/.test(block)) return h("h3", undefined, block.replace(/^#{1,6}\s*/, ""));
    if (block.startsWith(">")) {
      return h("blockquote", undefined, block.replace(/^>[ \t]?/gm, ""));
    }
    return h("p", undefined, block);
  });
}

// ---------- status ----------

function say(next: Status | undefined) {
  status = next;
  clearTimeout(toastTimer);
  const fresh = next && next.text && Date.now() - next.at < TOAST_MS;
  ui.toast.hidden = !fresh;
  if (!fresh) {
    ui.sending.hidden = true;
    renderFloor();
    return;
  }
  ui.toast.dataset.tone = next!.tone;
  ui.toastText.textContent = next!.text;
  ui.sending.hidden = next!.tone !== "working";
  // A working line stays until the work replaces it. Everything else has said
  // what it had to say.
  if (next!.tone !== "working") toastTimer = setTimeout(() => say(undefined), TOAST_MS);
  renderFloor();
}

// ---------- the current tab ----------

/**
 * What the current tab offers. Called on every signal that the tab or its page
 * changed, which is what makes the panel current without a click — the popup
 * could only ever answer this once, when it opened.
 */
async function refreshNow() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id;
  bulk = false;
  picked.clear();
  expanded = null;
  held = [];
  ui.host.textContent = tab?.url ? new URL(tab.url).hostname.replace(/^www\./, "") : "";

  if (!tab?.id || !tab.url || !SUPPORTED.test(tab.url)) {
    page = NO_PAGE;
    ui.blankWhy.textContent = tab?.url
      ? "This is a browser page, so no content script can run on it."
      : "There is no page here.";
    renderPage();
    return;
  }
  try {
    const request: SiteRequest = { type: "fc:page" };
    const response = (await browser.tabs.sendMessage(tab.id, request)) as SiteResponse<PageReport> | undefined;
    page = response?.ok ? response.value : NO_PAGE;
    ui.blankWhy.textContent = "This page has nothing the panel can read.";
  } catch {
    // A tab that predates the extension has no content script in it. Saying so
    // beats an empty listing that looks like a page with nothing on it.
    page = NO_PAGE;
    ui.blankWhy.textContent = "Reload this tab — it was open before the extension was.";
  }
  // The page's own title, which the report has no field for and does not need
  // one for: a single item names itself, and a listing is named by its tab.
  ui.pageTitle.textContent = page.kind === "single" ? page.items[0].title : (tab.title ?? "");
  renderPage();
}

let settle: ReturnType<typeof setTimeout> | undefined;
const refreshSoon = () => {
  clearTimeout(settle);
  settle = setTimeout(() => void refreshNow(), SETTLE_MS);
};

// ---------- wiring ----------

lead(ui.settingsOpen, MARK.sliders);
lead(ui.settingsClose, MARK.left);
lead(ui.sentClose, MARK.left);
lead(ui.peekClose, MARK.left);
ui.cartHide.append(icon(MARK.down, 12));
ui.introDismiss.append(icon(MARK.close, 12));
ui.toastDismiss.append(icon(MARK.close, 12));
ui.cartBar.querySelector(".review")?.append(icon(MARK.up, 11));
ui.cartEmpty.querySelector(".cart-empty-more")?.append(icon(MARK.right, 11));
ui.sentOpen.querySelector("span:last-child")?.append(icon(MARK.right, 11));

const closeOverlay = () => {
  overlay = null;
  renderOverlay();
};

ui.settingsOpen.addEventListener("click", () => {
  overlay = "settings";
  renderOverlay();
});
ui.settingsClose.addEventListener("click", closeOverlay);
ui.peekClose.addEventListener("click", () => {
  // Back to where it was opened from. Peek is reached from the cart and from
  // Sent, and landing on the one you were not looking at is a lost place.
  overlay = peekFrom === "sent" ? "sent" : null;
  renderOverlay();
});
ui.sentClose.addEventListener("click", closeOverlay);
ui.sentOpen.addEventListener("click", () => {
  overlay = "sent";
  renderOverlay();
});
ui.cartEmpty.addEventListener("click", () => {
  overlay = "sent";
  renderOverlay();
});

ui.opt.addEventListener("click", () => {
  if (!page.site || !page.option) return;
  options = { ...options, [page.site]: !option() };
  void browser.storage.local.set({ [OPTIONS_KEY]: options });
  renderSettings();
  renderPage();
});

ui.introDismiss.addEventListener("click", () => {
  ui.intro.hidden = true;
  void browser.storage.local.set({ [SEEN_KEY]: true });
});
ui.introReplay.addEventListener("click", () => {
  ui.intro.hidden = false;
  void browser.storage.local.set({ [SEEN_KEY]: false });
  closeOverlay();
});

ui.clip.addEventListener("click", () => {
  const item = page.items[0];
  if (!item) return;
  if (tray.some((entry) => entry.id === item.id)) void tell({ type: "fc:remove", id: item.id });
  else void queue([{ id: item.id, title: item.title }]);
});
ui.echoChange.addEventListener("click", () => {
  overlay = "settings";
  renderOverlay();
});

ui.bulkToggle.addEventListener("click", () => {
  bulk = !bulk;
  picked.clear();
  renderPage();
});
ui.bulkCancel.addEventListener("click", () => {
  bulk = false;
  picked.clear();
  renderPage();
});
ui.bulkClip.addEventListener("click", () => {
  const chosen = page.items.filter((item) => picked.has(item.id));
  bulk = false;
  picked.clear();
  void queue(chosen.map((item) => ({ id: item.id, title: item.title, expand: item.expand })));
  renderPage();
});

const openCart = () => {
  cartOpen = true;
  renderFloor();
};
const shutCart = () => {
  cartOpen = false;
  renderFloor();
};
ui.cartBar.addEventListener("click", openCart);
ui.cartHide.addEventListener("click", shutCart);
ui.cartGrab.addEventListener("click", shutCart);
ui.scrim.addEventListener("click", shutCart);
ui.cartClear.addEventListener("click", () => void tell({ type: "fc:clear" }));
ui.send.addEventListener("click", () => void tell({ type: "fc:send" }));
ui.toastDismiss.addEventListener("click", () => say(undefined));

// Escape backs out one level, which is the only nesting the panel has.
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (overlay === "peek") ui.peekClose.click();
  else if (overlay) closeOverlay();
  else if (cartOpen) shutCart();
  else if (bulk) ui.bulkCancel.click();
});

// The background reports by writing storage, so this is the whole update path:
// a panel that was shut for the entire batch opens onto the finished result.
browser.storage.local.onChanged.addListener((changes) => {
  if (changes[TRAY_KEY]) {
    tray = (changes[TRAY_KEY].newValue as TrayItem[] | undefined) ?? [];
    renderCart();
    if (page.kind === "single") renderPage();
  }
  if (changes[SENT_KEY]) {
    sent = fresh((changes[SENT_KEY].newValue as SentItem[] | undefined) ?? []);
    renderCart();
    if (overlay === "sent") renderSent();
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
  const stored = await browser.storage.local.get([TRAY_KEY, SENT_KEY, OPTIONS_KEY, STATUS_KEY, SEEN_KEY]);
  tray = Array.isArray(stored[TRAY_KEY]) ? (stored[TRAY_KEY] as TrayItem[]) : [];
  sent = fresh(Array.isArray(stored[SENT_KEY]) ? (stored[SENT_KEY] as SentItem[]) : []);
  options = (stored[OPTIONS_KEY] as Record<string, boolean> | undefined) ?? {};
  ui.intro.hidden = stored[SEEN_KEY] === true;
  say(stored[STATUS_KEY] as Status | undefined);
  renderCart();
  renderOverlay();
  await refreshNow();
}

void start();
