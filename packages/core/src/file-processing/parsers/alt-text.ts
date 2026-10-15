import { strFromU8 } from "fflate";
import { decodeCodepage } from "./msg";
import { rtfBody } from "./msg-rtf";
import { attr, decodeXml, escapeXml, fold, tagsOf } from "./office-charts";
import { ascii, concat, tokens } from "./rtf-comments";

/**
 * An image's alternative text, written where the image sits as `[Image: title;
 * description]` (Q31 O1), and a table's as `[Table: caption; description]`
 * above it. The author wrote it for a reader who cannot see the picture, which
 * is exactly the reader a bundle has. pandoc and mammoth read a docx picture's
 * `descr` (mammoth falling back to its `title`); the order here is the one
 * OpenDocument frames and HTML SVGs already get: title, then description.
 *
 * Empty when nothing is left after dropping blanks, repeats and a writer's
 * default name (`Picture 3`, `image1.png`). Folded onto one line, so a line
 * break in it cannot forge structure, and capped.
 */
export function altLabel(kind: string, parts: ReadonlyArray<string | undefined>): string {
  const kept: string[] = [];
  for (const part of parts) {
    const text = [...fold(part?.slice(0, MAX_ALT * 4) ?? "")].slice(0, MAX_ALT).join("");
    if (/[\p{L}\p{N}]/u.test(text) && !GENERIC.test(text) && !kept.includes(text)) kept.push(text);
  }
  return kept.length ? `[${kind}: ${kept.join("; ")}]` : "";
}

const MAX_ALT = 1000;
/** A writer's name for the object, not a description of it. */
const GENERIC = /^(\p{L}+ ?\d{1,4}|[^\s/\\]+\.(png|jpe?g|gif|bmp|tiff?|emf|wmf|svg|webp))$/iu;

/**
 * A Word part with each picture's alternative text after the run that holds
 * it, and each table's caption and description in a paragraph above it.
 * officeparser drops both. A chart's alternative text is left to its own
 * label (`withChartTables`), and `mc:Fallback`, the copy of a drawing for
 * older readers, is skipped so nothing is written twice. A picture in a hidden
 * run, a tracked deletion or the source of a tracked move is skipped as its
 * text is (`withoutHiddenRuns`).
 */
