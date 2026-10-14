import { formatEmail, type MessageFields } from "./email";
import { decompressRtf, rtfBody } from "./msg-rtf";
import type { ExtractionResult } from "./types";

/**
 * Outlook messages (`.msg`, MS-OXMSG), rendered the way `.eml` is.
 *
 * A `.msg` is a compound file whose streams are MAPI properties, one stream
 * per property, named `__substg1.0_<id><type>`: `0037` is the subject, `1000`
 * the body, `001F` a UTF-16 string and `001E` an 8-bit one. Fixed-size values
 * (the times, the code pages) sit in one `__properties_version1.0` stream as
 * 16-byte records. Recipients and attachments are storages of their own with
 * the same layout inside.
 *
 * Only the shaping lives here, over streams already lifted out of the
 * container. Opening the container is a platform loader's job (ADR-0012): the
 * browser reads it with the same library that reads a 97-2003 workbook, in a
 * lazy chunk the Cloudflare worker never sees.
 */

/**
 * A compound file lifted out of its container: stream path relative to the
 * root storage, to the stream's bytes. Shared by every reader over one.
 */
export type CfbStreams = ReadonlyMap<string, Uint8Array>;

/**
 * MAPI property ids. Sender SMTP (`5D01`) is preferred over the sender
 * address (`0C1F`), which is an X.500 path on Exchange mail.
 */
const SUBJECT = "0037";
const BODY = "1000";
const HTML_BODY = "1013";
const RTF_COMPRESSED = "1009";
const SENDER_NAME = "0C1A";
const SENDER_ADDRESS = "0C1F";
const SENDER_SMTP = "5D01";
const DISPLAY_TO = "0E04";
const DISPLAY_CC = "0E03";
const DISPLAY_BCC = "0E02";
const MESSAGE_CLASS = "001A";
/** Inside a recipient storage: name, SMTP address, then the address of any type. */
const RECIPIENT_NAME = "3001";
const RECIPIENT_SMTP = "39FE";
const RECIPIENT_ADDRESS = "3003";
const RECIPIENT_TYPE = 0x0c15;
const ATTACH_LONG_FILENAME = "3707";
const ATTACH_FILENAME = "3704";
const ATTACH_DISPLAY_NAME = "3001";
/** Delivery time, then client submit time: one of the two is on every message. */
const DELIVERY_TIME = 0x0e06;
const SUBMIT_TIME = 0x0039;
const MESSAGE_CODEPAGE = 0x3ffd;
const INTERNET_CODEPAGE = 0x3fde;

const PT_LONG = 0x0003;
const PT_SYSTIME = 0x0040;

/** Windows code page numbers to the labels `TextDecoder` knows; 874 and
 * 1250-1258 go by `windows-<n>` and 28591-28606 by `iso-8859-<n>`. */
const CODEPAGE_LABELS: Readonly<Record<number, string>> = {
  866: "ibm866",
  932: "shift_jis",
  936: "gbk",
  949: "euc-kr",
  950: "big5",
  1200: "utf-16le",
  1201: "utf-16be",
  10000: "macintosh",
  10007: "x-mac-cyrillic",
  20127: "windows-1252",
  20866: "koi8-r",
  20932: "euc-jp",
  20936: "gbk",
  21866: "koi8-u",
  50220: "iso-2022-jp",
  50221: "iso-2022-jp",
  50222: "iso-2022-jp",
  51932: "euc-jp",
  51949: "euc-kr",
  54936: "gb18030",
  65001: "utf-8",
};

