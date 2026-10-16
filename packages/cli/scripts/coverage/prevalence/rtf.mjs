/**
 * Which rows of the coverage map's RTF table (results/rtf.md) a real .rtf file
 * holds, read from control words. RTF has no DOM, so the one structural tool
 * is a brace-balanced group scanner: a destination such as `{\footnote ...}`
 * or `{\*\annotation ...}` is located by its first control word and taken
 * whole, nested groups included.
 *
 * Three views of the file. `src` is all of it. `body` drops the header tables
 * (fonts, colours, styles, lists, info, revision authors). `shown` also drops
 * every `{\*...}` destination and picture data, and is where text-level rows
 * (escapes, code-page bytes, special characters) look, so a `\'hh` inside a
 * font name or an `\htmltag` does not count as body text.
 */

const after = (word) => String.raw`(?:\\\*)?\\(?:${word})(?![a-z])`;
const STARRED = String.raw`\\\*`;

// Index just past the group that opens at s[i] === "{".
function end(s, i) {
  let depth = 0;
  for (; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\") {
      const bin = s.startsWith("\\bin", i) ? /^\\bin(\d+) ?/.exec(s.slice(i, i + 24)) : null;
      i += bin ? bin[0].length + Number(bin[1]) - 1 : 1;
    } else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return i + 1;
  }
  return s.length;
}

// Every group whose opening matches `head` (a regex source read right after "{").
function groups(s, head) {
  const re = new RegExp(String.raw`\{\s*(?:${head})`, "gi");
  const out = [];
  for (let m; (m = re.exec(s)); ) {
    const e = end(s, m.index);
    out.push([m.index, e]);
    re.lastIndex = e;
  }
  return out;
}
const texts = (s, head) => groups(s, head).map(([a, b]) => s.slice(a, b));
function drop(s, head) {
  let out = "";
  let at = 0;
  for (const [a, b] of groups(s, head)) {
    out += s.slice(at, a);
    at = b;
  }
  return out + s.slice(at);
}

// What a group says once its own braces, control words, nested destinations
// and pictures are gone.
const text = (g) =>
  drop(g.slice(1, -1).replace(/^\s*\\\*/, ""), `${STARRED}|${after("pict")}`)
    .replace(/\\'[0-9a-f]{2}|\\u-?\d+/gi, "x")
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/\\[^a-z]/gi, "x")
    .replace(/[{}\s;]/g, "");
const hasText = (g) => text(g) !== "";
const some = (s, head, test = hasText) => texts(s, head).some(test);

// \fcharset to Windows code page (RTF 1.9.1 font table), for telling a font
// that only restates the document code page from one that brings its own.
const CHARSET_CP = { 0: 1252, 128: 932, 129: 949, 130: 1361, 134: 936, 136: 950, 161: 1253, 162: 1254, 163: 1258, 177: 1255, 178: 1256, 186: 1257, 204: 1251, 222: 874, 238: 1250, 255: 437 };