export function withWordAltText(xml: string): string {
  if (!/\s(?:descr|title|alt|o:title)="|<w:tblCaption|<w:tblDescription/.test(xml)) return xml;
  const out: string[] = [];
  const drawings: Array<{ run: number; parts: Array<string | undefined>; chart: boolean; hidden: boolean }> = [];
  const hidden = new Set<number>();
  const open: string[] = [];
  const pending = new Map<number, string[]>();
  let kept = 0;
  let runs = 0;
  let skipped = 0;
  for (const t of tagsOf(xml)) {
    // A run's own properties, not a paragraph mark's inside a text box.
    const own = open[open.length - 1] === "w:rPr" && open[open.length - 2] === "w:r";
    if (t.opens && !t.closes) open.push(t.name);
    else if (!t.opens) open.pop();
    if (t.name === "mc:Fallback" || t.name === "w:del" || t.name === "w:moveFrom") {
      if (t.opens && !t.closes) skipped++;
      else if (!t.opens) skipped--;
    } else if (t.name === "w:vanish" && t.opens && own && !/\sw:val="(?:0|false|off)"/.test(t.tag)) {
      hidden.add(runs);
    } else if (t.name === "w:r") {
      if (t.opens && !t.closes) runs++;
      else if (!t.opens) {
        const labels = pending.get(runs);
        if (labels) {
          out.push(xml.slice(kept, t.to), ...labels.map((label) => `<w:r><w:t>${escapeXml(label)}</w:t></w:r>`));
          kept = t.to;
          pending.delete(runs);
        }
        hidden.delete(runs);
        runs--;
      }
    } else if (skipped > 0) continue;
    else if ((t.name === "w:drawing" || t.name === "w:pict") && t.opens !== t.closes) {
      if (t.opens) drawings.push({ run: runs, parts: [], chart: false, hidden: hidden.has(runs) });
      else {
        const drawing = drawings.pop();
        const label = drawing && !drawing.chart && !drawing.hidden ? altLabel("Image", drawing.parts) : "";
        if (drawing && label) pending.set(drawing.run, [...(pending.get(drawing.run) ?? []), label]);
      }
    } else if (drawings.length && t.opens) {
      const drawing = drawings[drawings.length - 1];
      const read = (...names: string[]) => drawing.parts.push(...names.map((name) => decodeXml(attr(t.tag, name) ?? "")));
      // A drawing its author hid (ECMA-376 20.4.2.5, VML's visibility) is skipped.
      if (/^(1|true)$/.test(attr(t.tag, "hidden") ?? "") || /visibility:\s*hidden/i.test(attr(t.tag, "style") ?? "")) drawing.hidden = true;
      if (t.local === "docPr") read("title", "descr");
      else if (t.local === "graphicData") drawing.chart ||= /\/chart$/.test(attr(t.tag, "uri") ?? "");
      else if (t.name === "v:shape") read("alt");
      else if (t.name === "v:imagedata") read("o:title");
    } else if (t.name === "w:tbl" && t.opens && !t.closes) {
      // tblPr is a table's first child; a bounded look is enough.
      const properties = /^\s*<w:tblPr\b[^>]*>([\s\S]*?)<\/w:tblPr>/.exec(xml.slice(t.to, t.to + LOOKAHEAD))?.[1] ?? "";
      const value = (name: string) => /\sw:val="([^"]*)"/.exec(new RegExp(`<w:${name}\\b[^>]*>`).exec(properties)?.[0] ?? "")?.[1];
      const label = altLabel("Table", [value("tblCaption"), value("tblDescription")].map((part) => part && decodeXml(part)));
      if (label) {
        out.push(xml.slice(kept, t.from), `<w:p><w:r><w:t xml:space="preserve">${escapeXml(label)}</w:t></w:r></w:p>`);
        kept = t.from;
      }
    }
  }
  return out.length ? out.join("") + xml.slice(kept) : xml;
}

const LOOKAHEAD = 8192;

/**
 * An OpenDocument content part with each frame's `svg:desc` joined to its
 * `svg:title`, which is the one officeparser writes as `[Image: ...]`, and a
 * text document's table title and description in a paragraph above the table.
 */
export function withOdfAltText(xml: string): string {
  if (!xml.includes("<svg:desc") && !xml.includes("<table:title") && !xml.includes("<table:desc")) return xml;
  const edits: Array<{ from: number; to: number; text: string }> = [];
  const frames: Array<{ depth: number; title?: Child; desc?: Child }> = [];
  const text = xml.includes("<office:text");
  let depth = 0;
  let child: { name: "title" | "desc"; from: number; inner: number } | undefined;
  for (const t of tagsOf(xml)) {
    const frame = frames[frames.length - 1];
    if (t.opens && !t.closes) depth++;
    if (t.name === "draw:frame" && t.opens && !t.closes) frames.push({ depth });
    else if ((t.name === "svg:title" || t.name === "svg:desc") && frame && depth === frame.depth + 1) {
      if (t.opens && !t.closes) child = { name: t.name === "svg:title" ? "title" : "desc", from: t.from, inner: t.to };
      else if (!t.opens && child) {
        frame[child.name] = { from: child.from, to: t.to, inner: child.inner, innerTo: t.from, text: decodeXml(xml.slice(child.inner, t.from)) };
        child = undefined;
      }
    } else if (t.name === "draw:frame" && !t.opens && frame) {
      frames.pop();
      const { title, desc } = frame;
      const label = desc && altLabel("Image", [title?.text, desc.text]);
      if (label) {
        const joined = escapeXml(label.slice("[Image: ".length, -1));
        if (title) edits.push({ from: title.inner, to: title.innerTo, text: joined });
        edits.push({ from: desc.from, to: desc.to, text: title ? "" : `<svg:title>${joined}</svg:title>` });
      }
    } else if (text && t.name === "table:table" && t.opens && !t.closes) {
      const head = /^\s*(?:<table:title>([^<]*)<\/table:title>)?\s*(?:<table:desc>([^<]*)<\/table:desc>)?/.exec(xml.slice(t.to, t.to + LOOKAHEAD));
      const label = altLabel("Table", [head?.[1], head?.[2]].map((part) => part && decodeXml(part)));
      if (label) edits.push({ from: t.from, to: t.from, text: `<text:p>${escapeXml(label)}</text:p>` });
    }
    if (!t.opens) depth--;
  }
  if (!edits.length) return xml;
  edits.sort((a, b) => a.from - b.from);
  let out = "";
  let kept = 0;
  for (const edit of edits) {
    out += xml.slice(kept, edit.from) + edit.text;
    kept = edit.to;
  }
  return out + xml.slice(kept);
}

