import type { Email } from "postal-mime";
import type { ExtractionNote, ExtractionResult } from "./types";

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

/** Headers worth carrying. Everything else is routing exhaust. */
const KEPT_HEADERS = ["From", "To", "Cc", "Date", "Subject"] as const;

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

/** Block-level tags whose boundaries are the only structure HTML mail carries. */
const HTML_BREAKS = /<\/?(p|div|br|tr|li|h[1-6]|blockquote|table)\b[^>]*>/gi;

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/**
 * The readable text of an HTML-only message. Deliberately crude: the goal is
 * the words in reading order, not a faithful rendering, and a message that has
 * a `text/plain` part never reaches this.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(HTML_BREAKS, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&[a-z#0-9]+;/gi, (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? entity)
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Turn a parsed message into the text a bundle should carry. Answers with empty
 * text — the contract's "couldn't extract" (ADR-0003) — only when there is no
 * body and no header worth printing, so an empty entry never appears silently.
 */
export function formatEmail(email: Email): ExtractionResult {
  const values: Record<(typeof KEPT_HEADERS)[number], string> = {
    From: formatAddress(email.from),
    To: formatAddresses(email.to),
    Cc: formatAddresses(email.cc),
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
  const body = email.text?.trim() || (email.html ? htmlToText(email.html) : "");
  if (body) parts.push(body);

  const notes: ExtractionNote[] = [];
  const attachments = email.attachments ?? [];
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
