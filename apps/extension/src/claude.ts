// Claude conversations, read from claude.ai's own JSON rather than the page.
//
// The page renders a window (2 of 11 user messages after load, measured
// 2026-09-14). `/api/organizations/<org>/chat_conversations/<id>?tree=True&
// rendering_mode=messages&render_all_tools=true` holds the whole tree on the
// session cookie alone. Ten conversations measured; design and figures in
// docs/clipper-chat-plan.md, "Claude".

import { type ChatBlock, type ChatClipping, fence, mergeChatBlocks } from "./markdown";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const CHAT = new RegExp(`^/chat/(${UUID})$`);

export function conversationRef(pathname: string): string | null {
  return pathname.match(CHAT)?.[1] ?? null;
}

export const claudeUrl = (id: string) => `https://claude.ai/chat/${id}`;

export const SHAPE_CHANGED =
  "Claude changed the shape of this conversation. Reload the extension, and if this persists, report it.";

// ---------- the JSON, as much of it as is read ----------

interface Block {
  type: string;
  text?: string;
  citations?: { url?: string; title?: string }[];
  /** `thinking`: the text on older models; newer ones hide it and send summaries. */
  thinking?: string;
  summaries?: { summary?: string }[];
  /** `tool_use` and `tool_result`. */
  name?: string;
  input?: unknown;
  content?: unknown;
  is_error?: boolean;
}

interface Attachment {
  file_name?: string;
  extracted_content?: string;
}

interface UploadedFile {
  file_name?: string;
  file_kind?: string;
}

interface Message {
  uuid: string;
  parent_message_uuid: string;
  sender: string;
  index?: number;
  created_at?: string;
  content?: Block[];
  attachments?: Attachment[];
  files?: UploadedFile[];
}

export interface ClaudeConversation {
  name?: string;
  model?: string;
  current_leaf_message_uuid?: string;
  chat_messages?: Message[];
}

/** The branch the page shows: from the leaf up through `parent_message_uuid`
 *  until the parent is missing (the root's is the nil UUID), then reversed. */