/**
 * An RTF document with each picture's and shape's `wzDescription` (RTF 1.9.1,
 * "Shape properties") written after its group, where officeparser and anydoc
 * both skip the group whole. A `\nonshppict` group is the copy for readers
 * without shapes and is passed over; a picture inside a shape is the shape's.
 */
export function withRtfAltText(rtf: Uint8Array): Uint8Array {
  if (strFromU8(rtf.subarray(0, 5), true) !== "{\\rtf") return rtf;
  const whole = strFromU8(rtf, true);
  if (!whole.includes("wzDescription")) return rtf;
  const codepage = /\\ansicpg(\d+)/.exec(whole.slice(0, 4096))?.[1] ?? "1252";
  const parts: Uint8Array[] = [];
  let kept = 0;
  let depth = 0;
  let first = false;
  let star = false;
  let frame: { depth: number; from: number; skip: boolean } | undefined;
  for (const t of tokens(rtf)) {
    if (t.kind === "open") {
      depth++;
      first = true;
      star = false;
      continue;
    }
    if (t.kind === "close") {
      if (frame && depth === frame.depth) {
        const label = frame.skip ? "" : altLabel("Image", [description(rtf.subarray(frame.from, t.from), codepage)]);
        if (label) {
          parts.push(rtf.subarray(kept, t.to), ascii(`{${rtfEscape(label)}}`));
          kept = t.to;
        }
        frame = undefined;
      }
      depth--;
      first = false;
      continue;
    }
    if (t.kind === "star") star = true;
    else if (t.kind === "word" && (first || star) && !frame && /^(shppict|shp|pict|nonshppict)$/.test(t.word)) {
      frame = { depth, from: t.to, skip: t.word === "nonshppict" };
    }
    if (t.kind !== "star") star = false;
    first = false;
  }
  return parts.length ? concat([...parts, rtf.subarray(kept)]) : rtf;
}

/** The `{\sv ...}` after `{\sn wzDescription}` in a shape's property list, decoded. */
function description(group: Uint8Array, codepage: string): string | undefined {
  const text = strFromU8(group, true);
  const at = text.indexOf("{\\sn wzDescription}");
  const value = at < 0 ? undefined : /^\s*\{\\sv ?((?:[^{}\\]|\\.)*)\}/s.exec(text.slice(at + "{\\sn wzDescription}".length, at + 64 + MAX_ALT * 8));
  return value ? rtfBody(ascii(`{\\rtf1\\ansicpg${codepage} ${value[1]}}`), decodeCodepage).text : undefined;
}

/** Text as RTF: the three specials escaped, and anything past ASCII as `\uN?`. */
const rtfEscape = (text: string) =>
  [...text]
    .map((char) => {
      const code = char.charCodeAt(0);
      if (char.length > 1) return char.split("").map((unit) => `\\u${unit.charCodeAt(0) - 0x10000}?`).join("");
      if (char === "\\" || char === "{" || char === "}") return `\\${char}`;
      return code < 0x80 ? char : `\\u${code > 0x7fff ? code - 0x10000 : code}?`;
    })
    .join("");

interface Child {
  from: number;
  to: number;
  inner: number;
  innerTo: number;
  text: string;
}
