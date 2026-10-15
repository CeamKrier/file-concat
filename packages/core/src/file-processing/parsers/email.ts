import type { Email } from "postal-mime";
import { formatCalendar } from "./calendar";
import { flattenHtml, mapTags, withoutHiddenHtml } from "./html-text";
import type { ExtractionNote, ExtractionResult } from "./types";

/**
 * What the rendering reads off a message: the fields of a parsed `.eml` that
 * matter, and exactly the shape an Outlook `.msg` is lifted into, so both
 * formats come out of {@link formatEmail} looking the same.
 */
export interface MessageFields {
  from?: Email["from"];
  /** Who sent it for the author (RFC 5322 3.6.2), Outlook's "on behalf of". */
  sender?: Email["sender"];
  replyTo?: Email["replyTo"];
  to?: Email["to"];
  cc?: Email["cc"];
  bcc?: Email["bcc"];
  date?: string;
  subject?: string;
  html?: string;
  text?: string;
  /** Meetings already rendered as `Label: value` blocks, read as body. */
  events?: readonly string[];
  attachments?: ReadonlyArray<{ filename: string | null; mimeType?: string; contentId?: string; content?: ArrayBuffer | Uint8Array | string }>;
}

/**
 * Messages (`.eml`), rendered as the correspondence they are.
 *
 * A saved message is RFC 5322: text, and so it always classified as text and
 * went into bundles whole — quoted-printable escapes, MIME boundaries, an
 * HTML part duplicating the plain one, and base64 attachments that can be most
 * of the file. What a model needs from it is four headers and what was said.
 *
 * Only the shaping lives here. Parsing is a platform loader's job (ADR-0012):
 * the browser wants `postal-mime` in a lazy chunk it never ships to the
 * Cloudflare worker, and the CLI wants it resolved at require time, so neither
 * can be satisfied by an `import` written in core. Core owns what comes out.
 */

/**
 * Headers worth carrying. Everything else is routing exhaust. Sender and
 * Reply-To only when they name someone From does not: a list or an assistant
 * sending, or replies going elsewhere.
 */
const KEPT_HEADERS = ["From", "Sender", "Reply-To", "To", "Cc", "Bcc", "Date", "Subject"] as const;

/** A detached signature (RFC 3156 PGP, RFC 8551 S/MIME): no reader's content, only proof of the sender. */
const SIGNATURE = /^application\/(?:pgp-signature|(?:x-)?pkcs7-signature)$/i;

function formatAddress(address: Email["from"]): string {
  if (!address) return "";
  if (address.group) {
    const members = address.group.map((m) => formatAddress(m)).filter(Boolean);
    return members.length > 0 ? `${address.name}: ${members.join(", ")}` : address.name;
  }
  if (!address.name || address.name === address.address) return address.address ?? "";
  return address.address ? `${address.name} <${address.address}>` : address.name;
}

function formatAddresses(addresses: Email["to"]): string {
  return (addresses ?? [])
    .map(formatAddress)
    .filter(Boolean)
    .join(", ");
}

/**
 * The readable text of an HTML-only message. Deliberately crude: the goal is
 * the words in reading order, not a faithful rendering, and a message that has
 * a `text/plain` part never reaches this.
 *
 * Quoted history is marked with `> ` per level, as a plain-text client writes
 * it, and never removed: in a single exported message it is the only copy of
 * the earlier ones. Flattened unmarked, a question from the last sender reads
 * as this sender's own words. A quote is a `blockquote` (Gmail, Apple Mail,
 * Thunderbird), or everything from Outlook's `divRplyFwdMsg` header block to
 * the end, since Outlook writes the history as that block's siblings. A
 * forward carries neither and stays unmarked, as talon also leaves it.
 */