function decode(bytes: Uint8Array, codepage: number | undefined): string {
  const iso = codepage !== undefined && codepage >= 28591 && codepage <= 28606 ? `iso-8859-${codepage - 28590}` : undefined;
  const label = codepage === undefined ? "windows-1252" : (CODEPAGE_LABELS[codepage] ?? iso ?? `windows-${codepage}`);
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** The fixed-size properties of one storage: id to a raw 8-byte value. */
function fixedProperties(stream: Uint8Array | undefined, headerBytes: number): Map<number, DataView> {
  const out = new Map<number, DataView>();
  if (!stream) return out;
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  for (let at = headerBytes; at + 16 <= stream.byteLength; at += 16) {
    out.set((view.getUint16(at + 2, true) << 16) | view.getUint16(at, true), new DataView(stream.buffer, stream.byteOffset + at + 8, 8));
  }
  return out;
}

function longProperty(properties: ReadonlyMap<number, DataView>, id: number): number | undefined {
  return properties.get((id << 16) | PT_LONG)?.getUint32(0, true);
}

/** A FILETIME (100 ns ticks since 1601) as a Date, or nothing when unset. */
function timeProperty(properties: ReadonlyMap<number, DataView>, id: number): Date | undefined {
  const value = properties.get((id << 16) | PT_SYSTIME);
  if (!value) return undefined;
  const ticks = value.getUint32(4, true) * 2 ** 32 + value.getUint32(0, true);
  if (!ticks) return undefined;
  return new Date(ticks / 10000 - 11644473600000);
}

/** A string property from a storage, Unicode first, then the 8-bit stream. */
function stringProperty(streams: CfbStreams, prefix: string, id: string, codepage: number | undefined): string {
  const unicode = streams.get(`${prefix}__substg1.0_${id}001F`);
  if (unicode) return decode(unicode, 1200).replace(/\0+$/, "");
  const ansi = streams.get(`${prefix}__substg1.0_${id}001E`);
  if (ansi) return decode(ansi, codepage).replace(/\0+$/, "");
  return "";
}

/**
 * The fixed property id a named property was given in this file (MS-OXMSG
 * 2.2.3.1): its entry in the name-id mapping, numeric and in the property set
 * at `guid`, is the `index`-th, and the id is `0x8000 + index`.
 */
function namedProperty(streams: CfbStreams, guid: Uint8Array, lid: number): number | undefined {
  const guids = streams.get("__nameid_version1.0/__substg1.0_00020102");
  const entries = streams.get("__nameid_version1.0/__substg1.0_00030102");
  if (!guids || !entries) return undefined;
  const view = new DataView(entries.buffer, entries.byteOffset, entries.byteLength);
  for (let at = 0; at + 8 <= entries.byteLength; at += 8) {
    const info = view.getUint32(at + 4, true);
    // Bit 0 is the kind (0 numeric), bits 1-15 the GUID index, of which 3 and
    // up point into the GUID stream; the high half is the property index.
    const guidIndex = (info >>> 1) & 0x7fff;
    if (info & 1 || view.getUint32(at, true) !== lid || guidIndex < 3) continue;
    const start = (guidIndex - 3) * 16;
    if (start + 16 <= guids.length && guids.subarray(start, start + 16).every((byte, i) => byte === guid[i])) {
      return 0x8000 + (info >>> 16);
    }
  }
  return undefined;
}

/** PSETID_Appointment {00062002-0000-0000-C000-000000000046}, as stored. */
const PSETID_APPOINTMENT = Uint8Array.of(0x02, 0x20, 0x06, 0, 0, 0, 0, 0, 0xc0, 0, 0, 0, 0, 0, 0, 0x46);
const LID_LOCATION = 0x8208;
const LID_START = 0x820d;
const LID_END = 0x820e;

/**
 * When and where a meeting is, which Outlook keeps in named properties: a
 * calendar item or meeting request would otherwise read as a mail sent at its
 * save time. Written the way a mail's invite part is (`calendar.ts`).
 */
function appointment(streams: CfbStreams, properties: ReadonlyMap<number, DataView>, codepage: number | undefined): string[] {
  if (!/^IPM\.(Appointment|Schedule\.Meeting)/i.test(stringProperty(streams, "", MESSAGE_CLASS, codepage))) return [];
  const id = (lid: number) => namedProperty(streams, PSETID_APPOINTMENT, lid);
  const time = (lid: number) => {
    const named = id(lid);
    const date = named === undefined ? undefined : timeProperty(properties, named);
    return date && `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  };
  const location = id(LID_LOCATION);
  const lines = [
    ["Starts", time(LID_START)],
    ["Ends", time(LID_END)],
    ["Location", location === undefined ? "" : stringProperty(streams, "", location.toString(16).toUpperCase(), codepage)],
  ].filter(([, value]) => value);
  return lines.length > 0 ? [lines.map(([label, value]) => `${label}: ${value}`).join("\n")] : [];
}

/** Outlook separates display names with a semicolon. */
function displayNames(value: string): MessageFields["to"] {
  return value
    .split(";")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ name, address: "" }));
}

/**
 * Turn a message's streams into the text a bundle should carry. Answers with
 * empty text, the contract's "couldn't extract" (ADR-0003), when the streams
 * hold no header and no body worth printing.
 */
export function formatMsg(streams: CfbStreams): ExtractionResult {
  const properties = fixedProperties(streams.get("__properties_version1.0"), 32);
  // Without the message's code page, the body's internet code page, as POI
  // reads a body (MAPIMessage.guess7BitEncoding), unless it is UTF-8: an older
  // client's 8-bit strings never are. A Big5 message from Taiwanese Outlook
  // carries only that one (Tika's testMSG_chinese).
  const internet = longProperty(properties, INTERNET_CODEPAGE);
  const codepage = longProperty(properties, MESSAGE_CODEPAGE) ?? (internet === 65001 ? undefined : internet);
  const text = (id: string) => stringProperty(streams, "", id, codepage);

  const senderName = text(SENDER_NAME);
  const senderAddress = [text(SENDER_SMTP), text(SENDER_ADDRESS)].find((value) => value.includes("@")) ?? "";
  const from = senderName || senderAddress ? { name: senderName, address: senderAddress } : undefined;
  const date = timeProperty(properties, DELIVERY_TIME) ?? timeProperty(properties, SUBMIT_TIME);

  // Plain text first, as the .eml path reads it. The new Outlook writes only
  // an HTML body, in the internet code page as binary, or as a string. Outlook's
  // own rich-text mail, and HTML it wrapped in RTF, are only in the compressed RTF.
  let body = text(BODY).replace(/\r\n/g, "\n");
  const html = streams.get(`__substg1.0_${HTML_BODY}0102`);
  let htmlBody = body ? "" : html ? decode(html, internet ?? codepage) : text(HTML_BODY);
  const compressed = body || htmlBody ? undefined : streams.get(`__substg1.0_${RTF_COMPRESSED}0102`);
  const rtf = compressed && decompressRtf(compressed);
  if (rtf) {
    const read = rtfBody(rtf, decode);
    if (read.html) htmlBody = read.text;
    else body = read.text.trim();
  }

  const storages = new Set([...streams.keys()].map((key) => key.slice(0, key.indexOf("/") + 1)));
  const storage = (kind: string, index: number) => `__${kind}_version1.0_#${index.toString(16).toUpperCase().padStart(8, "0")}/`;

  // A recipient storage holds the address the display lists leave out, and
  // the only Bcc record a sent copy has. Type 1 is To, 2 Cc, 3 Bcc; a message
  // has at most 2048 (MS-OXMSG 2.2.1).
  const recipients: Record<number, NonNullable<MessageFields["to"]>> = { 1: [], 2: [], 3: [] };
  for (let index = 0; index < 2048 && storages.has(storage("recip", index)); index++) {
    const prefix = storage("recip", index);
    const type = (longProperty(fixedProperties(streams.get(`${prefix}__properties_version1.0`), 8), RECIPIENT_TYPE) ?? 1) & 0xf;
    const name = stringProperty(streams, prefix, RECIPIENT_NAME, codepage);
    const address = [RECIPIENT_SMTP, RECIPIENT_ADDRESS]
      .map((id) => stringProperty(streams, prefix, id, codepage))
      .find((value) => value.includes("@")) ?? "";
    if (name || address) recipients[type]?.push({ name: name || address, address });
  }
  const listed = storages.has(storage("recip", 0));

  // Attachment storages are numbered from zero; an attached message carries no
  // filename, only the subject and display name of what it wraps.
  const attachments: { filename: string | null }[] = [];
  for (let index = 0; ; index++) {
    const prefix = storage("attach", index);
    if (!storages.has(prefix)) break;
    const name = [ATTACH_LONG_FILENAME, ATTACH_FILENAME, ATTACH_DISPLAY_NAME, SUBJECT]
      .map((id) => stringProperty(streams, prefix, id, codepage))
      .find(Boolean);
    attachments.push({ filename: name ?? null });
  }

  return formatEmail({
    from,
    to: listed ? recipients[1] : displayNames(text(DISPLAY_TO)),
    cc: listed ? recipients[2] : displayNames(text(DISPLAY_CC)),
    bcc: listed ? recipients[3] : displayNames(text(DISPLAY_BCC)),
    date: date?.toUTCString(),
    subject: text(SUBJECT),
    text: body,
    html: htmlBody,
    events: appointment(streams, properties, codepage),
    attachments,
  });
}
