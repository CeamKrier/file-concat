import type { Clipping } from "./markdown";

/** Background -> site content script. */
export type SiteRequest = { type: "fc:page" } | { type: "fc:clip"; ids: string[]; option: boolean };

export interface PageItem {
  id: string;
  title: string;
  /** One line under the title: a duration, a score, whatever the site counts. */
  meta?: string;
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
}

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

/** Panel -> background. Everything the panel wants done outlives the panel. */
export type PanelRequest =
  | { type: "fc:start"; tabId: number; items: { id: string; title: string }[]; option: boolean }
  | { type: "fc:send" }
  | { type: "fc:remove"; id: string }
  | { type: "fc:clear" };

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
  addedAt: number;
}

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
export const STATUS_KEY = "status";
/** Per site, because "include comments" and "expand more comments" are not the
 *  same promise and should not share one remembered answer. */
export const OPTIONS_KEY = "options";

/** Background -> fileconcat.com content script. */
export interface PushRequest {
  type: "fc:push";
  files: Clipping[];
}

/** The shape the fileconcat.com page listens for on `window.postMessage`. */
export const PUSH_CHANNEL = "fileconcat-clipper";
export const PUSH_VERSION = 1;
