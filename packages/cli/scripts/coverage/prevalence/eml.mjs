/**
 * Which rows of the coverage map's "## EML" table (results/email.md) a real
 * .eml file holds. A row is present when the construct it names is in the
 * file, whether or not the probe's wording of it is.
 *
 * Two sources. postal-mime (the reader's own parser) gives decoded addresses,
 * the chosen HTML body and every non-body part with its decoded content. A
 * small raw MIME walk gives what postal-mime flattens away: each part's own
 * headers and its place in the tree (alternative, related, digest, signed).
 * Header rows look at the top-level header block only, so a forwarded mail's
 * Bcc does not count as the outer mail's.
 */

import { createRequire } from "node:module";

const req = createRequire(new URL("../../../../core/package.json", import.meta.url));
const PostalMime = req("postal-mime").default ?? req("postal-mime");

// One MIME entity: unfolded header block, raw body, lowercased type.
// Children of multipart/digest default to message/rfc822 (RFC 2046 5.1.5).
function walk(raw, out, defaultType = "text/plain", parent = "") {
  const lead = /^\r?\n/.exec(raw);
  const blank = lead ? { index: 0, 0: lead[0] } : /\r?\n\r?\n/.exec(raw);
  const head = (blank ? raw.slice(0, blank.index) : raw).replace(/\r?\n[ \t]+/g, " ");
  const body = blank ? raw.slice(blank.index + blank[0].length) : "";
  const h = (name) => new RegExp(`^${name}:[ \\t]*(.*)$`, "im").exec(head)?.[1] ?? "";
  const ctRaw = h("content-type");
  const part = {
    head,
    body,
    parent,
    ct: ctRaw.toLowerCase(),
    type: (ctRaw.split(";")[0].trim() || defaultType).toLowerCase(),
    cte: h("content-transfer-encoding").trim().toLowerCase(),
    disp: h("content-disposition").trim().toLowerCase(),
    children: [],
  };
  out.push(part);
  const boundary = /boundary\s*=\s*"?([^";\r\n]+)"?/i.exec(ctRaw)?.[1]?.trim();
  if (part.type.startsWith("multipart/") && boundary) {
    const esc = boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pieces = body.split(new RegExp(`^--${esc}(?:--)?[ \\t]*\\r?$`, "m")).slice(1, -1);
    for (const piece of pieces) {
      const child = walk(piece.replace(/^\r?\n/, ""), out, part.type === "multipart/digest" ? "message/rfc822" : "text/plain", part.type);
      part.children.push(child);
    }
  } else if (part.type === "message/rfc822" && !/base64|quoted/.test(part.cte)) {
    part.children.push(walk(body, out, "text/plain", part.type));
  }
  return part;
}

