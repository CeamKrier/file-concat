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

import { type ChatBlock, type ChatClipping, link, mergeChatBlocks } from "./markdown";

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
 * and the `hNvQHb` entry is taken from the first that has one. A null payload
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
      if (!Array.isArray(entry) || entry[0] !== "wrb.fr" || entry[1] !== "hNvQHb") continue;
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
    if (title && url) return link(title, url);
    return "[video]";
  }
  if (kind === "image_generation") {
    const name = str(at(candidate, 12, 0, 8, 0, index, 0, 3, 2));
    return name ? `[image: ${name}]` : "[image]";
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
  return `_Sources: ${[...seen].map(([url, title]) => link(title, url)).join(", ")}_`;
}

/** The HTML documents a candidate wrote (`mini-app` on the page), verbatim. */
function documents(candidate: unknown): string[] {
  return arr(at(candidate, 12, 0, 77))
    .map((entry) => at(entry, 3))
    .filter((html): html is string => typeof html === "string");
}

/** The reader's own numbering for a document: Gemini gives it no name, so the
 *  first document in the conversation is `app.html`, the second `app-2.html`,
 *  and so on, oldest turn first. */
const appName = (index: number) => (index === 0 ? "app.html" : `app-${index + 1}.html`);

/** Files the conversation wrote, in turn order. Each is its own clipping in
 *  the bundle; the transcript only points at it. */
export function createdFiles(turns: Turn[]): { path: string; text: string }[] {
  return oldestFirst(turns)
    .flatMap((turn) => documents(candidateOf(turn)))
    .map((text, index) => ({ path: appName(index), text }));
}

/** `written` is how many documents earlier turns already wrote, so this
 *  turn's own document pointers agree with `createdFiles`'s numbering. */
function assistantBlocks(turn: Turn, written: number): ChatBlock[] {
  const candidate = candidateOf(turn);
  // A stopped generation: none of the 453 measured turns, so the line is
  // named in place rather than dropped in silence.
  if (!Array.isArray(candidate)) return [{ kind: "assistant", text: "[no answer]" }];
  const blocks: ChatBlock[] = [];
  const sections = arr(at(candidate, 37, 1)).filter((section) => str(at(section, 5)).trim() || str(at(section, 0, 0)).trim());
  const full = str(at(candidate, 37, 0, 0)).trim();
  if (sections.length) {
    blocks.push({ kind: "reasoning", entries: sections.map((section) => ({ summary: str(at(section, 5)), body: str(at(section, 0, 0)) })), preamble: "" });
  } else if (full) {
    blocks.push({ kind: "reasoning", entries: [], preamble: full });
  }
  const text = str(at(candidate, 1, 0)).replace(PLACEHOLDER, (_match, kind: string, index: string) => placeholder(candidate, kind, Number(index)));
  const parts = [text, sources(candidate), ...documents(candidate).map((_, i) => `[file: ${appName(written + i)}]`)].filter(Boolean);
  if (parts.length) blocks.push({ kind: "assistant", text: parts.join("\n\n") });
  return blocks;
}

export function readConversation(turns: Turn[], id: string, activity: boolean): ChatClipping {
  const ordered = oldestFirst(turns);
  if (!ordered.length) throw new Error("This conversation has no messages yet.");
  // A conversation in which no turn has a candidate is a moved slot, not a
  // list of questions with no answers (the check Claude's walk makes with
  // the nil-UUID root).
  if (!ordered.some((turn) => Array.isArray(candidateOf(turn)))) throw new Error(SHAPE_CHANGED);
  const blocks: ChatBlock[] = [];
  const models: string[] = [];
  let written = 0;
  for (const turn of ordered) {
    const answer = assistantBlocks(turn, written);
    written += documents(candidateOf(turn)).length;
    blocks.push(userBlock(turn), ...answer);
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

// ---------- the request ----------

const RPC = "/_/BardChatUi/data/batchexecute?rpcids=hNvQHb";
const PAGE = 100;
const MAX_PAGES = 50;

/**
 * Same-origin, on the session cookie plus the page's CSRF token, which is
 * read from the page HTML for this clip's requests and held in nothing. The
 * envelope and arguments are the ones gemini.google.com's own client sends
 * (measured 2026-09-14); the server enforces the token and ignores the rest
 * of the client's query string. Pages of 100 turns, the cursor followed
 * until the server answers none, at most 50 pages.
 */
export async function fetchConversation(id: string): Promise<Turn[]> {
  const token = readToken(document.documentElement.innerHTML);
  if (!token) throw new Error("Sign in to Gemini to clip this conversation.");
  const turns: Turn[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const body = new URLSearchParams();
    body.set("f.req", JSON.stringify([[["hNvQHb", JSON.stringify([`c_${id}`, PAGE, cursor, 1, [0], [4], null, 1]), null, "generic"]]]));
    body.set("at", token);
    const response = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: body.toString(),
    });
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new Error("Gemini would not hand over this conversation. Sign in and reload the page.");
    }
    if (!response.ok) throw new Error(`gemini.google.com answered ${response.status}.`);
    const payload = parseBatch(await response.text());
    if (!payload) throw new Error("Gemini has no conversation at this address.");
    turns.push(...(payload[0] as Turn[]));
    cursor = typeof payload[1] === "string" ? payload[1] : null;
    if (!cursor) break;
  }
  return turns;
}
