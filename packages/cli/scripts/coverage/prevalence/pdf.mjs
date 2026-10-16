// Which rows of results/pdf.md (the PDF coverage map) occur in a real .pdf.
// Used to weight the map's rows by how often a construct shows up in real files.
// Object streams and content streams are compressed, so a byte regex misses most
// of a real PDF: this reads the parsed document with the web app's own pdf.js
// (node build, found as scripts/measure-extraction-quality.ts finds it), and
// falls back to inflated stream text only for what pdf.js does not hand back
// (marked-content ActualText, NeedAppearances, a Popup's own /Contents). Per-page
// checks read the first MAX_PAGES pages; a file stops at TIMEOUT_MS and reports
// what was found by then. Run through ./run.mjs.
import path from "node:path";
import zlib from "node:zlib";
import { findPackageJSON } from "node:module";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../..");
const manifest = findPackageJSON("pdfjs-dist", pathToFileURL(path.join(REPO_ROOT, "apps", "web", "package.json")));
const pdfjs = await import(pathToFileURL(path.join(path.dirname(manifest), "legacy", "build", "pdf.mjs")).href);
const OP = pdfjs.OPS;

const MAX_PAGES = 30;
const TIMEOUT_MS = 60_000;
/** Compressed stream bytes inflated per file for the text fallback. */
const INFLATE_BUDGET = 32 << 20;

// Rows that cannot be told from the file, with the reason.
// Empty: every row names something in the file; the layout rows (4-7, 11) and a few others use proxies, marked below.
export const UNDETECTABLE = {};

// Rows marked "proxy" detect a stand-in for the construct, not the construct itself.
const ROWS = {
  1: (d) => d.any("plainShow"), // proxy: a text-show op with no spacing numbers (Tj, or TJ without kerning)
  2: (d) => d.any("tjGap"), // TJ number <= -200 (a word-sized gap)
  3: (d) => d.any("tjKern"), // TJ number with |n| < 100
  4: (d) => d.any("tdGap"), // proxy: Td to the right on the same baseline between two shows, no space before it
  5: (d) => d.any("columnsRightFirst"), // proxy: two-column page whose stream jumps from the right column back up to the left
  6: (d) => d.any("columnsLeftFirst"), // proxy: the same, jumping from the left column up to the right (the usual order)
  7: (d) => d.any("table"), // proxy: 3+ lines of 3+ gap-separated runs that line up
  8: (d) => d.any((p) => p.tr3 && p.visibleText),
  9: (d) => d.any((p) => p.tr3 && p.image && !p.visibleText),
  10: (d) => d.any("clipText"), // Tr 4-7
  11: (d) => d.any("whiteText"), // proxy: white text before anything was filled or painted on the page
  12: (d) => d.any("ocOffText"),
  13: (d) => d.any("ocOnText"),
  14: (d) => d.any("formText"),
  15: (d) => d.any("remapped"), // proxy: simple font maps a printable ASCII code to another character (ToUnicode or /Differences)
  16: (d) => d.any("ligature"), // proxy: a simple-font glyph that reads as a ligature
  17: (d) => /\/Span\s*<<[^>]*\/ActualText/.test(d.inflated()),
  18: (d) => d.any("type0"),
  19: (d) => d.any("softHyphens"),
  20: (d) => d.any((p) => p.hyphenEnds > p.softHyphens), // lines ending letter-hyphen, more than the soft hyphens drawn
  21: (d) => repeated(d.pages.map((p) => p.furniture)), // header or footer line: the reader treats both alike
  22: (d) => d.pages.some((p, i) => i > 0 && p.folios.some((n) => d.pages[i - 1].folios.includes(n - 1))),
  23: (d) => d.any("artifactBand"), // proxy: Artifact-marked text in the top or bottom band (pdf.js drops /Pagination)
  24: (d) => d.any("figureAlt"),
  25: (d) => d.any("diagonal"), // text at an angle that is not a multiple of 90 deg
  26: (d) => d.any("rotated"),
  27: (d) => d.any("vertical"),
  28: (d) => d.labels?.some((l, i) => l !== String(i + 1)),
  29: (d) => d.outline?.length > 0,
  30: (d) => has(d.info.Title),
  31: (d) => has(d.info.Author),
  32: (d) => has(d.info.Subject),
  33: (d) => has(d.info.Keywords),
  34: (d) => has(d.xmp?.get("dc:title")),
  35: (d) => d.ann((a) => a.subtype === "Text" && !hidden(a) && has(a.contentsObj?.str)),
  36: (d) => /<<(?:(?!>>)[^])*\/Subtype\s*\/Popup(?:(?!>>)[^])*>>/.exec(d.inflated())?.[0].includes("/Contents"),
  37: (d) => d.ann((a) => a.subtype === "FreeText" && a.hasAppearance),
  38: (d) => d.ann((a) => a.subtype === "Highlight" && has(a.contentsObj?.str)),
  39: (d) => d.ann((a) => a.subtype === "Link" && has(a.url)),
  40: (d) => d.ann((a) => a.subtype === "FileAttachment" && has(a.contentsObj?.str)),
  41: (d) => d.ann((a) => a.subtype === "FileAttachment" && (has(a.file?.description) || has(a.file?.filename))),
  42: (d) => d.any("attachBody"),
  43: (d) => d.ann((a) => a.subtype !== "Widget" && hidden(a) && has(a.contentsObj?.str)),
  44: (d) => d.ann((a) => a.fieldType === "Tx" && has(a.fieldValue)),
  45: (d) => d.ann((a) => a.subtype === "Widget" && has(a.alternativeText)),
  46: (d) => d.ann((a) => a.checkBox && has(a.fieldValue) && a.fieldValue !== "Off"),
  47: (d) => d.ann((a) => a.fieldType === "Ch" && a.combo && [a.fieldValue].flat().some(has)),
  // proxy: pdf.js draws a missing appearance itself, so "no /AP" is read as NeedAppearances true
  48: (d) => d.ann((a) => a.fieldType === "Tx" && has(a.fieldValue)) && /\/NeedAppearances\s*true/.test(d.inflated()),
  49: (d) => d.attachments?.size > 0,
  50: (d) => d.embedBody,
  51: (d) => d.js != null && Object.keys(d.js).length > 0,
  // opened with no password, so the user password is empty; the encryption dictionary is never in an object stream
  52: (d) => d.info.EncryptFilterName === "Standard" && !/\/CFM\s*\/AESV/.test(d.raw()),
};

