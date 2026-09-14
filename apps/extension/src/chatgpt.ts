// ChatGPT conversations, read from chatgpt.com's own JSON rather than the page.
//
// The page is a window: measured 2026-09-14, the DOM holds 4 of 82 messages at
// any scroll position, so a DOM read gets 6% of the text. `/backend-api/share/
// <id>` (public) and `/backend-api/conversation/<id>` (session) hold the whole
// tree, with assistant text as source Markdown. Design and figures in
// docs/clipper-chat-plan.md.

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