const top = (ctx, name) => new RegExp(`^${name}:[ \\t]*(.*)$`, "im").exec(ctx.root.head)?.[1];
const encWord = (v) => /=\?[^?\s]+\?[bq]\?[^?\s]*\?=/i.test(v ?? "");
const nonAscii = (v) => /[\x80-\xff]/.test(v ?? "");
const isAttachment = (p) => p.disp.startsWith("attachment");
const textParts = (ctx) => ctx.parts.filter((p) => p.type.startsWith("text/") && !isAttachment(p));
const att = (ctx, re) => ctx.mail.attachments.filter((a) => re.test(a.mimeType ?? ""));
const attText = (a) => new TextDecoder().decode(a.content ?? new Uint8Array());
// iCalendar lines fold like mail headers (RFC 5545 3.1).
const cal = (ctx) => att(ctx, /^text\/calendar$/i).map(attText).join("\n").replace(/\r?\n[ \t]/g, "");
const enriched = (ctx) => att(ctx, /^text\/(enriched|richtext)$/i).map(attText).join("\n");
const html = (ctx) => ctx.mail.html ?? "";
const signedWith = (ctx, re) => ctx.parts.some((p) => p.type === "multipart/signed" && re.test(p.ct));
// A forwarded message part, not a digest entry (row 56 holds those).
const rfc822 = (ctx, attached) => ctx.parts.filter((p) => p.type === "message/rfc822" && p.parent !== "multipart/digest" && isAttachment(p) === attached);
// A signature part is rows 61 and 63, not an ordinary attachment.
const files = (ctx) => ctx.mail.attachments.filter((a) => a.disposition === "attachment" && !/signature$|^message\/rfc822$/i.test(a.mimeType ?? ""));
const outlookBlock = (ctx) => /id\s*=\s*["']?divRplyFwdMsg/i.test(html(ctx));
const isForward = (ctx) => /^\s*(fwd?|fw)\s*:/i.test(ctx.mail.subject ?? "");

const ROWS = {
  1: (c) => encWord(top(c, "from")),
  2: (c) => encWord(top(c, "to")),
  3: (c) => encWord(top(c, "cc")),
  4: (c) => [...(c.mail.to ?? []), ...(c.mail.cc ?? [])].some((a) => a.group),
  5: (c) => (c.mail.bcc ?? []).length > 0,
  6: (c) => (c.mail.replyTo ?? []).length > 0,
  7: (c) => !!c.mail.sender,
  8: (c) => /\?=\s+=\?/.test(top(c, "subject") ?? ""),
  // A zone other than UTC: the reader converts to UTC and the offset is lost.
  9: (c) => /[+-](?!0000)\d{4}\s*(\(.*\))?\s*$/.test(top(c, "date") ?? ""),
  10: (c) => !!top(c, "comments"),
  11: (c) => !!top(c, "keywords"),
  12: (c) => !!top(c, "message-id"),
  13: (c) => !!top(c, "in-reply-to"),
  14: (c) => !!top(c, "received"),
  15: (c) => !!top(c, "x-mailer"),
  16: (c) => !!top(c, "thread-topic"),
  17: (c) => c.parts.some((p) => p.type === "text/plain" && !isAttachment(p) && !/charset/.test(p.ct)),
  // windows-1252, or iso-8859-1, which WHATWG Encoding decodes as windows-1252.
  18: (c) => textParts(c).some((p) => /charset\s*=\s*"?(windows-1252|iso-8859-1)\b/.test(p.ct)),
  19: (c) => textParts(c).some((p) => p.cte === "quoted-printable"),
  20: (c) => textParts(c).some((p) => p.cte === "base64"),
  21: (c) => textParts(c).some((p) => /format\s*=\s*"?flowed/.test(p.ct) && /delsp\s*=\s*"?yes/.test(p.ct)),
  // A flowed line (trailing space) inside a quote, followed by another quoted line.
  22: (c) => textParts(c).some((p) => /format\s*=\s*"?flowed/.test(p.ct) && /^>.* \r?\n>/m.test(p.body)),
  23: (c) => c.parts.some((p) => p.type === "multipart/alternative" && p.children.some((k) => k.type === "text/plain") && p.children.some((k) => k.type === "text/html")),
  24: (c) => /<blockquote[^>]*gmail_quote/i.test(html(c)),
  25: (c) => /<blockquote[^>]*gmail_quote(?:(?!<\/blockquote)[\s\S])*<blockquote[^>]*gmail_quote/i.test(html(c)),
  26: (c) => outlookBlock(c) && !isForward(c),
  27: (c) => /<title[^>]*>\s*[^<\s]/i.test(html(c)),
  28: (c) => /<style[^>]*>\s*[^<\s]/i.test(html(c)),
  29: (c) => /<!--/.test(html(c)),
  30: (c) => /-{5,}\s*Forwarded message\s*-{5,}/i.test(html(c)),
  31: (c) => outlookBlock(c) && isForward(c),
  32: (c) => /<(?!style|script)[a-z][^>]*style\s*=\s*["'][^"']*display\s*:\s*none[^>]*>\s*[^<\s]/i.test(html(c)),
  // Named references past the XML five and nbsp, which every decoder handles.
  33: (c) => /&(?!(amp|lt|gt|quot|apos|nbsp);)[a-z][a-z0-9]+;/i.test(html(c)),
  34: (c) => /&#x[0-9a-f]+;/i.test(html(c)),
  35: (c) => /&#\d+;/.test(html(c)),
  36: (c) => /<\/td>\s*<td/i.test(html(c)),
  37: (c) => /<a\s[^>]*href\s*=\s*["']?(https?:|mailto:)/i.test(html(c)),
  38: (c) => /<img\s(?=[^>]*alt\s*=\s*["']?[^"'\s>])(?![^>]*src\s*=\s*["']?cid:)[^>]*>/i.test(html(c)),
  39: (c) => /<li[\s>]/i.test(html(c)),
  // The root is the HTML body, bare or inside an alternative (Outlook's shape).
  40: (c) => c.parts.some((p) => p.type === "multipart/related" && /^text\/html$|^multipart\/alternative$/.test(p.children[0]?.type ?? "")),
  41: (c) => /<img\s(?=[^>]*alt\s*=\s*["']?[^"'\s>])(?=[^>]*src\s*=\s*["']?cid:)[^>]*>/i.test(html(c)),
  42: (c) => c.mail.attachments.some((a) => a.contentId && (a.related || a.disposition === "inline") && /^image\//i.test(a.mimeType)),
  43: (c) => c.parts.some((p) => p.type === "multipart/mixed" && p.children.filter((k) => k.type === "text/plain" && !isAttachment(k)).length > 1),
  44: (c) => files(c).some((a) => a.filename),
  45: (c) => files(c).some((a) => a.content?.byteLength > 0),
  46: (c) => c.parts.some((p) => /^content-description:\s*\S/im.test(p.head)),
  47: (c) => c.parts.some((p) => /\bfilename\*=|\bname\*=/i.test(p.head)),
  48: (c) => c.parts.some((p) => /\b(file)?name\*0\*?=/i.test(p.head)),
  49: (c) => c.parts.some((p) => /\b(file)?name\s*=\s*"?=\?/i.test(p.head)),
  50: (c) => files(c).some((a) => !a.filename),
  51: (c) => rfc822(c, false).length > 0,
  52: (c) => rfc822(c, false).length > 0,
  53: (c) => rfc822(c, false).some((p) => /^date:/im.test(p.children[0]?.head ?? "")),
  54: (c) => rfc822(c, true).length > 0,
  55: (c) => rfc822(c, true).length > 0,
  56: (c) => c.parts.some((p) => p.type === "multipart/digest"),
  57: (c) => c.parts.some((p) => p.type === "multipart/report"),
  58: (c) => att(c, /^message\/(global-)?delivery-status$/i).some((a) => /^diagnostic-code:/im.test(attText(a))),
  59: (c) => att(c, /^text\/rfc822-headers$/i).length > 0,
  60: (c) => signedWith(c, /pkcs7-signature/),
  61: (c) => att(c, /^application\/(x-)?pkcs7-signature$/i).length > 0,
  62: (c) => signedWith(c, /pgp-signature/),
  63: (c) => att(c, /^application\/pgp-signature$/i).length > 0,
  64: (c) => c.parts.some((p) => p.type === "multipart/alternative" && p.children.some((k) => k.type === "text/plain") && p.children.some((k) => k.type === "text/calendar")),
  65: (c) => /^SUMMARY[;:]/m.test(cal(c)),
  66: (c) => /^LOCATION[;:]/m.test(cal(c)),
  67: (c) => /^DESCRIPTION[;:]/m.test(cal(c)),
  68: (c) => /^ORGANIZER[^:\r\n]*;CN=/m.test(cal(c)),
  69: (c) => /^ATTENDEE[^:\r\n]*;CN=/m.test(cal(c)),
  70: (c) => /^DTSTART[;:]/m.test(cal(c)),
  71: (c) => !c.mail.text && !c.mail.html && cal(c) !== "",
  72: (c) => enriched(c) !== "",
  73: (c) => /<excerpt>/i.test(enriched(c)),
  74: (c) => /<</.test(enriched(c)),
  75: (c) => nonAscii(top(c, "from")),
  76: (c) => nonAscii(top(c, "subject")),
};

export const UNDETECTABLE = {};

export default async function detect(bytes) {
  try {
    const mail = await PostalMime.parse(bytes, { rfc822Attachments: true });
    const parts = [];
    const root = walk(Buffer.from(bytes).toString("latin1"), parts);
    const ctx = { mail, parts, root };
    return Object.keys(ROWS).filter((row) => ROWS[row](ctx));
  } catch {
    return [];
  }
}