const has = (s) => typeof s === "string" && s.trim() !== "";
const hidden = (a) => (a.annotationFlags & 2) !== 0;
// The same top- or bottom-band line with a letter in it (digits ignored) on two or more pages and at least half.
function repeated(tops) {
  const count = new Map();
  for (const set of tops) for (const s of set) count.set(s, (count.get(s) ?? 0) + 1);
  return [...count.values()].some((n) => n >= 2 && n >= tops.length / 2);
}

export default async function detect(bytes) {
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, verbosity: 0, fontExtraProperties: true });
  const d = facts(bytes);
  let timer;
  try {
    const doc = await task.promise;
    await Promise.race([read(doc, d).catch(() => {}), new Promise((resolve) => (timer = setTimeout(resolve, TIMEOUT_MS)))]);
  } catch {
    if (!d.opened) return [];
  } finally {
    clearTimeout(timer);
    await task.destroy().catch(() => {});
  }
  return Object.entries(ROWS)
    .filter(([, test]) => {
      try {
        return !!test(d);
      } catch {
        return false;
      }
    })
    .map(([row]) => Number(row));
}

function facts(bytes) {
  let raw, inflated;
  const d = {
    opened: false,
    info: {},
    pages: [],
    annotations: [],
    any: (flag) => d.pages.some(typeof flag === "function" ? flag : (p) => p[flag]),
    ann: (test) => d.annotations.some(test),
    raw: () => (raw ??= Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length).toString("latin1")),
    inflated: () => (inflated ??= inflateAll(d.raw())),
  };
  return d;
}

async function read(doc, d) {
  d.opened = true;
  const meta = await doc.getMetadata().catch(() => ({}));
  d.info = meta.info ?? {};
  d.xmp = meta.metadata;
  d.labels = await doc.getPageLabels().catch(() => null);
  d.outline = await doc.getOutline().catch(() => null);
  d.js = await doc.getJSActions().catch(() => null);
  d.attachments = await doc.getAttachments().catch(() => null);
  for (const name of [...(d.attachments?.keys() ?? [])].slice(0, 3))
    if ((await doc.getAttachmentContent(name).catch(() => null))?.length) d.embedBody = true;
  const occ = await doc.getOptionalContentConfig().catch(() => null);
  for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
    const page = await doc.getPage(n);
    const p = { furniture: new Set(), folios: [], softHyphens: 0, hyphenEnds: 0 };
    d.pages.push(p);
    p.rotated = page.rotate % 360 !== 0;
    for (const a of await page.getAnnotations().catch(() => [])) {
      d.annotations.push(a);
      if (a.subtype === "FileAttachment" && a.fileId && (await doc.getAttachmentContent(a.fileId).catch(() => null))?.length)
        p.attachBody = true;
    }
    const ops = await page.getOperatorList({ annotationMode: pdfjs.AnnotationMode.DISABLE });
    scanOps(ops, page, occ, p);
    scanText(await page.getTextContent({ includeMarkedContent: true }), page, p);
    p.figureAlt = hasFigureAlt(await page.getStructTree().catch(() => null));
    page.cleanup();
  }
}

