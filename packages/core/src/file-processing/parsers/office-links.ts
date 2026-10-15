import { attr, decodeXml, escapeXml, tagsOf } from "./office-charts";

/**
 * A Word part with each HYPERLINK field written as `[text](address)` (Q32
 * O1), as officeparser already gets a `w:hyperlink` element written by
 * `showLinkDestinations`. officeparser shows a field's result and drops its
 * code, and the code is where the address is: `HYPERLINK "url" \o "tip"`
 * (ECMA-376 17.16.5.25). A complex field (`w:fldChar` begin, separate, end)
 * and a simple one (`w:fldSimple`) both. A link to a bookmark only (`\l`) is
 * skipped, as `#anchor` links are, and so is one whose text is its address.
 *
 * Runs after hidden text is emptied, so a hidden link's result is gone and
 * its brackets with it.
 */
export function withWordFieldLinks(xml: string): string {
  if (!xml.includes("HYPERLINK")) return xml;
  const edits: Array<{ at: number; text: string }> = [];
  const fields: Array<{ code: string; result?: number; text: string }> = [];
  let simple: { address?: string; from: number; text: string } | undefined;
  let run = 0;
  let code = -1;
  let text = -1;
  for (const t of tagsOf(xml)) {
    if (t.name === "w:r" && t.opens && !t.closes) run = t.from;
    else if (t.name === "w:fldChar" && t.opens) {
      const type = attr(t.tag, "w:fldCharType");
      if (type === "begin") fields.push({ code: "", text: "" });
      else if (type === "separate" && fields.length) fields[fields.length - 1]!.result = xml.indexOf("</w:r>", t.to) + "</w:r>".length;
      else if (type === "end") {
        const field = fields.pop();
        const address = field && hyperlinkAddress(field.code);
        if (field?.result && address) wrap(edits, field.result, run, field.text, address);
        // A link inside another field's result is part of that result's text.
        if (field && fields.length) fields[fields.length - 1]!.text += field.text;
      }
    } else if (t.name === "w:instrText") {
      if (t.opens && !t.closes) code = t.to;
      else if (!t.opens && code >= 0 && fields.length) fields[fields.length - 1]!.code += decodeXml(xml.slice(code, t.from));
    } else if (t.name === "w:t") {
      if (t.opens && !t.closes) text = t.to;
      else if (!t.opens && text >= 0) {
        const value = decodeXml(xml.slice(text, t.from));
        const field = fields[fields.length - 1];
        if (field?.result !== undefined) field.text += value;
        if (simple) simple.text += value;
      }
    } else if (t.name === "w:fldSimple" && t.opens !== t.closes) {
      if (t.opens) simple = { address: hyperlinkAddress(decodeXml(attr(t.tag, "w:instr") ?? "")), from: t.to, text: "" };
      else if (simple) {
        if (simple.address) wrap(edits, simple.from, t.from, simple.text, simple.address);
        simple = undefined;
      }
    }
  }
  if (!edits.length) return xml;
  edits.sort((a, b) => a.at - b.at);
  let out = "";
  let kept = 0;
  for (const edit of edits) {
    out += xml.slice(kept, edit.at) + edit.text;
    kept = edit.at;
  }
  return out + xml.slice(kept);
}

/** `[` before the result and `](address)` after it, unless the result is empty or already the address. */
function wrap(edits: Array<{ at: number; text: string }>, from: number, to: number, text: string, address: string): void {
  if (!linkWorthWriting(text, address) || to < from) return;
  const run = (value: string) => `<w:r><w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r>`;
  edits.push({ at: from, text: run("[") }, { at: to, text: run(`](${address})`) });
}

/**
 * Whether `[text](address)` says more than `text`: not when the text is empty
 * or already holds the address, read without its `http://`, `https://` or
 * `mailto:` and a closing slash, as `www.example.org` shows
 * `http://www.example.org/` (Q32 O1). Nor when the address is longer than
 * any a browser keeps in its address bar: a spreadsheet, deck or PDF names one
 * address from many links, and a long one would be written once per link.
 */
export const linkWorthWriting = (text: string, address: string) =>
  address.length <= MAX_ADDRESS && /\S/.test(text) && !text.includes(address.replace(/^(?:https?:\/\/|mailto:)/i, "").replace(/\/$/, ""));

const MAX_ADDRESS = 2048;

/**
 * The address of a HYPERLINK field code, with its `\l` location appended as a
 * fragment; undefined for another field or a link to a bookmark only. The
 * address is folded, as `showLinkDestinations` folds one. A .doc keeps the
 * same field code (`doc.ts`).
 */
export function hyperlinkAddress(code: string): string | undefined {
  // A .doc field code can carry a control character, an object's placeholder.
  // eslint-disable-next-line no-control-regex -- dropping control characters is the point
  const parts = /^\s*HYPERLINK\b(.*)$/is.exec(code.replace(/[\x00-\x1f]/g, " "))?.[1];
  if (parts === undefined) return undefined;
  let address = "";
  let location = "";
  const args = [...parts.matchAll(/(\\[a-z])|"([^"]*)"|(\S+)/gi)];
  for (let at = 0; at < args.length; at++) {
    const [, flag, quoted, bare] = args[at]!;
    if (flag) {
      const value = args[at + 1]?.[2] ?? args[at + 1]?.[3];
      if (flag.toLowerCase() === "\\l" && value) location = value;
      if (/^\\[lmnot]$/i.test(flag)) at++;
    } else if (!address) address = quoted ?? bare ?? "";
  }
  address = address.replace(/\s+/g, "");
  return address && !address.startsWith("#") ? address + (location ? `#${location.replace(/\s+/g, "")}` : "") : undefined;
}
