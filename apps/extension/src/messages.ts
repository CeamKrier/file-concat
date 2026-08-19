import type { Clipping } from "./markdown";

/** Background -> site content script. */
export type SiteRequest = { type: "fc:page" } | { type: "fc:clip"; ids: string[]; comments: boolean };

export interface PageReport {
  kind: "watch" | "list" | "other";
  videos: { id: string; title: string; duration?: string }[];
}

export type SiteResponse<T> = { ok: true; value: T } | { ok: false; error: string };

/** Site content script -> background: this page navigated under its own feet. */
export interface NavSignal {
  type: "fc:nav";
}

/** Panel -> background. Everything the panel wants done outlives the panel. */
export type PanelRequest =
  | { type: "fc:start"; tabId: number; items: { id: string; title: string }[]; comments: boolean }
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
export const COMMENTS_KEY = "includeComments";
export const STATUS_KEY = "status";

/** Background -> fileconcat.com content script. */
export interface PushRequest {
  type: "fc:push";
  files: Clipping[];
}

/** The shape the fileconcat.com page listens for on `window.postMessage`. */
export const PUSH_CHANNEL = "fileconcat-clipper";
export const PUSH_VERSION = 1;
