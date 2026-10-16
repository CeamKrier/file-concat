/**
 * The body an Outlook message keeps only as compressed RTF (PidTagRtfCompressed,
 * `1009`): Outlook's own rich-text mail, and many older HTML mails, which it
 * wraps in RTF. Both readers here are written from the specs, with no
 * dependency: `@kenjiuno/decompressrtf` trusts the header's size and checks no
 * CRC, and `rtf-stream-parser` needs Node streams and throws on native RTF.
 */

/** MS-OXRTFCP 2.1.2.1: the dictionary every compressed stream starts from. */
const DICTIONARY =
  "{\\rtf1\\ansi\\mac\\deff0\\deftab720{\\fonttbl;}{\\f0\\fnil \\froman \\fswiss \\fmodern \\fscript \\fdecor MS Sans SerifSymbolArialTimes New RomanCourier{\\colortbl\\red0\\green0\\blue0\r\n\\par \\pard\\plain\\f0\\fs20\\b\\i\\u\\tab\\tx";
const LZFU = 0x75465a4c;
const MELA = 0x414c454d;

/** MS-OXRTFCP 2.1.3.2: the CRC-32 polynomial, started at 0 and never inverted. */
function crc(bytes: Uint8Array): number {
  let value = 0;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  }
  return value >>> 0;
}

/**
 * The RTF a PidTagRtfCompressed stream holds (MS-OXRTFCP 2.2.3), or nothing
 * when it is corrupt. The size is clamped to the stream's real length, so a
 * forged header cannot make a small stream produce much more than it holds.
 */
export function decompressRtf(stream: Uint8Array): Uint8Array | undefined {
  if (stream.length < 16) return undefined;
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  const kind = view.getUint32(8, true);
  // MELA is stored uncompressed and carries no CRC (2.2.3.1).
  if (kind === MELA) return stream.subarray(16);
  if (kind !== LZFU) return undefined;
  const end = Math.min(stream.length, view.getUint32(0, true) + 4);
  if (crc(stream.subarray(16, end)) !== view.getUint32(12, true)) return undefined;

  const dictionary = new Uint8Array(4096);
  for (let i = 0; i < DICTIONARY.length; i++) dictionary[i] = DICTIONARY.charCodeAt(i);
  let write = DICTIONARY.length;
  const out: number[] = [];
  const put = (byte: number) => {
    out.push(byte);
    dictionary[write] = byte;
    write = (write + 1) & 4095;
  };
  let at = 16;
  while (at < end) {
    const control = stream[at++];
    for (let bit = 0; bit < 8 && at < end; bit++) {
      if (!(control & (1 << bit))) {
        put(stream[at++]);
        continue;
      }
      if (at + 1 >= end) return undefined;
      const reference = (stream[at] << 8) | stream[at + 1];
      at += 2;
      let read = reference >> 4;
      // A reference to the write position itself marks the end (2.2.3.2).
      if (read === write) return Uint8Array.from(out);
      for (let n = (reference & 15) + 2; n > 0; n--) {
        put(dictionary[read]);
        read = (read + 1) & 4095;
      }
    }
  }
  return Uint8Array.from(out);
}

/** Destinations that hold no body text when they open a group. */
export const SKIPPED = new Set([
  "fonttbl", "colortbl", "stylesheet", "info", "pict", "object", "header", "footer", "headerl", "headerr",
  "headerf", "footerl", "footerr", "footerf", "listtable", "listoverridetable", "rsidtbl", "generator", "themedata",
  "colorschememapping", "latentstyles", "datastore", "xmlnstbl", "mmathPr", "pgdsctbl",
]);

const WORDS: Readonly<Record<string, string>> = {
  par: "\n", line: "\n", sect: "\n", page: "\n", row: "\n", tab: "\t", cell: "\t",
  lquote: "\u2018", rquote: "\u2019", ldblquote: "\u201c", rdblquote: "\u201d",
  emdash: "\u2014", endash: "\u2013", bullet: "\u2022",
};

/**
 * A font's `\fcharset` to the code page its 8-bit text is in. Charsets 0 and
 * 1 (ANSI, default) and anything unlisted fall back to `\ansicpg`: a Chinese
 * body under `\ansicpg1252` is in Big5 only by its font. A Symbol font (2)
 * is read as 1252, so a list bullet is not half of a Big5 character
 * (Tika's testMSG_chinese).
 */
const CHARSET_CODEPAGES: Readonly<Record<number, number>> = {
  2: 1252, 77: 10000, 128: 932, 129: 949, 134: 936, 136: 950, 161: 1253, 162: 1254, 163: 1258,
  177: 1255, 178: 1256, 186: 1257, 204: 1251, 222: 874, 238: 1250,
};

const isLetter = (b: number) => (b >= 0x61 && b <= 0x7a) || (b >= 0x41 && b <= 0x5a);

interface Group {
  skip: boolean;
  /** Inside `{\*\htmltag}`: the original HTML, always kept. */
  tag: boolean;
  /** `\htmlrtf` is on: RTF Outlook added around the HTML, never kept. */
  htmlrtf: boolean;
  /** `\*` opened the group: skip it unless it is an htmltag. */
  star: boolean;
  /** Characters a `\uN` replacement is followed by, for readers without Unicode. */
  uc: number;
  /** Inside the font table, where `\fN` defines a font instead of selecting it. */
  fonttbl: boolean;
  font?: number;
}

