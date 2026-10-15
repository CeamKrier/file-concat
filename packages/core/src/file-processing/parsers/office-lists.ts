import { strFromU8 } from "fflate";
import { attr, decodeXml, tagsOf, unpack } from "./office-charts";

/**
 * The label Word prints before each list item (C8). officeparser numbers every
 * ordered item "1.", "2." by its own count, whatever its level asks for ("a)",
 * "iv.", "Article 3.", "2.1"), and never restarts a deeper level when a higher
 * one comes back.
 *
 * This reads `word/numbering.xml` as Tika's XWPFListManager does: a level's
 * `lvlText` with each `%n` replaced by level n's counter in level n's own
 * format, counters kept per abstract list (two lists sharing one continue each
 * other, as in Word), and a deeper level restarted after a higher one unless
 * its `lvlRestart` says otherwise. On top of Tika, a list's `startOverride`
 * restarts its level where the list first appears, as pandoc reads it, and a
 * `numStyleLink` is followed to the abstract list that holds the levels.
 */

/**
 * A label template is written before every item of its level, so a crafted
 * template megabytes long would multiply with the item count. Word's own
 * dialog stops far short of this.
 */
const MAX_LABEL = 64;

export interface ListLevel {
  format: string;
  /** The label, each `%n` standing for level n's counter. */
  text: string;
  start: number;
  /** One-based: restart after a level up to this one is used; 0 never. Absent: after any higher level. */
  restart?: number;
  legal: boolean;
}

export interface ListDefinition {
  levels: Map<number, ListLevel>;
  /** `numStyleLink`: the levels live in the abstract list whose `styleLink` names this style. */
  link?: string;
  style?: string;
}

/** One use of a list definition: Word's `w:num`, a .doc's LFO. */
export interface ListInstance {
  abstract: string;
  starts: Map<number, number>;
  levels: Map<number, ListLevel>;
}

/**
 * A labeller to call once per list item in document order, or nothing when
 * the file has no numbering part. It answers nothing for a list the part does
 * not define, which is then left as officeparser renders it.
 */
export function wordListLabels(bytes: Uint8Array): ((numId: string, level: number) => string | undefined) | undefined {
  const part = unpack(bytes, (name) => name === "word/numbering.xml")?.["word/numbering.xml"];
  if (!part) return undefined;
  const { abstracts, instances } = readNumbering(strFromU8(part));
  return listLabels(abstracts, instances);
}

/**
 * The counting both Word readers share, the .docx one over numbering.xml and
 * the .doc one over its list tables (MS-DOC 2.9.150 LVL is the same model).
 */
export function listLabels(
  abstracts: Map<string, ListDefinition>,
  instances: Map<string, ListInstance>,
): (instance: string, level: number) => string | undefined {
  const byStyle = new Map([...abstracts].flatMap(([id, a]) => (a.style ? [[a.style, id] as const] : [])));
  const resolve = (id: string) => {
    const link = abstracts.get(id)?.link;
    return (link && byStyle.get(link)) || id;
  };
  const counters = new Map<string, (number | undefined)[]>();
  const restarted = new Set<string>();
  return (numId, ilvl) => {
    const instance = instances.get(numId);
    if (!instance) return undefined;
    const id = resolve(instance.abstract);
    const level = (n: number) => instance.levels.get(n) ?? abstracts.get(id)?.levels.get(n);
    const own = level(ilvl);
    if (!own) return undefined;
    const counts = counters.get(id) ?? [];
    counters.set(id, counts);
    const override = instance.starts.get(ilvl);
    if (override !== undefined && !restarted.has(`${numId}:${ilvl}`)) {
      restarted.add(`${numId}:${ilvl}`);
      counts[ilvl] = override - 1;
    }
    counts[ilvl] = (counts[ilvl] ?? own.start - 1) + 1;
    for (let deeper = ilvl + 1; deeper < 9; deeper++) {
      const restart = level(deeper)?.restart;
      if (restart === undefined || (restart > 0 && ilvl < restart)) counts[deeper] = undefined;
    }
    if (own.format === "bullet") return "-";
    return own.text.slice(0, MAX_LABEL).replace(/%([1-9])/g, (_, digit: string) => {
      const n = Number(digit) - 1;
      const at = level(n);
      return numberText(counts[n] ?? at?.start ?? 0, own.legal ? "decimal" : (at?.format ?? "decimal"));
    });
  };
}

