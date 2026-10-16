import { decodeCodepage } from "./msg";
import { rtfBody } from "./msg-rtf";

/**
 * A document's own title, written once above its text as `[Title: ...]` (Q30
 * O2). The other properties stay out: none of pandoc, markitdown, docling, Tika
 * or unstructured puts them in the body, a reader never sees them, and an
 * author's name in every bundle is a leak. A title is the one that can tell a
 * model what a file is when its name does not.
 *
 * Skipped when it says nothing: empty, a writer's placeholder ("Untitled",
 * "PowerPoint Presentation", "Microsoft Word - report.docx"), the file's own
 * name, or a line the text already opens with. pdf.js's viewer drops an
 * "Untitled" title for the same reason; the rest of the list is ours.
 *
 * Folded onto one line and capped: the title is document-supplied, and a line
 * break in it would forge structure in a bundle a model reads as one document.
 */
export function withTitle(text: string, title: string | undefined, path: string): string {
  const folded = [...(title ?? "").slice(0, MAX_TITLE * 4).replace(/\s+/g, " ").trim()].slice(0, MAX_TITLE).join("");
  if (!text || !/[\p{L}\p{N}]/u.test(folded) || /[￰-￿]/.test(folded) || PLACEHOLDER.test(folded)) return text;
  const name = path.split(/[\\/]/).pop() ?? path;
  const same = plain(folded);
  if (same === plain(name) || same === plain(name.replace(/\.[^.]*$/, ""))) return text;
  const opening = text.split("\n").filter((line) => line.trim()).slice(0, OPENING_LINES);
  if (opening.some((line) => plain(line.replace(/^#+\s*/, "")) === same)) return text;
  return `[Title: ${folded}]\n\n${text}`;
}

const MAX_TITLE = 300;
/** A title page sits within the first lines, after a `# Page 1` or `# Slide 1`. */
const OPENING_LINES = 5;
/**
 * A writer's default. One word and a small number is the pattern behind
 * `Document1`, `Book1`, `Slide 1` and their translations (`Snimek 1`, `Folie 1`,
 * Japanese `Suraido 1`), which PowerPoint stores as a deck's title in every
 * language; a real title of that shape (`Windows 11`) is lost with them.
 */
const PLACEHOLDER = /^(untitled( document)?|title|new document|document|presentation|powerpoint presentation|workbook|\p{L}+ ?\d{1,3}|microsoft (word|excel|powerpoint) - .*)$/iu;
const plain = (text: string) => text.toLowerCase().replace(/[\s_.-]+/g, " ").trim();

/**
 * The title a PDF viewer shows: the catalog's XMP `dc:title`, else the
 * trailer's `/Info` `/Title`, the order pdf.js's viewer reads them in. A byte
 * scan for the three objects involved, as `pdf-layers.ts` scans for layers.
 *
 * ponytail: objects inside an object stream and a compressed XMP stream are not
 * read, and an encrypted file is skipped since its strings are encrypted; the
 * readers' own metadata can fill in where a platform has it.
 */
export function pdfTitle(bytes: Uint8Array): string | undefined {
  const trailer = latin1(bytes.subarray(Math.max(0, bytes.length - TAIL)));
  if (trailer.includes("/Encrypt")) return undefined;
  const ref = (key: string) => [...trailer.matchAll(new RegExp(`/${key}\\s+(\\d+)\\s+(\\d+)\\s+R`, "g"))].pop();
  const root = ref("Root");
  const catalog = root && pdfObject(bytes, root[1], root[2]);
  const metadata = catalog && /\/Metadata\s+(\d+)\s+(\d+)\s+R/.exec(catalog);
  const xmp = metadata && pdfObject(bytes, metadata[1], metadata[2]);
  // Cut to the element before matching, so the lazy pattern stays linear.
  const element = xmp && !/\/Filter/.test(xmp.slice(0, xmp.indexOf("stream"))) ? xmp.slice(xmp.indexOf("<dc:title>")) : "";
  const xmpTitle = element.startsWith("<dc:title>") ? /<rdf:li[^>]{0,200}>([^<]*)<\/rdf:li>/.exec(element.slice(0, MAX_ELEMENT)) : null;
  const fromXmp = xmpTitle && new TextDecoder().decode(Uint8Array.from(xmpTitle[1], (char) => char.charCodeAt(0)));
  if (fromXmp && fromXmp.trim() !== "Untitled") return unescapeXml(fromXmp);
  const info = ref("Info");
  const dictionary = info && pdfObject(bytes, info[1], info[2]);
  const at = dictionary ? dictionary.search(/\/Title\s*[(<]/) : -1;
  return dictionary && at >= 0 ? pdfString(dictionary.slice(at + "/Title".length).trimStart()) : undefined;
}

/** Where `/Root` and `/Info` are looked for: the last trailer or xref stream dictionary. */
const TAIL = 64 << 10;
/** How much of the XMP title element is read; a real one is a few hundred bytes. */
const MAX_ELEMENT = 4096;
/** An `/Info` or catalog dictionary, or a metadata stream, is never longer than this. */
const OBJECT_CAP = 1 << 20;

const latin1 = (bytes: Uint8Array) => {
  let out = "";
  for (let at = 0; at < bytes.length; at += 0x8000) out += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return out;
};

/** The last `n g obj ... endobj` in the file, as latin1. */
function pdfObject(bytes: Uint8Array, number: string, generation: string): string | undefined {
  const needle = Uint8Array.from(`${number} ${generation} obj`, (char) => char.charCodeAt(0));
  let found = -1;
  for (let at = bytes.indexOf(needle[0]); at !== -1; at = bytes.indexOf(needle[0], at + 1)) {
    let matched = 1;
    while (matched < needle.length && bytes[at + matched] === needle[matched]) matched++;
    // Preceded by whitespace, so `12 0 obj` is not found inside `112 0 obj`.
    if (matched === needle.length && (at === 0 || bytes[at - 1] <= 0x20)) found = at;
  }
  if (found < 0) return undefined;
  const text = latin1(bytes.subarray(found + needle.length, found + needle.length + OBJECT_CAP));
  const end = text.indexOf("endobj");
  return end < 0 ? text : text.slice(0, end);
}

/** A literal `( ... )` or hex `< ... >` string, as a viewer reads it. */
function pdfString(source: string): string | undefined {
  let raw = "";
  if (source.startsWith("<")) {
    const hex = source.slice(1, source.indexOf(">")).replace(/[^0-9a-f]/gi, "");
    for (let at = 0; at < hex.length; at += 2) raw += String.fromCharCode(parseInt(hex.slice(at, at + 2).padEnd(2, "0"), 16));
  } else {
    let depth = 0;
    for (let at = 0; at < source.length; at++) {
      const char = source[at];
      if (char === "\\") {
        const next = source[++at];
        const octal = /^[0-7]{1,3}/.exec(source.slice(at, at + 3));
        if (octal) {
          raw += String.fromCharCode(parseInt(octal[0], 8) & 0xff);
          at += octal[0].length - 1;
        } else if (next === "\r" || next === "\n") {
          if (next === "\r" && source[at + 1] === "\n") at++;
        } else raw += ESCAPES[next] ?? next ?? "";
        continue;
      }
      if (char === "(" && depth++ === 0) continue;
      if (char === ")" && --depth === 0) break;
      raw += char;
    }
  }
  const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder().decode(bytes.subarray(3));
  // ponytail: PDFDocEncoding read as latin1; its 0x80-0x9f punctuation is off.
  return raw;
}

const ESCAPES: Readonly<Record<string, string>> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };

const unescapeXml = (text: string) =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Math.min(parseInt(decimal, 10), 0x10ffff)))
    .replace(/&(lt|gt|quot|apos|amp);/g, (_, name: string) => XML_ENTITIES[name]);

const XML_ENTITIES: Readonly<Record<string, string>> = { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" };

/**
 * An RTF document's `{\info {\title ...}}`. officeparser and anydoc both skip
 * the info group, so the title is read here, through the same decoder an
 * Outlook body goes through, under the document's `\ansicpg`.
 */
export function rtfTitle(bytes: Uint8Array): string | undefined {
  if (bytes[0] !== 0x7b || bytes[1] !== 0x5c || bytes[2] !== 0x72) return undefined;
  const head = latin1(bytes.subarray(0, Math.min(bytes.length, OBJECT_CAP)));
  const info = head.indexOf("{\\info");
  const start = info < 0 ? -1 : head.indexOf("{\\title", info);
  if (start < 0) return undefined;
  let depth = 0;
  let end = start;
  for (; end < head.length; end++) {
    if (head[end] === "\\") end++;
    else if (head[end] === "{") depth++;
    else if (head[end] === "}" && --depth === 0) break;
  }
  const codepage = /\\ansicpg(\d+)/.exec(head.slice(0, info))?.[1] ?? "1252";
  const group = head.slice(start + "{\\title".length, end);
  const rtf = Uint8Array.from(`{\\rtf1\\ansicpg${codepage} ${group}}`, (char) => char.charCodeAt(0));
  return rtfBody(rtf, decodeCodepage).text.trim();
}

/**
 * A 97-2003 compound file's title: property 2 (PIDSI_TITLE) of the
 * `\x05SummaryInformation` stream (MS-OLEPS 2.21, 2.25.1), an 8-bit string in
 * the property set's code page (property 1) or a UTF-16 one.
 */
export function summaryTitle(stream: Uint8Array | undefined): string | undefined {
  if (!stream || stream.byteLength < 48) return undefined;
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  const set = view.getUint32(44, true);
  if (set + 8 > stream.byteLength) return undefined;
  const count = Math.min(view.getUint32(set + 4, true), (stream.byteLength - set - 8) >> 3);
  const offsets = new Map<number, number>();
  for (let index = 0; index < count; index++) {
    offsets.set(view.getUint32(set + 8 + index * 8, true), set + view.getUint32(set + 12 + index * 8, true));
  }
  const codepageAt = offsets.get(1);
  const codepage = codepageAt !== undefined && codepageAt + 6 <= stream.byteLength ? view.getUint16(codepageAt + 4, true) : 1252;
  const at = offsets.get(2);
  if (at === undefined || at + 8 > stream.byteLength) return undefined;
  const type = view.getUint16(at, true);
  const size = view.getUint32(at + 4, true);
  const wide = type === VT_LPWSTR || (type === VT_LPSTR && codepage === CP_WINUNICODE);
  if (type !== VT_LPSTR && type !== VT_LPWSTR) return undefined;
  // VT_LPWSTR counts characters, VT_LPSTR bytes.
  const bytes = stream.subarray(at + 8, Math.min(stream.byteLength, at + 8 + (type === VT_LPWSTR ? size * 2 : size)));
  const text = wide ? new TextDecoder("utf-16le").decode(bytes) : decodeCodepage(bytes, codepage);
  return text.replace(/\0+$/, "");
}

/** The stream {@link summaryTitle} reads, as a compound file names it. */
export const SUMMARY_INFORMATION = "\u0005SummaryInformation";
const VT_LPSTR = 0x1e;
const VT_LPWSTR = 0x1f;
const CP_WINUNICODE = 1200;