/**
 * The text of an RTF body, or the HTML Outlook wrapped in it. `\fromhtml1`
 * among the first ten tokens (MS-OXRTFEX 2.2.3.1) says the RTF encapsulates
 * HTML: the htmltag groups and the text outside `\htmlrtf` are the original
 * page (2.2.3.2). Otherwise the text is read the way `\fromtext` (2.2.3.3) and
 * native RTF both are: everything outside the skipped destinations.
 *
 * `decode` turns 8-bit text into a string through the code page of the
 * current font's charset, else `\ansicpg`.
 */
export function rtfBody(
  rtf: Uint8Array,
  decode: (bytes: Uint8Array, codepage: number) => string,
): { html: boolean; text: string } {
  let codepage = 1252;
  let defaultFont: number | undefined;
  let defining: number | undefined;
  const charsets = new Map<number, number>();
  let html = false;
  let tokens = 0;
  let out = "";
  let pending: number[] = [];
  let pendingCodepage = codepage;
  const flush = () => {
    if (pending.length > 0) out += decode(Uint8Array.from(pending), pendingCodepage);
    pending = [];
  };
  const emit = (text: string) => {
    flush();
    out += text;
  };
  let group: Group = { skip: false, tag: false, htmlrtf: false, star: false, uc: 1, fonttbl: false };
  const stack: Group[] = [];
  let opened = false;
  let fallback = 0;
  const visible = () => !group.skip && (!html || group.tag || !group.htmlrtf);
  const byte = (value: number) => {
    if (fallback > 0) return void fallback--;
    if (!visible()) return;
    const charset = charsets.get(group.font ?? defaultFont ?? -1);
    const current = (charset !== undefined && CHARSET_CODEPAGES[charset]) || codepage;
    if (current !== pendingCodepage) flush();
    pendingCodepage = current;
    pending.push(value);
  };

  for (let i = 0; i < rtf.length; ) {
    const c = rtf[i];
    if (c === 0x7b || c === 0x7d) {
      if (c === 0x7b) stack.push(group);
      group = c === 0x7b ? { ...group, star: false } : (stack.pop() ?? group);
      opened = c === 0x7b;
      fallback = 0;
      i++;
      continue;
    }
    const first = opened;
    opened = false;
    if (c !== 0x5c) {
      i++;
      if (c !== 0x0d && c !== 0x0a) byte(c);
      continue;
    }
    const next = rtf[i + 1];
    if (next === 0x27) {
      // \'hh: one byte in the code page.
      const value = parseInt(String.fromCharCode(rtf[i + 2], rtf[i + 3]), 16);
      i += 4;
      if (!Number.isNaN(value)) byte(value);
      continue;
    }
    if (!isLetter(next)) {
      // A control symbol.
      i += 2;
      if (next === 0x2a) group.star = true;
      else if (!visible()) continue;
      else if (next === 0x5c || next === 0x7b || next === 0x7d) emit(String.fromCharCode(next));
      else if (next === 0x7e) emit(" ");
      else if (next === 0x5f) emit("-");
      else if (next === 0x0d || next === 0x0a) emit("\n");
      continue;
    }
    // A control word is at most 32 letters and its number at most 10 digits;
    // the caps keep a malformed run from becoming one huge token.
    let j = i + 1;
    while (j < rtf.length && j - i <= 32 && isLetter(rtf[j])) j++;
    const word = String.fromCharCode(...rtf.subarray(i + 1, j));
    let k = j;
    if (rtf[k] === 0x2d) k++;
    while (k < rtf.length && k - j <= 10 && rtf[k] >= 0x30 && rtf[k] <= 0x39) k++;
    const param = k > j ? parseInt(String.fromCharCode(...rtf.subarray(j, k)), 10) : undefined;
    i = rtf[k] === 0x20 ? k + 1 : k;
    tokens++;

    if (word === "bin") {
      i += Math.max(0, Math.min(param ?? 0, rtf.length - i));
      continue;
    }
    if (word === "fromhtml" && param === 1 && tokens <= 10) html = true;
    else if (word === "ansicpg" && param !== undefined) codepage = param;
    else if (word === "deff") defaultFont = param;
    else if (group.star) {
      group.star = false;
      if (html && word === "htmltag") group.tag = true;
      else group.skip = true;
    } else if (first && SKIPPED.has(word)) {
      group.skip = true;
      group.fonttbl = word === "fonttbl";
    } else if (word === "f" && group.fonttbl) defining = param;
    else if (word === "f") group.font = param;
    else if (word === "fcharset" && group.fonttbl && defining !== undefined && param !== undefined) charsets.set(defining, param);
    else if (word === "htmlrtf") group.htmlrtf = param !== 0;
    else if (word === "uc") group.uc = param ?? 1;
    else if (word === "u" && param !== undefined) {
      if (visible()) emit(String.fromCharCode(param < 0 ? param + 65536 : param));
      fallback = group.uc;
    } else if (visible() && WORDS[word]) emit(WORDS[word]);
  }
  flush();
  return { html, text: out.replace(/\0/g, "") };
}
