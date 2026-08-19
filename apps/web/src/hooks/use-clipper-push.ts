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

function clippedFiles(data: unknown): ClippedFile[] | null {
  if (typeof data !== "object" || data === null) return null;
  const message = data as { channel?: unknown; type?: unknown; files?: unknown };
  if (message.channel !== CHANNEL || message.type !== "files") return null;
  if (!Array.isArray(message.files) || message.files.length === 0 || message.files.length > MAX_FILES) return null;

  const files: ClippedFile[] = [];
  let total = 0;
  for (const entry of message.files) {
    const file = entry as { path?: unknown; markdown?: unknown };
    if (typeof file.path !== "string" || typeof file.markdown !== "string") return null;
    if (!file.path || file.path.includes("..")) return null;
    total += file.markdown.length;
    if (total > MAX_CHARS) return null;
    files.push({ path: file.path, markdown: file.markdown });
  }
  return files;
}

export function useClipperPush(onFiles: (files: IncomingFile[]) => void) {
  const latest = useRef(onFiles);
  latest.current = onFiles;

  useEffect(() => {
    const announce = () => window.postMessage({ channel: CHANNEL, type: "ready" }, window.location.origin);

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      // The extension asks before it sends, because it may have opened this tab
      // a moment ago and cannot know whether anything is listening yet.
      if ((event.data as { channel?: unknown; type?: unknown })?.type === "ping") {
        if ((event.data as { channel?: unknown }).channel === CHANNEL) announce();
        return;
      }
      const files = clippedFiles(event.data);
      if (!files) return;
      latest.current(
        files.map(({ path, markdown }) => ({
          file: new File([markdown], path.split("/").pop() ?? path, { type: "text/markdown" }),
          path,
        })),
      );
    };

    window.addEventListener("message", onMessage);
    announce();
    return () => window.removeEventListener("message", onMessage);
  }, []);
}
