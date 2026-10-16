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
  return applyEdits(xml, edits);
}

/**
 * A Word part with each legacy form field written as what it shows (ECMA-376
 * 17.16.5.20, 17.16.5.21): a check box as `[x]` or `[ ]`, a drop-down as its
 * selected entry. Word stores neither as text, only as `w:ffData` on the
 * field's start, so the reader gave the label beside a box and no state. A
 * box is checked by `w:checked`, else by `w:default`, as mammoth and
 * docx2python read it (Tika reads neither); a drop-down shows entry
 * `w:result`, the first when there is none (docx2python). A field whose
 * start run is hidden, or that already shows a result, is left as it is.
 */
export function withWordFormFields(xml: string): string {
  if (!xml.includes("w:ffData")) return xml;
  const edits: Array<{ at: number; text: string }> = [];
  const fields: Array<{ data: string; hidden: boolean; code: string; result?: string }> = [];
  // One pass, no look-ahead: a part with many unclosed tags must not cost a
  // scan to its end per tag.
  let vanish = false;
  let data = -1;
  let code = -1;
  let text = -1;
  let shown: string | undefined;
  for (const t of tagsOf(xml)) {
    if (t.name === "w:r" && !t.closes) vanish = false;
    else if (t.name === "w:r" && !t.opens && shown !== undefined) {
      edits.push({ at: t.to, text: `<w:r><w:t xml:space="preserve">${escapeXml(shown)}</w:t></w:r>` });
      shown = undefined;
    } else if (t.name === "w:vanish" && t.opens) vanish = !/\sw:val="(?:0|false|off)"/.test(t.tag);
    else if (t.name === "w:fldChar" && !t.opens) {
      if (data >= 0 && fields.length) fields[fields.length - 1]!.data = xml.slice(data, t.from);
      data = -1;
    } else if (t.name === "w:fldChar") {
      const type = attr(t.tag, "w:fldCharType");
      if (type === "begin") {
        fields.push({ data: "", hidden: vanish, code: "" });
        if (!t.closes) data = t.to;
      } else if (type === "separate" && fields.length) fields[fields.length - 1]!.result = "";
      else if (type === "end") {
        const field = fields.pop();
        shown = field && !field.hidden && !field.result?.trim() ? formFieldText(field.code, field.data) : undefined;
      }
    } else if (t.name === "w:instrText") {
      if (t.opens && !t.closes) code = t.to;
      else if (!t.opens && code >= 0 && fields.length) fields[fields.length - 1]!.code += decodeXml(xml.slice(code, t.from));
    } else if (t.name === "w:t") {
      const field = fields[fields.length - 1];
      if (t.opens && !t.closes) text = t.to;
      else if (!t.opens && text >= 0 && field?.result !== undefined) field.result += decodeXml(xml.slice(text, t.from));
    }
  }
  return applyEdits(xml, edits);
}

/**
 * An OpenDocument text with each form control written where the page draws
 * it (ODF 1.3 13.5): a field as its current value, else its default, and a
 * check box as `[x]` or `[ ]`. The control is defined in `office:forms` and
 * placed by a `draw:control` naming it, which the reader drops. A password,
 * a hidden field and a button draw no value and are not read; neither are a
 * list box and a radio button.
 */
export function withOdfFormValues(xml: string): string {
  if (!xml.includes("<draw:control")) return xml;
  const shown = new Map<string, string>();
  for (const t of tagsOf(xml.slice(xml.indexOf("<office:forms"), xml.indexOf("</office:forms>") + 1))) {
    if (!t.opens || !/^form:(?:text|textarea|formatted-text|combobox|date|time|checkbox)$/.test(t.name)) continue;
    const id = attr(t.tag, "form:id") ?? attr(t.tag, "xml:id");
    if (!id) continue;
    const value =
      t.name === "form:checkbox"
        ? ({ checked: "[x]", unchecked: "[ ]" } as Record<string, string>)[attr(t.tag, "form:current-state") ?? attr(t.tag, "form:state") ?? "unchecked"]
        : (attr(t.tag, "form:current-value") ?? attr(t.tag, "form:value"));
    if (value !== undefined) shown.set(id, value);
  }
  if (!shown.size) return xml;
  // The body stops at the next control, so an unclosed one is not read to the end per control.
  return xml.replace(/<draw:control\b[^>]*?(?:\/>|>(?:(?!<draw:control\b)[\s\S])*?<\/draw:control>)/g, (control) => {
    const value = shown.get(attr(control, "draw:control") ?? "");
    return value === undefined ? control : value;
  });
}

/** A form field's shown text from its code and the `w:ffData` its start carries. */
function formFieldText(code: string, data: string): string | undefined {
  const kind = /^\s*(FORMCHECKBOX|FORMDROPDOWN)\b/.exec(code)?.[1];
  // A property is on unless its `w:val` says 0, false or off (ECMA-376 17.17.4).
  const isOn = (tag: string | undefined) => tag !== undefined && !/\sw:val="(?:0|false|off)"/.test(tag);
  if (kind === "FORMCHECKBOX") return isOn(/<w:checked\b[^>]*>/.exec(data)?.[0] ?? /<w:default\b[^>]*>/.exec(data)?.[0]) ? "[x]" : "[ ]";
  if (kind !== "FORMDROPDOWN") return undefined;
  const entries = Array.from(data.matchAll(/<w:listEntry\b[^>]*>/g), ([tag]) => decodeXml(attr(tag, "w:val") ?? ""));
  return entries[Number(attr(/<w:result\b[^>]*>/.exec(data)?.[0] ?? "", "w:val")) || 0];
}

/** The part with each edit's text inserted at its offset. */
function applyEdits(xml: string, edits: Array<{ at: number; text: string }>): string {
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
