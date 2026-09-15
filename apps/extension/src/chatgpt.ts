// ChatGPT conversations, read from chatgpt.com's own JSON rather than the page.
//
// The page is a window: measured 2026-09-14, the DOM holds 4 of 82 messages at
// any scroll position, so a DOM read gets 6% of the text. `/backend-api/share/
// <id>` (public) and `/backend-api/conversation/<id>` (session) hold the whole
// tree, with assistant text as source Markdown. Design and figures in
// docs/clipper-chat-plan.md.

import { type ChatBlock, type ChatClipping, mergeChatBlocks } from "./markdown";

export interface ConversationRef {
  /** The path segment the page and the route share: `share` or `c`. */
  kind: "share" | "c";
  id: string;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SHARE = new RegExp(`^/share/(${UUID})$`);
// A custom GPT's conversation sits under `/g/<gizmo>/c/<uuid>`.
const CHAT = new RegExp(`^(?:/g/[^/]+)?/c/(${UUID})$`);
const REF_ID = new RegExp(`^(share|c)/(${UUID})$`);

export function conversationRef(pathname: string): ConversationRef | null {
  const share = pathname.match(SHARE);
  if (share) return { kind: "share", id: share[1] };
  const chat = pathname.match(CHAT);
  if (chat) return { kind: "c", id: chat[1] };
  return null;
}

/** The tray id: path-shaped, so a retry against a tab that has since navigated
 *  still fetches the right conversation by the right route. */
export const refId = (ref: ConversationRef) => `${ref.kind}/${ref.id}`;

export function parseRefId(id: string): ConversationRef | null {
  const match = id.match(REF_ID);
  return match ? { kind: match[1] as ConversationRef["kind"], id: match[2] } : null;
}

export const chatUrl = (ref: ConversationRef) => `https://chatgpt.com/${ref.kind}/${ref.id}`;

// ---------- the JSON, as much of it as is read ----------

interface Thought {
  summary?: string;
  content?: string;
}

interface Message {
  author?: { role: string; name?: string | null };
  create_time?: number | null;
  content?: {
    content_type: string;
    parts?: unknown[];
    text?: string;
    language?: string;
    thoughts?: Thought[];
    /** `reasoning_recap`'s one line. */
    content?: string;
  };
  recipient?: string;
  metadata?: {
    is_visually_hidden_from_conversation?: boolean;
    is_thinking_preamble_message?: boolean;
    is_redacted?: boolean;
    model_slug?: string;
    content_references?: { matched_text?: string; alt?: string | null }[];
  };
}

interface Node {
  id: string;
  parent?: string | null;
  message?: Message | null;
}

export interface Conversation {
  title?: string;
  default_model_slug?: string;
  mapping?: Record<string, Node>;
  current_node?: string;
}

export const SHAPE_CHANGED =
  "ChatGPT changed the shape of this conversation. Reload the extension, and if this persists, report it.";

/** The known content types. Anything else is counted and named, never dropped in silence. */
const KNOWN = new Set(["text", "multimodal_text", "thoughts", "code", "execution_output", "reasoning_recap", "model_editable_context"]);

/** A citation marker: U+E200, its body, U+E201. Every one in a visible answer
 *  equals a `content_references[].matched_text`; the `filecite` ones inside
 *  MCP tool results match nothing and are stripped whole. */
const MARKER = /\uE200[^\uE201]*\uE201/g;
const PRIVATE_USE = /[\uE000-\uF8FF]/g;

/**
 * The branch the page shows: from `current_node` up to the root, reversed.
 * `linear_conversation` on a share page equals this walk (measured on 2,235
 * nodes), and the session route has no `linear_conversation`, so this is the
 * one code path.
 */
function walk(json: Conversation): Node[] {
  if (!json.mapping || !json.current_node) throw new Error(SHAPE_CHANGED);
  // Exactly one root (its `parent` is null signed in, absent on a share
  // page). With `parent` renamed every node is a root, and the walk from a
  // user leaf would otherwise be a one-turn file with no error at all.
  if (Object.values(json.mapping).filter((node) => node.parent == null).length !== 1) throw new Error(SHAPE_CHANGED);
  const path: Node[] = [];
  const seen = new Set<string>();
  let id: string | null | undefined = json.current_node;
  while (id) {
    const node: Node | undefined = json.mapping[id];
    if (!node || seen.has(id)) throw new Error(SHAPE_CHANGED);
    seen.add(id);
    path.push(node);
    id = node.parent;
  }
  return path.reverse();
}

/** Citation markers replaced by their `alt` (a Markdown link, or nothing), then
 *  every marker and private-use character left over removed. */
function clean(text: string, message: Message): string {
  let out = text;
  for (const reference of message.metadata?.content_references ?? []) {
    // Only a marker is replaced. A `sources_footnote` reference matches a
    // single space (31 of 249 on one measured conversation), and replacing
    // that stripped every space from the answer. `search` ignores the /g state.
    const marker = reference.matched_text;
    if (marker && marker.search(PRIVATE_USE) >= 0) out = out.split(marker).join(reference.alt ?? "");
  }
  return out.replace(MARKER, "").replace(PRIVATE_USE, "");
}

/** `text` and `multimodal_text` alike: strings verbatim, an image as `[image]`,
 *  a voice turn as its transcription, and any other part named in `skipped`. */
function partsText(message: Message, skip: (key: string) => void): string {
  const parts = (message.content?.parts ?? []).map((part) => {
    if (typeof part === "string") return part;
    const kind = (part as { content_type?: string } | null)?.content_type ?? "unknown";
    if (kind === "audio_transcription") return String((part as { text?: string }).text ?? "");
    if (kind === "image_asset_pointer") return "[image]";
    skip(`part/${kind}`);
    return null;
  });
  return clean(parts.filter((part): part is string => part !== null).join("\n"), message);
}

export function readConversation(json: Conversation, ref: ConversationRef, activity: boolean): ChatClipping {
  const nodes = walk(json);
  const blocks: ChatBlock[] = [];
  const skipped: Record<string, number> = {};
  const skip = (key: string) => {
    skipped[key] = (skipped[key] ?? 0) + 1;
  };
  const models = json.default_model_slug ? [json.default_model_slug] : [];
  let redacted = 0;
  let started = "";

  for (const node of nodes) {
    const message = node.message;
    if (!message) continue;
    if (!message.author || !message.content) throw new Error(SHAPE_CHANGED);
    const meta = message.metadata ?? {};
    const role = message.author.role;
    const type = message.content.content_type;
    const recipient = message.recipient ?? "all";
    // 1. Not part of the conversation as shown.
    if (meta.is_visually_hidden_from_conversation || role === "system" || type === "model_editable_context") continue;
    // 2. Unknown types are counted before the activity filter, so the line at
    //    the end of the file is the same with the opt-in on or off.
    if (meta.model_slug && !models.includes(meta.model_slug)) models.push(meta.model_slug);
    if (!KNOWN.has(type)) {
      skip(type);
      continue;
    }
    // 3. Known types to blocks.
    if (type === "text" || type === "multimodal_text") {
      if (role === "tool" && meta.is_redacted) {
        redacted++;
        continue;
      }
      const text = partsText(message, skip);
      if (!text) continue;
      if (role === "user") {
        if (!started && message.create_time) started = new Date(message.create_time * 1000).toISOString();
        blocks.push({ kind: "user", text });
      } else if (role === "assistant" && meta.is_thinking_preamble_message) {
        blocks.push({ kind: "reasoning", entries: [], preamble: text });
      } else if (role === "assistant" && recipient === "all") {
        blocks.push({ kind: "assistant", text });
      } else if (role === "assistant") {
        // The argument of a tool call, on a share page.
        blocks.push({ kind: "call", tool: recipient, language: "", text });
      } else if (role === "tool") {
        blocks.push({ kind: "output", tool: message.author.name ?? "tool", text });
      } else {
        skip(`${role}/${type}`);
      }
    } else if (type === "thoughts") {
      // The renderer writes `_Reasoning_` for any reasoning block it gets, so
      // an empty one is the reader's to drop.
      const entries = (message.content.thoughts ?? []).map((thought) => ({
        summary: clean(thought.summary ?? "", message),
        body: clean(thought.content ?? "", message),
      }));
      if (entries.length) blocks.push({ kind: "reasoning", entries, preamble: "" });
    } else if (type === "code") {
      const text = clean(message.content.text ?? "", message);
      if (!text) continue;
      const language = message.content.language;
      blocks.push({
        kind: "call",
        tool: recipient === "all" ? (message.author.name ?? "tool") : recipient,
        language: language && language !== "unknown" ? language : recipient === "python" ? "python" : "",
        text,
      });
    } else if (type === "execution_output") {
      const text = clean(message.content.text ?? "", message);
      if (!text) continue;
      blocks.push({ kind: "output", tool: message.author.name ?? "tool", text });
    } else if (type === "reasoning_recap") {
      const text = clean(message.content.content ?? "", message);
      if (text) blocks.push({ kind: "recap", text });
    }
  }

  // 4. The opt-in, then the joins.
  const kept = activity ? blocks : blocks.filter((block) => block.kind === "user" || block.kind === "assistant");
  const turns = kept.filter((block) => block.kind === "user").length;
  if (!turns) {
    // User messages the walk could not read are a shape change, not an empty
    // conversation: "no messages yet" on a 40-turn page gets no bug report.
    const unread = Object.values(json.mapping ?? {}).some((node) => node.message?.author?.role === "user");
    throw new Error(unread ? SHAPE_CHANGED : "This conversation has no messages yet.");
  }
  return {
    source: chatUrl(ref),
    assistant: "ChatGPT",
    title: json.title?.trim() || "Conversation",
    models,
    started,
    turns,
    activity,
    blocks: mergeChatBlocks(kept),
    redacted: activity ? redacted : 0,
    skipped,
    clippedOn: new Date().toISOString().slice(0, 10),
  };
}

// ---------- the requests ----------

async function conversationBody(response: Response): Promise<Conversation> {
  if (!response.ok) throw new Error(`chatgpt.com answered ${response.status}.`);
  // A bot-check or sign-in page is a 200 that is not JSON.
  const json = (await response.json().catch(() => null)) as Conversation | null;
  if (!json) throw new Error("chatgpt.com answered with a page instead of the conversation. Reload the tab and clip again.");
  if (!json.mapping || !json.current_node) throw new Error(SHAPE_CHANGED);
  return json;
}

/**
 * Same-origin from the content script, so the page's own session applies and
 * nothing goes through the worker. On a `/c/` page the session token is read
 * from `/api/auth/session`, sent once with the conversation request and held
 * in nothing: not stored, not logged. The two `Oai-*` headers are what
 * chatgpt.com's own client sends; without them the route does not answer
 * (measured 2026-09-14).
 */
export async function fetchConversation(ref: ConversationRef): Promise<Conversation> {
  if (ref.kind === "share") {
    const response = await fetch(`/backend-api/share/${ref.id}`, { headers: { Accept: "application/json" } });
    if (response.status === 404) throw new Error("This share link has been turned off.");
    return conversationBody(response);
  }
  const session = await fetch("/api/auth/session");
  const token = ((await session.json().catch(() => ({}))) as { accessToken?: string }).accessToken;
  if (!token) throw new Error("Sign in to ChatGPT to clip this conversation.");
  const response = await fetch(`/backend-api/conversation/${ref.id}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      // The site's own client sends its `oai-did` cookie; a fresh id per clip
      // is what a bot check would notice. Random only when the cookie is not readable.
      "Oai-Device-Id": document.cookie.match(/(?:^|; )oai-did=([^;]+)/)?.[1] ?? crypto.randomUUID(),
      "Oai-Language": "en-US",
    },
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error("ChatGPT would not hand over this conversation. Sign in, or clip its share link.");
  }
  return conversationBody(response);
}
