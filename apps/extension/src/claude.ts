// Claude conversations, read from claude.ai's own JSON rather than the page.
//
// The page renders a window (2 of 11 user messages after load, measured
// 2026-09-14). `/api/organizations/<org>/chat_conversations/<id>?tree=True&
// rendering_mode=messages&render_all_tools=true` holds the whole tree on the
// session cookie alone. Ten conversations measured; design and figures in
// docs/clipper-chat-plan.md, "Claude".

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
  return path.reverse();
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Files the conversation wrote with `create_file`, in call order. Each is its
 *  own clipping in the bundle; the transcript only points at it. */
export function createdFiles(json: ClaudeConversation): { path: string; text: string }[] {
  const files: { path: string; text: string }[] = [];
  for (const message of walk(json)) {
    for (const block of message.content ?? []) {
      if (block.type !== "tool_use" || !isRecord(block.input) || typeof block.input.file_text !== "string") continue;
      files.push({ path: String(block.input.path ?? "file"), text: block.input.file_text });
    }
  }
  return files;
}
