import type { Clipping } from "./markdown";

/** Popup -> site content script. */
export type SiteRequest = { type: "fc:page" } | { type: "fc:clip"; ids: string[]; comments: boolean };

export interface PageReport {
  kind: "watch" | "list" | "other";
  videos: { id: string; title: string; duration?: string }[];
}

export type SiteResponse<T> = { ok: true; value: T } | { ok: false; error: string };

/** Popup -> fileconcat.com content script. */
export interface PushRequest {
  type: "fc:push";
  files: Clipping[];
}

/** The shape the fileconcat.com page listens for on `window.postMessage`. */
export const PUSH_CHANNEL = "fileconcat-clipper";
export const PUSH_VERSION = 1;