function readNumbering(xml: string): { abstracts: Map<string, ListDefinition>; instances: Map<string, ListInstance> } {
  const abstracts = new Map<string, ListDefinition>();
  const instances = new Map<string, ListInstance>();
  let abstract: ListDefinition | undefined;
  let instance: ListInstance | undefined;
  let overriding: number | undefined;
  let level: ListLevel | undefined;
  const value = (tag: string) => decodeXml(attr(tag, "w:val") ?? "");
  const int = (tag: string) => parseInt(attr(tag, "w:val") ?? "", 10);
  for (const { name, tag, opens, closes } of tagsOf(xml)) {
    if (name === "w:abstractNum" && opens) {
      abstract = { levels: new Map() };
      abstracts.set(attr(tag, "w:abstractNumId") ?? "", abstract);
    } else if (name === "w:num" && opens) {
      instance = { abstract: "", starts: new Map(), levels: new Map() };
      instances.set(attr(tag, "w:numId") ?? "", instance);
    } else if (name === "w:lvlOverride" && opens && instance) {
      overriding = parseInt(attr(tag, "w:ilvl") ?? "", 10) || 0;
    } else if (name === "w:lvl" && opens) {
      // `start` defaults to 0 when absent (17.9.25).
      level = { format: "decimal", text: "", start: 0, legal: false };
      const at = parseInt(attr(tag, "w:ilvl") ?? "", 10) || overriding || 0;
      if (instance && overriding !== undefined) instance.levels.set(at, level);
      else abstract?.levels.set(at, level);
    } else if (level && opens) {
      // The last numFmt wins: Word 2010 puts a custom format in an
      // mc:Choice and the plain one in the mc:Fallback after it.
      if (name === "w:numFmt") level.format = value(tag);
      else if (name === "w:lvlText") level.text = value(tag);
      else if (name === "w:start" && Number.isFinite(int(tag))) level.start = int(tag);
      else if (name === "w:lvlRestart" && Number.isFinite(int(tag))) level.restart = int(tag);
      else if (name === "w:isLgl") level.legal = !["0", "false", "off"].includes(attr(tag, "w:val") ?? "1");
    } else if (opens && abstract && !instance) {
      if (name === "w:numStyleLink") abstract.link = value(tag);
      else if (name === "w:styleLink") abstract.style = value(tag);
    } else if (opens && instance) {
      if (name === "w:abstractNumId") instance.abstract = attr(tag, "w:val") ?? "";
      else if (name === "w:startOverride" && overriding !== undefined && Number.isFinite(int(tag))) instance.starts.set(overriding, int(tag));
    }
    if (!closes) continue;
    if (name === "w:lvl") level = undefined;
    else if (name === "w:lvlOverride") overriding = undefined;
    else if (name === "w:abstractNum") abstract = undefined;
    else if (name === "w:num") instance = undefined;
  }
  return { abstracts, instances };
}

