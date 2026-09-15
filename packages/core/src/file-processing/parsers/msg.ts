import { formatEmail, type MessageFields } from "./email";
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

/** Stream path inside the message, relative to its root, to the stream's bytes. */
export type MsgStreams = ReadonlyMap<string, Uint8Array>;

/**
 * MAPI property ids. Sender SMTP (`5D01`) is preferred over the sender
 * address (`0C1F`), which is an X.500 path on Exchange mail.
 */
const SUBJECT = "0037";
const BODY = "1000";
const HTML_BODY = "1013";
const SENDER_NAME = "0C1A";
const SENDER_ADDRESS = "0C1F";
const SENDER_SMTP = "5D01";
const DISPLAY_TO = "0E04";
const DISPLAY_CC = "0E03";
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

/** Windows code page numbers to the labels `TextDecoder` knows. */
const CODEPAGE_LABELS: Readonly<Record<number, string>> = {
  932: "shift_jis",
  936: "gbk",
  949: "euc-kr",
  950: "big5",
  1200: "utf-16le",
  20127: "windows-1252",
  28591: "iso-8859-1",
  28592: "iso-8859-2",
  28599: "iso-8859-9",
  65001: "utf-8",
};

function decode(bytes: Uint8Array, codepage: number | undefined): string {
  const label = codepage === undefined ? "windows-1252" : (CODEPAGE_LABELS[codepage] ?? `windows-${codepage}`);
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
function stringProperty(streams: MsgStreams, prefix: string, id: string, codepage: number | undefined): string {
  const unicode = streams.get(`${prefix}__substg1.0_${id}001F`);
  if (unicode) return decode(unicode, 1200).replace(/\0+$/, "");
  const ansi = streams.get(`${prefix}__substg1.0_${id}001E`);
  if (ansi) return decode(ansi, codepage).replace(/\0+$/, "");
  return "";
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
export function formatMsg(streams: MsgStreams): ExtractionResult {
  const properties = fixedProperties(streams.get("__properties_version1.0"), 32);
  const codepage = longProperty(properties, MESSAGE_CODEPAGE);
  const text = (id: string) => stringProperty(streams, "", id, codepage);

  const senderName = text(SENDER_NAME);
  const senderAddress = [text(SENDER_SMTP), text(SENDER_ADDRESS)].find((value) => value.includes("@")) ?? "";
  const from = senderName || senderAddress ? { name: senderName, address: senderAddress } : undefined;
  const date = timeProperty(properties, DELIVERY_TIME) ?? timeProperty(properties, SUBMIT_TIME);

  const body = text(BODY).replace(/\r\n/g, "\n");
  // The new Outlook writes only an HTML body, in the internet code page.
  const html = streams.get(`__substg1.0_${HTML_BODY}0102`);
  const htmlBody = !body && html ? decode(html, longProperty(properties, INTERNET_CODEPAGE)) : "";

  // Attachment storages are numbered from zero; an attached message carries no
  // filename, only the subject and display name of what it wraps.
  const attachments: { filename: string | null }[] = [];
  for (let index = 0; ; index++) {
    const prefix = `__attach_version1.0_#${index.toString(16).toUpperCase().padStart(8, "0")}/`;
    if (![...streams.keys()].some((key) => key.startsWith(prefix))) break;
    const name = [ATTACH_LONG_FILENAME, ATTACH_FILENAME, ATTACH_DISPLAY_NAME, SUBJECT]
      .map((id) => stringProperty(streams, prefix, id, codepage))
      .find(Boolean);
    attachments.push({ filename: name ?? null });
  }

  return formatEmail({
    from,
    to: displayNames(text(DISPLAY_TO)),
    cc: displayNames(text(DISPLAY_CC)),
    date: date?.toUTCString(),
    subject: text(SUBJECT),
    text: body,
    html: htmlBody,
    attachments,
  });
}