// A \uN's fallback (\ucN characters, one by default) is not text of its own.
// ponytail: \ucN is taken as document-wide, not group-scoped.
function withoutFallbacks(s) {
  const re = /\\uc(\d+) ?|\\u-?\d+ ?/g;
  let uc = 1;
  let out = "";
  let at = 0;
  for (let m; (m = re.exec(s)); ) {
    out += s.slice(at, m.index) + "u";
    at = re.lastIndex;
    if (m[1] !== undefined) uc = Number(m[1]);
    else for (let k = 0, f; k < uc && (f = /^(\\'[0-9a-f]{2}|[^\\{}])/i.exec(s.slice(at, at + 4))); k++) at += f[0].length;
    re.lastIndex = at;
  }
  return out + s.slice(at);
}

// A byte >= 0x80 written as \'hh, sorted by the charset of the font in force:
// the document's \ansicpg (rows 3, 4) or a font charset of its own (row 5).
// Group scope is followed: a font set inside {...} ends at its "}".
function codePageBytes(c) {
  const charset = {};
  for (const m of texts(c.src, after("fonttbl")).join("").matchAll(/\\f(\d+)(?!\d)[^;]*?\\fcharset(\d+)/gi)) charset[m[1]] = Number(m[2]);
  const s = withoutFallbacks(c.shown);
  let font = /\\deff(\d+)/.exec(c.src)?.[1] ?? "0";
  const stack = [];
  const seen = { ansi: false, fontCharset: false };
  for (const m of s.matchAll(/\\[\\{}]|\\f(\d+)(?![\d])|\\'([89a-f][0-9a-f])|[{}]/gi)) {
    if (m[0] === "{") stack.push(font);
    else if (m[0] === "}") font = stack.pop() ?? font;
    else if (m[1] !== undefined) font = m[1];
    else if (m[2] !== undefined) {
      const cs = charset[font] ?? 1;
      if (cs === 1 || cs === 0 || CHARSET_CP[cs] === cp(c)) seen.ansi = true;
      else if (cs !== 2) seen.fontCharset = true;
    }
  }
  return seen;
}

const cp = (c) => Number(/\\ansicpg(\d+)/.exec(c.src)?.[1] ?? 1252);
const uN = (c) => [...c.shown.matchAll(/\\u(-?\d+)/g)].map((m) => Number(m[1]));
const word = (s, w) => new RegExp(String.raw`\\${w}(?![a-z])`, "i").test(s);
const info = (c) => texts(c.src, after("info")).join("");
const htmltags = (c) => texts(c.src, after(String.raw`htmltag\d*`)).join("");
const forms = (c, kind) => texts(c.src, after("fldinst")).filter((f) => new RegExp(kind).test(f));

const ROWS = {
  1: (c) => hasText(c.shown),
  2: (c) => /\\[\\{}]/.test(c.shown),
  3: (c) => c.bytes.ansi && cp(c) === 1252,
  // The probe's code page was 1254; any \ansicpg other than 1252 is the same read.
  4: (c) => c.bytes.ansi && cp(c) !== 1252,
  5: (c) => c.bytes.fontCharset,
  6: (c) => uN(c).length > 0 && (!/\\uc\d/.test(c.src) || /\\uc1(?!\d)/.test(c.src)),
  7: (c) => uN(c).length > 0 && /\\uc[2-9](?!\d)/.test(c.src),
  // U+F000-F0FF, the Symbol-font private-use range, written signed or unsigned.
  8: (c) => uN(c).some((n) => { const u = n < 0 ? n + 65536 : n; return u >= 0xf000 && u <= 0xf0ff; }),
  9: (c) => groups(c.src, after("upr")).length > 0,
  10: (c) => /\\(bullet|endash|emdash|lquote|rquote|ldblquote|rdblquote)(?![a-z])/i.test(c.shown),
  11: (c) => /\\~/.test(c.shown),
  12: (c) => /\\_/.test(c.shown),
  13: (c) => /\\-/.test(c.shown),
  14: (c) => word(c.shown, "tab"),
  15: (c) => word(c.shown, "line"),
  // A backslash before a line end is \par too (TextEdit writes it).
  16: (c) => word(c.shown, "par") || /\\\r?\n/.test(c.shown),
  17: (c) => word(c.shown, "page"),
  18: (c) => /\\(chdate|chpgn)(?![a-z])/i.test(drop(c.shown, after("header|headerr|headerl|headerf|footer|footerr|footerl|footerf"))),
  // \headerr/\footerr are the all-pages kinds Word writes without \facingp.
  19: (c) => some(c.body, after("header|headerr")),
  20: (c) => some(c.body, after("footer|footerr")),
  21: (c) => some(c.body, after("headerf")),
  22: (c) => some(c.body, after("footerl")),
  23: (c) => some(c.body, after("footnote"), (g) => !word(g, "ftnalt") && hasText(g)),
  24: (c) => word(drop(c.shown, after("footnote")), "chftn"),
  25: (c) => some(c.body, after("footnote"), (g) => word(g, "ftnalt") && hasText(g)),
  26: (c) => some(c.body, after("annotation")),
  27: (c) => some(c.body, after("atnauthor")),
  28: (c) => word(c.body, "deleted"),
  29: (c) => word(c.body, "revised"),
  30: (c) => texts(c.src, after("revtbl")).some((g) => text(g).replace(/Unknown/g, "") !== ""),
  31: (c) => some(c.body, after("fldinst")),
  32: (c) => some(c.body, after("fldrslt")),
  33: (c) => forms(c, "HYPERLINK").length > 0,
  34: (c) => forms(c, "FORMTEXT").length > 0,
  35: (c) => some(c.body, after("ffname|ffdeftext|ffhelptext")),
  36: (c) => forms(c, "FORMDROPDOWN").some((f) => word(f, "ffl")),
  37: (c) => forms(c, "FORMDROPDOWN").some((f) => (f.match(/\\ffl(?![a-z])/g) ?? []).length > 1),
  38: (c) => some(c.body, after("xe"), (g) => hasText(g) && !word(g, "v")),
  39: (c) => some(c.body, after("xe"), (g) => word(g, "v")),
  40: (c) => some(c.body, after("tcn?")),
  41: (c) => groups(c.body, after("bkmkstart")).length > 0,
  42: (c) => groups(c.body, after("docvar")).length > 0,
  43: (c) => some(info(c), after("title")),
  44: (c) => some(info(c), after("subject")),
  45: (c) => some(info(c), after("author")),
  46: (c) => some(info(c), after("keywords")),
  47: (c) => some(info(c), after("doccomm")),
  48: (c) => some(info(c), after("comment")),
  49: (c) => word(c.body, "cell"),
  50: (c) => word(c.body, "nestcell"),
  51: (c) => some(c.body, after("nonesttables")),
  52: (c) => groups(c.body, after("pntext")).length > 0,
  53: (c) => groups(c.body, after("listtext")).length > 0,
  54: (c) => some(c.src, after("listname")),
  // \v on, not \v0; the stylesheet is outside `body`, so a hidden style does not count.
  55: (c) => /\\v(?![a-z0-9])/i.test(c.body),
  56: (c) => word(c.body, "webhidden"),
  57: (c) => some(c.body, after("shptxt")),
  58: (c) => groups(c.body, after("shprslt")).length > 0,
  59: (c) => some(c.body, after("dptxbxtext")),
  60: (c) => some(c.body, after("object"), (g) => word(g, "result")),
  61: (c) => groups(c.body, after("pict")).length > 0,
  62: (c) => /\{\\sn\s+wzDescription\}\s*\{\\sv\s+[^}\s]/i.test(c.body),
  63: (c) => some(c.body, after("mmath"), (g) => word(g, "mr")),
  64: (c) => word(c.body, "xmlopen"),
  67: (c) => word(c.src, "fromhtml") && /<style/i.test(htmltags(c)),
  68: (c) => word(c.src, "fromhtml") && /<title/i.test(htmltags(c)),
  69: (c) => word(c.src, "fromhtml") && hasText(c.shown),
  70: (c) => /\\htmlrtf(?![a-z])(?!0)/i.test(c.src),
  71: (c) => word(c.src, "fromhtml") && groups(c.body, after("pntext")).length > 0 && /<li/i.test(htmltags(c)),
};

export const UNDETECTABLE = {
  65: "\"unknown\" is relative to a reader; telling an unknown \\*\\destination from a known one needs the full RTF 1.9.1 keyword table",
  66: "same: an unknown non-starred control word is only unknown against the full keyword table",
};

export default async function detect(bytes) {
  try {
    const src = Buffer.from(bytes).toString("latin1");
    if (!src.startsWith("{\\rtf")) return [];
    const body = drop(src, after("fonttbl|colortbl|stylesheet|listtable|listoverridetable|info|revtbl"));
    const shown = drop(body, `${STARRED}|${after("pict")}`);
    const ctx = { src, body, shown };
    ctx.bytes = codePageBytes(ctx);
    return Object.keys(ROWS).filter((row) => ROWS[row](ctx));
  } catch {
    return [];
  }
}