const ROMAN: [number, string][] = [
  [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"],
  [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
];

/**
 * A counter in one of Word's number formats. Any format not named here reads
 * as decimal, as Tika falls back. Roman and letter numbers are capped, so a
 * crafted start value cannot spell a multi-megabyte label.
 */
export function numberText(n: number, format: string): string {
  const upper = format.startsWith("upper");
  if (format === "none") return "";
  if (format === "decimalZero") return n >= 0 && n < 10 ? `0${n}` : String(n);
  if ((format === "lowerLetter" || format === "upperLetter") && n >= 1 && n <= 780) {
    // Word's letters go a..z, then aa..zz, then aaa: the letter repeats.
    const letters = String.fromCharCode(97 + ((n - 1) % 26)).repeat(Math.ceil(n / 26));
    return upper ? letters.toUpperCase() : letters;
  }
  if ((format === "lowerRoman" || format === "upperRoman") && n >= 1 && n < 4000) {
    let left = n;
    let out = "";
    for (const [value, numeral] of ROMAN) {
      for (; left >= value; left -= value) out += numeral;
    }
    return upper ? out.toUpperCase() : out;
  }
  if (format === "ordinal") {
    const teen = n % 100 >= 11 && n % 100 <= 13;
    return `${n}${teen ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
  }
  return String(n);
}

interface OdfLevel {
  bullet: boolean;
  format: string;
  prefix: string;
  suffix: string;
  display: number;
  start: number;
}

/** `style:num-format` to the Word format names above; anything else reads as decimal. */
const ODF_FORMAT: Record<string, string> = { "1": "decimal", a: "lowerLetter", A: "upperLetter", i: "lowerRoman", I: "upperRoman", "": "none" };

/** Every `text:list-style` of a part, by name, each level by its one-based number. */
function odfListStyles(xml: string, into: Map<string, Map<number, OdfLevel>>): void {
  let levels: Map<number, OdfLevel> | undefined;
  for (const { name, tag, opens, closes } of tagsOf(xml)) {
    if (name === "text:list-style" && opens) {
      levels = new Map();
      const style = attr(tag, "style:name");
      if (style && !into.has(style)) into.set(style, levels);
    } else if (levels && opens && /^text:list-level-style-(?:number|bullet|image)$/.test(name)) {
      const number = name === "text:list-level-style-number";
      levels.set(parseInt(attr(tag, "text:level") ?? "1", 10) || 1, {
        bullet: !number,
        format: ODF_FORMAT[attr(tag, "style:num-format") ?? ""] ?? "decimal",
        prefix: decodeXml(attr(tag, "style:num-prefix") ?? "").slice(0, MAX_LABEL),
        suffix: decodeXml(attr(tag, "style:num-suffix") ?? "").slice(0, MAX_LABEL),
        display: parseInt(attr(tag, "text:display-levels") ?? "1", 10) || 1,
        start: parseInt(attr(tag, "text:start-value") ?? "1", 10) || 1,
      });
    }
    if (closes && name === "text:list-style") levels = undefined;
  }
}

/**
 * A list style defines ten levels (19.799). Indents and multi-level labels stop
 * there, so a crafted list nested thousands deep cannot grow the text with the
 * square of its depth.
 */
const MAX_ODF_LEVELS = 10;

const escapeText = (text: string) => text.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * An OpenDocument text's `content.xml` with each list item's label written at
 * the start of its first paragraph, indented four spaces a level (C8), and the
 * list styles taken off so officeparser reads the items as the paragraphs they
 * now are. officeparser numbered an item only when it found the list's style,
 * by its own count and without the style's format, prefix or suffix; without
 * the style the number was gone.
 *
 * The label is the `text:number` the writing application cached for the item
 * when it is there ("the text of a formatted number which is present when a
 * list style is applied", 6.1.10), which none of Tika, docling, pandoc and
 * LibreOffice read. Otherwise it is counted from the list style as LibreOffice
 * does: prefix, the counters of `display-levels` levels joined by ".", suffix.
 * A bullet, or an item whose style is unknown, reads "-".
 */
export function withOdfListLabels(content: string, styles = ""): string {
  if (!content.includes("<text:list")) return content;
  const listStyles = new Map<string, Map<number, OdfLevel>>();
  odfListStyles(content, listStyles);
  odfListStyles(styles, listStyles);
  const byId = new Map<string, (number | undefined)[]>();
  let previous: (number | undefined)[] = [];
  const lists: { style?: string; counts: (number | undefined)[] }[] = [];
  // The item awaiting its first paragraph, and the cached number read for it.
  let pending: { level: number; label: string } | undefined;
  let cached: { from: number } | undefined;
  const edits: { from: number; to: number; text: string }[] = [];
  const label = (level: number, counts: (number | undefined)[], style?: string) => {
    const levels = style ? listStyles.get(style) : undefined;
    const own = levels?.get(level + 1);
    if (!own || own.bullet) return "-";
    const first = Math.max(0, level - Math.min(own.display, MAX_ODF_LEVELS) + 1);
    const numbers = counts.slice(first, level + 1).map((n, i) => {
      const at = levels?.get(first + i + 1);
      return numberText(n ?? at?.start ?? 1, at && !at.bullet ? at.format : "decimal");
    });
    return `${own.prefix}${numbers.join(".")}${own.suffix}`;
  };
  for (const { name, tag, from, to, opens, closes } of tagsOf(content)) {
    if (name === "text:list" && opens && !closes) {
      const outer = lists[lists.length - 1];
      let counts = outer?.counts;
      if (!counts) {
        const continued = attr(tag, "text:continue-list");
        counts = continued ? (byId.get(continued) ?? []) : attr(tag, "text:continue-numbering") === "true" ? previous : [];
        previous = counts;
        const id = attr(tag, "xml:id");
        if (id) byId.set(id, counts);
      }
      lists.push({ style: attr(tag, "text:style-name") ?? outer?.style, counts });
      edits.push({ from, to, text: tag.replace(/\stext:style-name="[^"]*"/, "") });
    } else if (name === "text:list" && !opens) {
      lists.pop();
      pending = undefined;
    } else if (name === "text:list-item" && opens && lists.length) {
      const list = lists[lists.length - 1]!;
      const level = lists.length - 1;
      const restart = parseInt(attr(tag, "text:start-value") ?? "", 10);
      if (Number.isFinite(restart)) list.counts[level] = restart - 1;
      const start = list.style ? (listStyles.get(list.style)?.get(level + 1)?.start ?? 1) : 1;
      list.counts[level] = (list.counts[level] ?? start - 1) + 1;
      list.counts.length = level + 1;
      pending = closes ? undefined : { level, label: label(level, list.counts, list.style) };
      edits.push({ from, to, text: tag.replace(/\stext:style-override="[^"]*"/, "") });
    } else if (name === "text:number" && pending) {
      if (opens && !closes) cached = { from: to };
      else if (!opens && cached) {
        const text = decodeXml(content.slice(cached.from, from).replace(/<[^>]*>/g, "")).trim();
        if (text) pending.label = text;
        cached = undefined;
      }
    } else if ((name === "text:p" || name === "text:h") && opens && pending) {
      const indent = pending.level ? `<text:s text:c="${Math.min(pending.level, MAX_ODF_LEVELS) * 4}"/>` : "";
      const text = `${indent}${pending.label ? `${escapeText(pending.label)} ` : ""}`;
      if (closes) edits.push({ from, to, text: `${tag.slice(0, -2)}>${text}</${name}>` });
      else edits.push({ from: to, to, text });
      pending = undefined;
    }
  }
  if (!edits.length) return content;
  const out: string[] = [];
  let kept = 0;
  for (const edit of edits) {
    out.push(content.slice(kept, edit.from), edit.text);
    kept = edit.to;
  }
  out.push(content.slice(kept));
  return out.join("");
}
