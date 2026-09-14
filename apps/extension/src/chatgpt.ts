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
  author: { role: string; name?: string | null };
  create_time?: number | null;
  content: {
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
  const path: Node[] = [];
  const seen = new Set<string>();
  let id: string | null | undefined = json.current_node;
  while (id && json.mapping[id] && !seen.has(id)) {
    seen.add(id);
    path.push(json.mapping[id]);
    id = json.mapping[id].parent;
  }
  return path.reverse();
}

/** Citation markers replaced by their `alt` (a Markdown link, or nothing), then
 *  every marker and private-use character left over removed. */
function clean(text: string, message: Message): string {
  let out = text;
  for (const reference of message.metadata?.content_references ?? []) {
    if (reference.matched_text) out = out.split(reference.matched_text).join(reference.alt ?? "");
  }
  return out.replace(MARKER, "").replace(PRIVATE_USE, "");
}

/** `text` and `multimodal_text` alike: strings verbatim, anything else an image. */
function partsText(message: Message): string {
  return clean((message.content.parts ?? []).map((part) => (typeof part === "string" ? part : "[image]")).join("\n"), message);
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
      const text = partsText(message);
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
      blocks.push({ kind: "recap", text: clean(message.content.content ?? "", message) });
    }
  }

  // 4. The opt-in, then the joins.
  const kept = activity ? blocks : blocks.filter((block) => block.kind === "user" || block.kind === "assistant");
  const turns = kept.filter((block) => block.kind === "user").length;
  if (!turns) throw new Error("This conversation has no messages yet.");
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
