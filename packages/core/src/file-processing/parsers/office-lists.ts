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

interface Level {
  format: string;
  text: string;
  start: number;
  /** One-based: restart after a level up to this one is used; 0 never. Absent: after any higher level. */
  restart?: number;
  legal: boolean;
}

interface Abstract {
  levels: Map<number, Level>;
  /** `numStyleLink`: the levels live in the abstract list whose `styleLink` names this style. */
  link?: string;
  style?: string;
}

interface Instance {
  abstract: string;
  starts: Map<number, number>;
  levels: Map<number, Level>;
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
    return own.text.replace(/%([1-9])/g, (_, digit: string) => {
      const n = Number(digit) - 1;
      const at = level(n);
      return numberText(counts[n] ?? at?.start ?? 0, own.legal ? "decimal" : (at?.format ?? "decimal"));
    });
  };
}

function readNumbering(xml: string): { abstracts: Map<string, Abstract>; instances: Map<string, Instance> } {
  const abstracts = new Map<string, Abstract>();
  const instances = new Map<string, Instance>();
  let abstract: Abstract | undefined;
  let instance: Instance | undefined;
  let overriding: number | undefined;
  let level: Level | undefined;
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