function htmlToText(html: string): { text: string; hidden: number } {
  const { html: clean, hidden } = withoutHiddenHtml(mapTags(html.replace(/[\uE000\uE001]/g, ""), () => undefined, true));
  const header = clean.search(/\bid=["']?divRplyFwdMsg\b/i);
  const outlook = header < 0 ? -1 : clean.lastIndexOf("<", header);
  const flat = mapTags(
    outlook < 0 ? clean : `${clean.slice(0, outlook)}\n${QUOTE_OPEN}${clean.slice(outlook)}${QUOTE_CLOSE}\n`,
    (name, closing) => (name !== "blockquote" ? undefined : closing ? `${QUOTE_CLOSE}\n` : `\n${QUOTE_OPEN}`),
  );
  let depth = 0;
  const text = flattenHtml(flat)
    .split("\n")
    .map((line) => {
      const level = depth + line.split(QUOTE_OPEN).length - 1;
      depth = Math.max(0, level - (line.split(QUOTE_CLOSE).length - 1));
      const words = line.replace(/[\uE000\uE001]/g, "").trim();
      return words && level > 0 ? `${">".repeat(level)} ${words}` : words;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, hidden };
}

/** Where a quote opens and closes, between reading the markup and writing lines. */
const QUOTE_OPEN = "\uE000";
const QUOTE_CLOSE = "\uE001";

/**
 * Turn a parsed message into the text a bundle should carry. Answers with empty
 * text — the contract's "couldn't extract" (ADR-0003) — only when there is no
 * body and no header worth printing, so an empty entry never appears silently.
 */
export function formatEmail(email: MessageFields): ExtractionResult {
  const authors = new Set([email.from?.address?.toLowerCase()]);
  const others = (addresses: Email["to"]) => (addresses ?? []).filter((address) => !address.address || !authors.has(address.address.toLowerCase()));
  const values: Record<(typeof KEPT_HEADERS)[number], string> = {
    From: formatAddress(email.from),
    Sender: formatAddresses(others(email.sender ? [email.sender] : [])),
    "Reply-To": formatAddresses(others(email.replyTo)),
    To: formatAddresses(email.to),
    Cc: formatAddresses(email.cc),
    // Only a sent copy carries Bcc; there it is the one record of who else got it.
    Bcc: formatAddresses(email.bcc),
    Date: email.date ?? "",
    Subject: email.subject ?? "",
  };

  const parts: string[] = [];
  const headers = KEPT_HEADERS.filter((name) => values[name]).map(
    (name) => `${name}: ${values[name]}`,
  );
  if (headers.length > 0) parts.push(headers.join("\n"));

  // `text` is the plain part when the message has one. HTML-only mail is
  // flattened rather than dropped, because that is most marketing and most
  // notification mail, and its words are the point.
  const plain = email.text?.trim();
  const flat = plain || !email.html ? undefined : htmlToText(email.html);
  const body = plain || flat?.text;
  if (body) parts.push(body);

  // A meeting invite's content is its calendar part, often with no body
  // beside it. The events are read as body; Gmail sends each one twice
  // (inline and as invite.ics), so a block already written is not repeated.
  const events = new Set<string>(email.events);
  // An image the HTML body draws by `cid:` is part of the body, not something
  // attached (RFC 2387), and a signature proves the sender without adding content.
  const drawn = (id: string | undefined) => !!id && !!email.html?.includes(`cid:${id.replace(/^<|>$/g, "")}`);
  const attachments = (email.attachments ?? []).filter((attachment) => {
    if (SIGNATURE.test(attachment.mimeType ?? "") || drawn(attachment.contentId)) return false;
    if (!/^(text\/calendar|application\/ics)$/i.test(attachment.mimeType ?? "") || attachment.content === undefined) return true;
    const ics = typeof attachment.content === "string" ? attachment.content : new TextDecoder().decode(attachment.content);
    const blocks = formatCalendar(ics);
    for (const block of blocks) events.add(block);
    return blocks.length === 0;
  });
  parts.push(...events);

  const notes: ExtractionNote[] = [];
  if (flat?.hidden) notes.push({ kind: "hidden-left-out", count: flat.hidden });
  if (attachments.length > 0) {
    // Named in the text as well as counted in the notes: a message whose whole
    // content is "see attached" is unreadable without knowing what was attached.
    const names = attachments.map((a, i) => a.filename || `unnamed-${i + 1}`);
    parts.push(`Attachments (${names.length}, not included): ${names.join(", ")}`);
    notes.push({ kind: "attachments-skipped", count: names.length });
  }

  const text = parts.join("\n\n").trim();
  if (!text) return { text: "" };
  return notes.length > 0 ? { text, notes } : { text };
}