export function walk(json: ClaudeConversation): Message[] {
  if (!Array.isArray(json.chat_messages)) throw new Error(SHAPE_CHANGED);
  const byId = new Map(json.chat_messages.map((message) => [message.uuid, message]));
  const path: Message[] = [];
  let current = json.current_leaf_message_uuid ? byId.get(json.current_leaf_message_uuid) : undefined;
  while (current && !path.includes(current)) {
    path.push(current);
    current = byId.get(current.parent_message_uuid);
  }
  // The walk has to end at the root, whose parent is the nil UUID. With the
  // leaf or `parent_message_uuid` renamed it would otherwise be an empty or
  // one-turn file with no error at all.
  const root = path[path.length - 1]?.parent_message_uuid;
  if (json.chat_messages.length && !(typeof root === "string" && root.startsWith("00000000-"))) throw new Error(SHAPE_CHANGED);
  return path.reverse();
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Files the conversation wrote with `create_file`, in first-write order with
 *  the last write to a path winning. Each is its own clipping in the bundle;
 *  the transcript only points at it. Edits made with `str_replace` are not
 *  applied (none in the ten measured conversations). */
export function createdFiles(json: ClaudeConversation): { path: string; text: string }[] {
  const files = new Map<string, { path: string; text: string }>();
  for (const message of walk(json)) {
    for (const block of message.content ?? []) {
      if (block.type !== "tool_use" || !isRecord(block.input) || typeof block.input.file_text !== "string") continue;
      const path = String(block.input.path ?? "file");
      files.set(path, { path, text: block.input.file_text });
    }
  }
  return [...files.values()];
}

// ---------- blocks ----------

/** `_Sources: [title](url), ..._`, distinct by url, first seen first. Claude's
 *  citations are index ranges over the text, not markers in it, so the text
 *  stays as written and the links follow it. */
function sources(block: Block): string {
  const seen = new Map<string, string>();
  for (const citation of block.citations ?? []) {
    if (citation.url && !seen.has(citation.url)) seen.set(citation.url, citation.title || citation.url);
  }
  if (!seen.size) return "";
  return `_Sources: ${[...seen].map(([url, title]) => `[${title.replace(/[[\]]/g, "\\$&")}](${url.replace(/[()]/g, (c) => (c === "(" ? "%28" : "%29"))})`).join(", ")}_`;
}

/** A tool result's parts, one per line: text verbatim, a search hit as
 *  `title - url`, a sandbox file or an image as a placeholder. */
function resultText(block: Block): string {
  const parts = Array.isArray(block.content) ? block.content : [];
  return parts
    .map((part: unknown) => {
      if (typeof part === "string") return part;
      if (!isRecord(part)) return "";
      switch (part.type) {
        case "text":
          return String(part.text ?? "");
        case "knowledge":
          return `${String(part.title ?? "")} - ${String(part.url ?? "")}`;
        case "local_resource":
          return `[file: ${String(part.name ?? part.file_path ?? "file")}]`;
        case "image":
          return "[image]";
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join("\n");
}

/** The question first, so the frontmatter description (the first user
 *  block's opening) is the question; then one line per uploaded file and
 *  attachment, and with the opt-in on the attached text itself, fenced. */
function userBlock(message: Message, activity: boolean, skip: (key: string) => void): ChatBlock | null {
  for (const block of message.content ?? []) if (block.type !== "text") skip(`human/${block.type}`);
  const parts = (message.content ?? []).filter((block) => block.type === "text").map((block) => block.text ?? "");
  parts.push(
    [
      ...(message.files ?? []).map((file) => `[${file.file_kind === "image" ? "image" : "file"}: ${file.file_name ?? "file"}]`),
      ...(message.attachments ?? []).map((attachment) => `[file: ${attachment.file_name ?? "file"}]`),
    ].join("\n"),
  );
  if (activity) {
    for (const attachment of message.attachments ?? []) {
      if (attachment.extracted_content) parts.push(fence(attachment.extracted_content));
    }
  }
  const text = parts.filter(Boolean).join("\n\n");
  return text ? { kind: "user", text } : null;
}

function assistantBlocks(message: Message, skip: (key: string) => void): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  for (const block of message.content ?? []) {
    switch (block.type) {
      case "text": {
        const text = block.text ?? "";
        if (!text) break;
        const cited = sources(block);
        blocks.push({ kind: "assistant", text: cited ? `${text}\n\n${cited}` : text });
        break;
      }
      case "thinking": {
        const entries = (block.summaries ?? []).filter((entry) => entry.summary).map((entry) => ({ summary: entry.summary as string, body: "" }));
        const preamble = block.thinking ?? "";
        if (entries.length || preamble) blocks.push({ kind: "reasoning", entries, preamble });
        break;
      }
      case "tool_use": {
        const input = isRecord(block.input) ? block.input : {};
        if (typeof input.file_text === "string") {
          // The file is its own clipping; the transcript points at it.
          blocks.push({ kind: "assistant", text: `[file: ${String(input.path ?? "file")}]` });
        } else {
          blocks.push({ kind: "call", tool: block.name ?? "tool", language: "json", text: JSON.stringify(input, null, 2) });
        }
        break;
      }
      case "tool_result": {
        const text = resultText(block);
        if (text) blocks.push({ kind: "output", tool: `${block.name ?? "tool"}${block.is_error ? " (error)" : ""}`, text });
        break;
      }
      default:
        skip(`assistant/${block.type}`);
    }
  }
  return blocks;
}

export function readConversation(json: ClaudeConversation, id: string, activity: boolean): ChatClipping {
  const path = walk(json);
  const skipped: Record<string, number> = {};
  const skip = (key: string) => {
    skipped[key] = (skipped[key] ?? 0) + 1;
  };
  const blocks: ChatBlock[] = [];
  for (const message of path) {
    if (message.sender === "human") {
      const block = userBlock(message, activity, skip);
      if (block) blocks.push(block);
    } else {
      blocks.push(...assistantBlocks(message, skip));
    }
  }
  const kept = activity ? blocks : blocks.filter((block) => block.kind === "user" || block.kind === "assistant");
  const turns = kept.filter((block) => block.kind === "user").length;
  if (!turns) {
    // Human messages the walk could not read are a shape change, not an
    // empty conversation.
    const unread = path.some((message) => message.sender === "human");
    throw new Error(unread ? SHAPE_CHANGED : "This conversation has no messages yet.");
  }
  return {
    source: claudeUrl(id),
    assistant: "Claude",
    title: json.name?.trim() || "Conversation",
    models: json.model ? [json.model] : [],
    started: path[0]?.created_at ?? "",
    turns,
    activity,
    blocks: mergeChatBlocks(kept),
    redacted: 0,
    skipped,
    clippedOn: new Date().toISOString().slice(0, 10),
  };
}

// ---------- the request ----------

/**
 * Same-origin, on the session cookie: nothing is read but `lastActiveOrg`,
 * which names the organization the page is showing, and nothing is stored.
 * The route and its query are the ones claude.ai's own client uses.
 */
export async function fetchConversation(id: string): Promise<ClaudeConversation> {
  const org = document.cookie.match(/(?:^|; )lastActiveOrg=([^;]+)/)?.[1];
  if (!org) throw new Error("Sign in to Claude to clip this conversation.");
  const response = await fetch(
    `/api/organizations/${org}/chat_conversations/${id}?tree=True&rendering_mode=messages&render_all_tools=true`,
    { headers: { Accept: "application/json" } },
  );
  if (response.status === 401 || response.status === 403) {
    throw new Error("Claude would not hand over this conversation. Sign in and reload the page.");
  }
  if (response.status === 404) throw new Error("Claude has no conversation at this address.");
  if (!response.ok) throw new Error(`claude.ai answered ${response.status}.`);
  const json = (await response.json().catch(() => null)) as ClaudeConversation | null;
  if (!json || !Array.isArray(json.chat_messages)) throw new Error(SHAPE_CHANGED);
  return json;
}
