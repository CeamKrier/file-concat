import type { Clipping } from "./markdown";

/** Background -> site content script. */
export type SiteRequest =
  | { type: "fc:page" }
  // `grouped` is told, not inferred. It is a property of the user's selection,
  // which only the panel and the worker can see, and the worker sends one id
  // per request so a handler asked to guess from what it holds always sees one.
  | { type: "fc:clip"; id: string; grouped: boolean; option: boolean; group?: string }
  // A selected item that names a set rather than an item — a YouTube playlist —
  // answered with the items it holds, in the site's own order.
  | { type: "fc:expand"; id: string }
  // Scroll this page until it stops loading rows, then report it again. Only
  // handlers whose report says `more` are ever sent one.
  | { type: "fc:more" };

export interface PageItem {
  id: string;
  title: string;
  /** One line under the title: a duration, a score, whatever the site counts. */
  meta?: string;
  /**
   * This id names a set, not an item. The worker asks the page to expand it
   * before clipping anything, and each item that comes back gets its own tray
   * row — so a playlist that half works reports which half.
   */
  expand?: boolean;
}

/**
 * What a page offers, in the site's own words.
 *
 * The panel knows no site. A handler says which noun to use and what its one
 * opt-in is called, so adding a source touches its own content script and the
 * match pattern on it — which is the whole of the `matches` / `report` / `clip`
 * shape, minus an interface nobody would implement twice.
 */
export interface PageReport {
  /** Namespaces the opt-in so YouTube's and Reddit's are remembered apart. */
  site: string;
  kind: "single" | "list" | "other";
  /** Singular, lower case: "video", "post". The panel builds its labels from it. */
  noun: string;
  items: PageItem[];
  /** The site's one opt-in, or absent where it has none. Always off by default. */
  option?: { label: string; hint: string };
  /**
   * This listing loads more of itself on scroll, and the handler will do that
   * scrolling when asked. The panel offers the button; nothing scrolls a
   * reader's page without a press.
   */
  more?: boolean;
}

/**
 * The two every site handler answers. `fc:expand` reaches only a handler whose
 * pages carry sets, so the others never have to name it.
 */
export type ItemRequest = Extract<SiteRequest, { type: "fc:page" | "fc:clip" }>;

export type SiteResponse<T> = { ok: true; value: T } | { ok: false; error: string };

/** Site content script -> background: this page navigated under its own feet. */
export interface NavSignal {
  type: "fc:nav";
}

/**
 * Site content script -> background: fetch this and hand me the body.
 *
 * A content script's `fetch` runs under the page's CSP, so Hacker News —
 * `default-src 'self'` — blocks the one request its clipping needs. The worker
 * fetches from the extension's own origin under `host_permissions`, where no
 * page policy applies.
 */
export interface FetchRequest {
  type: "fc:fetch";
  url: string;
}

/**
 * One thing to clip. `expand` comes from the panel and says this id has to be
 * opened out first; `group` is set by the worker afterwards, naming the folder
 * the items it opened out belong in.
 */
export interface StartItem {
  id: string;
  title: string;
  expand?: boolean;
  group?: string;
}

/** Panel -> background. Everything the panel wants done outlives the panel. */
export type PanelRequest =
  | { type: "fc:start"; tabId: number; items: StartItem[]; option: boolean }
  | { type: "fc:send" }
  | { type: "fc:remove"; id: string }
  | { type: "fc:clear" }
  // A failed row, run again against the tab it came from. Its own tab, not the
  // active one: a session moves on, and retrying a Reddit thread against
  // whatever is in front of you now would clip the wrong page under the right
  // name. A row whose tab is gone is not offered a retry at all.
  | { type: "fc:retry"; tabId: number; id: string; option: boolean }
  // Sent rows, pushed again. A push replaces same-path files in the tab, so
  // this is how a clip that arrived wrong is corrected in place.
  | { type: "fc:resend"; ids: string[] };

/**
 * A tray row is one clip and its own fate. The popup had a single status line
 * for a whole batch, which could only ever report the last thing that happened;
 * a row that carries its own state can say "this one failed" while its
 * neighbours are still going.
 */
export type ItemState = "queued" | "fetching" | "done" | "failed";

export interface TrayItem {
  id: string;
  title: string;
  state: ItemState;
  /** Set on `failed`, and shown on the row rather than in a shared status line. */
  error?: string;
  /** Set on `done`. The rendered file, ready to push. */
  clipping?: Clipping;
  /**
   * The set this row was opened out of, kept so a retry can file the clip where
   * the first attempt would have. Without it a retried playlist video lands at
   * the top level, in a different place from its siblings.
   */
  group?: string;
  /**
   * Whether the clip this row came from was a batch. Remembered for the same
   * reason as `group`: every handler folders a batch and leaves a lone clip at
   * the top level, so a retry that recomputed this from its own size of one
   * would move the file.
   */
  grouped?: boolean;
  addedAt: number;
}

/**
 * A clip the tool has taken. Sending empties the tray, so this is where a
 * finished clip goes to stay reachable — for a week, which is long enough to
 * notice a bad extraction and short enough that this never becomes a library.
 *
 * It keeps the whole `Clipping` rather than a summary, because both things Sent
 * is for need the file itself: reading it back, and pushing it again to replace
 * what is already in the tab.
 */
export interface SentItem {
  id: string;
  title: string;
  clipping: Clipping;
  sentAt: number;
}

/** How long a sent row stays reachable. Applied when the store is read, so
 *  there is no alarm to register and nothing to run while the browser is shut. */
export const SENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** What the send action last did. One line, because sending is one act. */
export interface Status {
  text: string;
  tone: "" | "working" | "done" | "error";
  at: number;
}

/**
 * `chrome.storage.local` is the whole panel/background protocol: the background
 * writes, the panel renders `storage.onChanged`. A panel that was closed for the
 * entire batch opens onto the finished result with no catch-up message to miss.
 */
export const TRAY_KEY = "tray";
export const SENT_KEY = "sent";
export const STATUS_KEY = "status";
/** Per site, because "include comments" and "expand more comments" are not the
 *  same promise and should not share one remembered answer. */
export const OPTIONS_KEY = "options";

/**
 * Background -> fileconcat.com content script.
 *
 * Answered with a {@link PushAnswer} carrying how many files the *page* said it
 * took. The bridge is in every fileconcat.com tab, including /docs and
 * /privacy, which never mount the listener that takes a batch, so a resolved
 * `sendMessage` proves nothing on its own.
 */
export interface PushRequest {
  type: "fc:push";
  files: Clipping[];
  /**
   * How long the bridge waits for that answer, in ms. Told rather than fixed:
   * a tab that has been open a while replies in a postMessage round trip, while
   * one opened a moment ago has to hydrate first, and only the worker knows
   * which of the two it is pushing into.
   */
  waitMs: number;
}

/**
 * What the bridge answers a push with: the page's own verdict.
 *
 * `final` marks a verdict only the page could have given — it read the batch
 * and refused it. Every other failure means "not here", and the worker's answer
 * to that is to try somewhere else. A refusal travels with the batch, so trying
 * somewhere else can only earn the same refusal and one stray tab.
 */
export type PushAnswer = { ok: true; count: number } | { ok: false; error: string; final?: boolean };

/** The shape the fileconcat.com page listens for on `window.postMessage`. */
export const PUSH_CHANNEL = "fileconcat-clipper";
export const PUSH_VERSION = 1;
