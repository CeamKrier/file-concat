import { useEffect, useRef } from "react";

import type { IncomingFile } from "./use-file-ingestion";

/**
 * Receives a batch of clippings from the FileConcat browser extension.
 *
 * The extension's content script relays a batch with `window.postMessage`
 * rather than `externally_connectable`, so nothing here knows an extension id
 * and the page keeps working with no extension installed (ADR-0018). What
 * arrives is finished `.md` files; from `ingestBatch` down they are
 * indistinguishable from dropped ones.
 *
 * `window.postMessage` is reachable by any script on the page, so the payload
 * is validated, not trusted.
 */
const CHANNEL = "fileconcat-clipper";
const MAX_FILES = 200;
const MAX_CHARS = 4_000_000;

type ClippedFile = { path: string; markdown: string };

/**
 * `null` is "not addressed to us" and gets no reply — anything on the page can
 * postMessage, and answering all of it would be a beacon. A `reason` is "ours,
 * and refused", which the extension has to hear: both used to be the same
 * silent `null`, so a batch this hook threw away was reported as delivered.
 *
 * The reason names the limit that was hit and never the value that hit it. It
 * travels back out to an extension, and a path or a file name is user content.
 */
type Verdict = { ok: true; files: ClippedFile[] } | { ok: false; reason: string };

function clippedFiles(data: unknown): Verdict | null {
  if (typeof data !== "object" || data === null) return null;
  const message = data as { channel?: unknown; type?: unknown; files?: unknown };
  if (message.channel !== CHANNEL || message.type !== "files") return null;
  if (!Array.isArray(message.files) || message.files.length === 0)
    return { ok: false, reason: "That push carried no files." };
  if (message.files.length > MAX_FILES)
    return { ok: false, reason: `A push carries at most ${MAX_FILES} files.` };

  const files: ClippedFile[] = [];
  let total = 0;
  for (const entry of message.files) {
    const file = entry as { path?: unknown; markdown?: unknown };
    if (typeof file.path !== "string" || typeof file.markdown !== "string")
      return { ok: false, reason: "A file in that push was not a path and Markdown." };
    // `..` is traversal only as a whole segment. As a substring it is an
    // ellipsis, and titles are full of them: a Reddit thread called "Wait...
    // what?" clips to "Wait... what.md" and this refused it, along with every
    // other file in the batch it happened to travel in. Measured on a real
    // subreddit, where one of nine clippings failed the whole send.
    if (!file.path || file.path.split("/").some((segment) => segment === "" || segment === "." || segment === ".."))
      return { ok: false, reason: "A file in that push had a path this page will not take." };
    total += file.markdown.length;
    if (total > MAX_CHARS)
      return { ok: false, reason: `A push carries at most ${MAX_CHARS / 1_000_000} million characters.` };
    files.push({ path: file.path, markdown: file.markdown });
  }
  return { ok: true, files };
}

export function useClipperPush(onFiles: (files: IncomingFile[]) => void) {
  const latest = useRef(onFiles);
  latest.current = onFiles;

  useEffect(() => {
    const reply = (payload: Record<string, unknown>) =>
      window.postMessage({ channel: CHANNEL, ...payload }, window.location.origin);
    const announce = () => reply({ type: "ready" });

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      // The extension asks before it sends, because it may have opened this tab
      // a moment ago and cannot know whether anything is listening yet.
      if ((event.data as { channel?: unknown; type?: unknown })?.type === "ping") {
        if ((event.data as { channel?: unknown }).channel === CHANNEL) announce();
        return;
      }
      const verdict = clippedFiles(event.data);
      if (!verdict) return;
      if (!verdict.ok) {
        reply({ type: "rejected", reason: verdict.reason });
        return;
      }
      latest.current(
        verdict.files.map(({ path, markdown }) => ({
          file: new File([markdown], path.split("/").pop() ?? path, { type: "text/markdown" }),
          path,
        })),
      );
      // `received` promises exactly this much: the batch crossed and was taken.
      // `onFiles` starts ingestion and returns before it finishes, so nothing
      // here knows whether the files read cleanly or how many survive the
      // filters — and the extension's status line must not claim more.
      reply({ type: "received", count: verdict.files.length });
    };

    window.addEventListener("message", onMessage);
    announce();
    return () => window.removeEventListener("message", onMessage);
  }, []);
}
