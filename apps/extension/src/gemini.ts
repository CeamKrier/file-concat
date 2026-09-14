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

// ---------- turns ----------

/** Turns in file order. The RPC answers newest first. */
const oldestFirst = (turns: Turn[]): Turn[] => turns.slice().reverse();

const candidateOf = (turn: Turn): unknown => at(turn, 3, 0, 0);

/** `[image: name]` for an image entry, `[file: name]` for anything else. */
function fileLine(entry: unknown): string {
  const image = at(entry, 1) === 1;
  const name = str(at(entry, 2)) || (image ? "image" : "file");
  return `[${image ? "image" : "file"}: ${name}]`;
}

/** The question first, so the frontmatter description is the question; then
 *  one line per file uploaded on this turn (slot 3, not the accumulated slot 4). */
function userBlock(turn: Turn): ChatBlock {
  const text = at(turn, 2, 0, 0);
  if (typeof text !== "string") throw new Error(SHAPE_CHANGED);
  const files = arr(at(turn, 2, 0, 4, 0, 3)).map(fileLine).join("\n");
  return { kind: "user", text: [text, files].filter(Boolean).join("\n\n") };
}

/** The page draws rich content where the answer text holds
 *  `http://googleusercontent.com/<kind>_content/<n>`; the file gets a
 *  reference built from the card at that index, or the kind's name alone. */
function placeholder(candidate: unknown, kind: string, index: number): string {
  if (kind === "youtube") {
    const card = at(candidate, 12, 4, index, 4, 0, 0);
    const title = str(at(card, 0));
    const url = str(at(card, 2));
    if (title && url) return `[${title.replace(/[[\]]/g, "\\$&")}](${url})`;
    return "[video]";
  }
  if (kind === "image_generation") {
    const entry = at(candidate, 12, 0, 8, 0, index, 0, 3);
    return entry ? fileLine(entry) : "[image]";
  }
  if (kind === "card") {
    const title = str(at(candidate, 12, 27, index, 0, 6));
    return title ? `[card: ${title}]` : "[card]";
  }
  return `[${kind.replace(/_/g, " ")}]`;
}

const PLACEHOLDER = /https?:\/\/googleusercontent\.com\/([a-z_]+)_content\/(\d+)/g;

/** `_Sources: [title](url), ..._`, distinct by url, first seen first; the
 *  citations are index ranges over the text, which stays as written. */
function sources(candidate: unknown): string {
  const seen = new Map<string, string>();
  for (const citation of arr(at(candidate, 2, 1))) {
    for (const source of arr(at(citation, 2))) {
      const url = str(at(source, 0));
      if (url && !seen.has(url)) seen.set(url, str(at(source, 1)) || url);
    }
  }
  if (!seen.size) return "";
  return `_Sources: ${[...seen].map(([url, title]) => `[${title.replace(/[[\]]/g, "\\$&")}](${url.replace(/[()]/g, (c) => (c === "(" ? "%28" : "%29"))})`).join(", ")}_`;
}

/** The HTML documents a candidate wrote (`mini-app` on the page), verbatim. */
function documents(candidate: unknown): string[] {
  return arr(at(candidate, 12, 0, 77))
    .map((entry) => at(entry, 3))
    .filter((html): html is string => typeof html === "string");
}

/** Files the conversation wrote, in turn order. Each is its own clipping in
 *  the bundle; the transcript only points at it. Gemini gives the document no
 *  name, so every one is `app.html` and `uniquePaths` numbers the rest. */
export function createdFiles(turns: Turn[]): { path: string; text: string }[] {
  return oldestFirst(turns).flatMap((turn) => documents(candidateOf(turn)).map((text) => ({ path: "app.html", text })));
}

function assistantBlocks(turn: Turn): ChatBlock[] {
  const candidate = candidateOf(turn);
  const blocks: ChatBlock[] = [];
  const sections = arr(at(candidate, 37, 1)).filter((section) => str(at(section, 0, 0)).trim());
  const full = str(at(candidate, 37, 0, 0)).trim();
  if (sections.length) {
    blocks.push({ kind: "reasoning", entries: sections.map((section) => ({ summary: str(at(section, 5)), body: str(at(section, 0, 0)) })), preamble: "" });
  } else if (full) {
    blocks.push({ kind: "reasoning", entries: [], preamble: full });
  }
  const text = str(at(candidate, 1, 0)).replace(PLACEHOLDER, (_match, kind: string, index: string) => placeholder(candidate, kind, Number(index)));
  const parts = [text, sources(candidate), ...documents(candidate).map(() => "[file: app.html]")].filter(Boolean);
  if (parts.length) blocks.push({ kind: "assistant", text: parts.join("\n\n") });
  return blocks;
}

export function readConversation(turns: Turn[], id: string, activity: boolean): ChatClipping {
  const ordered = oldestFirst(turns);
  if (!ordered.length) throw new Error("This conversation has no messages yet.");
  const blocks: ChatBlock[] = [];
  const models: string[] = [];
  for (const turn of ordered) {
    blocks.push(userBlock(turn), ...assistantBlocks(turn));
    const label = str(at(turn, 3, 21));
    if (label && !models.includes(`Gemini ${label}`)) models.push(`Gemini ${label}`);
  }
  const kept = activity ? blocks : blocks.filter((block) => block.kind === "user" || block.kind === "assistant");
  const seconds = at(ordered[0], 4, 0);
  return {
    source: geminiUrl(id),
    assistant: "Gemini",
    title: "Conversation",
    models,
    started: typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : "",
    turns: ordered.length,
    activity,
    blocks: mergeChatBlocks(kept),
    redacted: 0,
    skipped: {},
    clippedOn: new Date().toISOString().slice(0, 10),
  };
}