function scanOps({ fnArray, argsArray }, page, occ, p) {
  let tr = 0, fill = "#000000", textClip = false, painted = false, formDepth = 0, font = {}, lastShowEnd = "";
  const stack = [];
  const oc = []; // visibility of each open marked-content section, null when not OC
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i], args = argsArray[i];
    switch (fn) {
      case OP.setTextRenderingMode: tr = args[0]; break;
      case OP.setFillRGBColor: fill = args[0]; break;
      case OP.save: stack.push([tr, fill, textClip]); break;
      case OP.restore: [tr, fill, textClip] = stack.pop() ?? [tr, fill, textClip]; break;
      case OP.paintFormXObjectBegin: formDepth++; break;
      case OP.paintFormXObjectEnd: formDepth--; break;
      case OP.beginMarkedContentProps:
        oc.push(args[0] === "OC" && args[1] && occ ? occ.isVisible(args[1]) : null);
        break;
      case OP.beginMarkedContent: oc.push(null); break;
      case OP.endMarkedContent: oc.pop(); break;
      case OP.setFont:
        try { font = page.commonObjs.get(args[0]) ?? {}; } catch { font = {}; }
        break;
      case OP.constructPath:
      case OP.fill: case OP.eoFill: case OP.fillStroke: case OP.eoFillStroke:
      case OP.closeFillStroke: case OP.closeEOFillStroke: case OP.shadingFill:
        if (fn !== OP.constructPath || [OP.fill, OP.eoFill, OP.fillStroke, OP.eoFillStroke, OP.closeFillStroke, OP.closeEOFillStroke].includes(args[0]))
          if (fill !== "#ffffff" && !textClip) painted = true; // a fill clipped to glyphs paints no background
        break;
      case OP.moveText:
        if (args[1] === 0 && args[0] > 0 && fnArray[i - 1] === OP.showText && fnArray[i + 1] === OP.showText && lastShowEnd !== " ")
          p.tdGap = true;
        break;
      case OP.showText: {
        const glyphs = args[0].filter((g) => g && typeof g === "object");
        const nums = args[0].filter((g) => typeof g === "number");
        if (!glyphs.some((g) => g.unicode?.trim())) break;
        if (!nums.length) p.plainShow = true;
        if (nums.some((n) => n <= -200)) p.tjGap = true;
        if (nums.some((n) => n !== 0 && Math.abs(n) < 100)) p.tjKern = true;
        if (tr === 3) p.tr3 = true;
        else p.visibleText = true;
        if (tr >= 4) p.clipText = textClip = true;
        if (fill === "#ffffff" && (tr === 0 || tr === 2) && !painted) p.whiteText = true;
        const v = oc.findLast((x) => x !== null);
        if (v === false) p.ocOffText = true;
        if (v === true) p.ocOnText = true;
        if (formDepth > 0) p.formText = true;
        if (font.composite) p.type0 = true;
        if (!font.composite) {
          for (const g of glyphs) {
            const c = g.originalCharCode, u = g.unicode ?? "";
            if (!font.isSymbolicFont && c > 0x20 && c < 0x7f && u.length === 1 && u > " " && u !== String.fromCharCode(c)) p.remapped = true;
            if (/^[\ufb00-\ufb06]$|^(ff|fi|fl|ffi|ffl)$/.test(u)) p.ligature = true;
          }
        }
        lastShowEnd = glyphs.at(-1).unicode;
        // a soft hyphen is only drawn where a line breaks; pdf.js reads it as "-"
        if (!font.composite) p.softHyphens += glyphs.filter((g) => g.originalCharCode === 173 && /^[-\u00ad]$/.test(g.unicode)).length;
        break;
      }
      default:
        if (/^paint.*Image/.test(OPS_NAME[fn])) p.image = painted = true;
    }
  }
}
const OPS_NAME = Object.fromEntries(Object.entries(OP).map(([k, v]) => [v, k]));

