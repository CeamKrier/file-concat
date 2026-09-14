// Gemini conversations, read from gemini.google.com's own RPC rather than
// the page.
//
// The page renders a window (2 of 105 user turns with text after load,
// measured 2026-09-14) and reads a conversation with one batchexecute call,
// `hNvQHb`, on the session cookie plus the page's CSRF token. The payload is
// protobuf rendered as nested JSON arrays, so every field below is a
// position, not a name; positions never moved across the 29 conversations
// measured (2026-01 to 2026-09), fields only appeared or went null. Design
// and figures in docs/clipper-chat-plan.md, "Gemini".

import { type ChatBlock, type ChatClipping, mergeChatBlocks } from "./markdown";

const APP = /^\/app\/([0-9a-f]{16})$/;

export function conversationRef(pathname: string): string | null {
  return pathname.match(APP)?.[1] ?? null;
}

export const geminiUrl = (id: string) => `https://gemini.google.com/app/${id}`;

export const SHAPE_CHANGED =
  "Gemini changed the shape of this conversation. Reload the extension, and if this persists, report it.";

// ---------- positional access ----------

/** One element of the payload's turn array; everything inside is reached by position. */
export type Turn = unknown[];

const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const str = (value: unknown): string => (typeof value === "string" ? value : "");

/** `at(v, 3, 0, 0)` is `v[3][0][0]` with every missing step undefined. The
 *  rich-content slot is an object with numeric keys, which indexes the same way. */
function at(value: unknown, ...path: number[]): unknown {
  let current: unknown = value;
  for (const index of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<number, unknown>)[index];
  }
  return current;
}

// ---------- the envelope ----------

/**
 * The `hNvQHb` payload out of a batchexecute body: `)]}'`, a blank line, then
 * `<length>\n<json line>` chunks. The length is not a JS string index (it
 * miscounts multi-byte text), so every line that starts with `[` is parsed
 * and the `wrb.fr` entry is taken from the first that has one. A null payload
 * is the server's answer for an id the account has no conversation for.
 */
export function parseBatch(text: string): unknown[] | null {
  for (const line of text.split("\n")) {
    if (!line.startsWith("[")) continue;
    let chunk: unknown;
    try {
      chunk = JSON.parse(line);
    } catch {
      continue;
    }
    for (const entry of arr(chunk)) {
      if (!Array.isArray(entry) || entry[0] !== "wrb.fr") continue;
      if (entry[2] === null) return null;
      let payload: unknown;
      try {
        payload = JSON.parse(str(entry[2]));
      } catch {
        throw new Error(SHAPE_CHANGED);
      }
      if (!Array.isArray(payload) || !Array.isArray(payload[0])) throw new Error(SHAPE_CHANGED);
      return payload;
    }
  }
  throw new Error(SHAPE_CHANGED);
}

/** The page's CSRF token, `WIZ_global_data.SNlM0e`, which the page's inline
 *  script sets and an isolated-world content script can only read as text. */
export function readToken(html: string): string | null {
  return html.match(/"SNlM0e":"([^"]+)"/)?.[1] ?? null;
}