function scanText({ items, styles }, page, p) {
  const [x0, y0, x1, y1] = page.view;
  const w = x1 - x0, h = y1 - y0;
  const tags = [];
  const runs = [];
  let line = { y: NaN, text: "" }; // the line being read, in stream order, for hyphen line ends
  for (const it of items) {
    if (it.type === "beginMarkedContent" || it.type === "beginMarkedContentProps") { tags.push(it.tag); continue; }
    if (it.type === "endMarkedContent") { tags.pop(); continue; }
    if (!it.str?.trim()) continue;
    const [a, b, , , x, y] = it.transform;
    const deg = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
    const off = Math.min(deg % 90, 90 - (deg % 90));
    if (off > 2) p.diagonal = true;
    else if (!p.rotated && (Math.abs(deg - 90) <= 2 || Math.abs(deg - 270) <= 2 || styles[it.fontName]?.vertical)) p.vertical = true;
    if (off > 2 || Math.abs(b) > 0.01) continue;
    if (Math.abs(y - line.y) > 0.5 * Math.abs(it.transform[3])) {
      if (/\p{L}-$/u.test(line.text.trimEnd())) p.hyphenEnds++;
      line = { y, text: "" };
    } else if (Number.isNaN(line.y)) line.y = y;
    line.text += it.str;
    const band = y > y1 - 0.12 * h ? "top" : y < y0 + 0.12 * h ? "bottom" : null;
    if (band && tags.includes("Artifact")) p.artifactBand = true;
    if (band && /\p{L}/u.test(it.str)) p.furniture.add(it.str.trim().replace(/\d+/g, "#"));
    if (band && it.str.trim().length <= 40) for (const m of it.str.matchAll(/\d+/g)) p.folios.push(Number(m[0]));
    runs.push({ x, r: x + it.width, y: Math.round(y), size: Math.abs(it.transform[3]) || 10, i: runs.length });
  }
  const lines = new Map();
  for (const r of runs) lines.set(r.y, [...(lines.get(r.y) ?? []), r]);
  const rowsOf = [...lines.values()].map((rs) => cells(rs.sort((m, n) => m.x - n.x)));
  // table: 3+ lines of 3+ cells where at least two cells line up (start, end or centre) with another such line
  const wide = rowsOf.filter((c) => c.length >= 3);
  const near = (a, b) => Math.abs(a.x - b.x) < 3 || Math.abs(a.r - b.r) < 3 || Math.abs(a.x + a.r - b.x - b.r) < 6;
  p.table = wide.filter((c) => wide.some((o) => o !== c && c.filter((cell) => o.some((oc) => near(cell, oc))).length >= 2)).length >= 3;
  // columns: a gutter in the middle 40% with 3+ lines of 15% of the page width on each side that do not cross it;
  // the stream jumping back up from the right column to the left marks right-first, the reverse left-first
  // (the gutter with the most such lines on its thinner side, then in all)
  let best = { score: [3, 0] };
  for (let g = x0 + 0.3 * w; g <= x0 + 0.7 * w; g += 2) {
    const side = new Map(); // cell -> "L" | "R", for long line halves that do not cross g
    const count = { L: 0, R: 0 };
    for (const cs of rowsOf) {
      if (cs.some((c) => c.x < g && c.r > g)) continue;
      for (const [s, part] of [["L", cs.filter((c) => c.r <= g)], ["R", cs.filter((c) => c.x >= g)]]) {
        if (!part.length || part.at(-1).r - part[0].x < 0.15 * w) continue;
        count[s]++;
        for (const c of part) side.set(c, s);
      }
    }
    const score = [Math.min(count.L, count.R), count.L + count.R];
    if (score[0] > best.score[0] || (score[0] === best.score[0] && score[1] > best.score[1])) best = { score, side };
  }
  if (best.side) {
    const seq = [...best.side.keys()].sort((m, n) => m.i - n.i);
    for (let i = 1; i < seq.length; i++) {
      const a = seq[i - 1], b = seq[i], sa = best.side.get(a);
      if (sa !== best.side.get(b) && b.y > a.y + a.size) p[sa === "R" ? "columnsRightFirst" : "columnsLeftFirst"] = true;
    }
  }
}
// Runs of one line, left to right, merged into cells wherever the gap is under one font size.
function cells(rs) {
  const out = [];
  for (const r of rs) {
    const last = out.at(-1);
    if (last && r.x - last.r < r.size) Object.assign(last, { r: Math.max(last.r, r.r), i: Math.min(last.i, r.i) });
    else out.push({ ...r });
  }
  return out;
}

function hasFigureAlt(node) {
  if (!node) return false;
  if (node.role === "Figure" && has(node.alt)) return true;
  return (node.children ?? []).some(hasFigureAlt);
}

// Raw text plus every non-image Flate stream inflated, for the few checks pdf.js cannot answer.
function inflateAll(raw) {
  const parts = [raw];
  let budget = INFLATE_BUDGET;
  for (const m of raw.matchAll(/stream\r?\n/g)) {
    const dict = raw.slice(Math.max(0, m.index - 600), m.index);
    const head = dict.slice(dict.lastIndexOf("obj") + 1);
    if (!/\/FlateDecode/.test(head) || /\/Image\b|\/DCTDecode|\/JPXDecode/.test(head)) continue;
    const start = m.index + m[0].length, end = raw.indexOf("endstream", start);
    if (end < 0 || (budget -= end - start) < 0) break;
    try {
      parts.push(zlib.inflateSync(Buffer.from(raw.slice(start, end), "latin1"), { finishFlush: zlib.constants.Z_SYNC_FLUSH }).toString("latin1"));
    } catch {}
  }
  return parts.join("\n");
}
