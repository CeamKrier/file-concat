import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

/**
 * Text the author hid, taken out before the document is read (Q18 O1): a
 * paste into a model is the case the 0DIN hidden-span injection write-up
 * describes, and the user cannot review text they cannot see. pandoc drops RTF
 * hidden text the same way; Tika, docling and mammoth keep a docx's, for
 * search indexing.
 *
 * Word part by part: a run whose own properties say `w:vanish` loses its
 * text, and so does a content control still showing its placeholder prompt
 * (`w:showingPlcHdr`, Word's grey "Click or tap here to enter text."), which
 * is the template talking, not the author. `w:specVanish` hides no text and
 * `w:webHidden` hides only in web view, so neither counts.
 *
 * ponytail: run properties only; a run hidden through its character style
 * stays. Resolving styles means reading styles.xml and its inheritance chain.
 */

interface Run {
  hidden: boolean;
  text: boolean;
}
interface Control {
  placeholder: boolean;
  content: boolean;
}

/** A boolean property is on unless its `w:val` says 0, false or off (ECMA-376 17.17.4). */
const on = (tag: string) => !/\sw:val="(?:0|false|off)"/.test(tag);

/** One Word XML part with hidden runs and showing placeholders emptied, and how many hidden runs held text. */
export function withoutHiddenRuns(xml: string): { xml: string; hidden: number } {
  const open: string[] = [];
  const runs: Run[] = [];
  const controls: Control[] = [];
  const out: string[] = [];
  let hidden = 0;
  // Content controls open around this point that are showing their prompt.
  let prompts = 0;
  let kept = 0;
  let dropping = false;
  // Tags found by index, never by a pattern over the whole part, so a crafted
  // part cannot make the scan quadratic.
  for (let at = xml.indexOf("<"); at >= 0; at = xml.indexOf("<", at)) {
    const end = xml.indexOf(">", at);
    if (end < 0) break;
    const tag = xml.slice(at, end + 1);
    // The declaration, comments and processing instructions open nothing.
    if (tag[1] === "?" || tag[1] === "!") {
      at = end + 1;
      continue;
    }
    const closing = tag[1] === "/";
    const name = tag.slice(closing ? 2 : 1).match(/^[^\s/>]+/)?.[0] ?? "";
    const parent = open[open.length - 1];
    if (closing) {
      if (name === "w:t" && dropping) {
        kept = at;
        dropping = false;
      }
      if (name === "w:r" && runs.pop()?.text) hidden++;
      if (name === "w:sdt") {
        const control = controls.pop();
        if (control?.placeholder && control.content) prompts--;
      }
      open.pop();
    } else {
      const empty = tag.endsWith("/>");
      if (name === "w:vanish" && parent === "w:rPr" && open[open.length - 2] === "w:r" && runs.length && on(tag)) {
        runs[runs.length - 1].hidden = true;
      } else if (name === "w:showingPlcHdr" && parent === "w:sdtPr" && controls.length && on(tag)) {
        controls[controls.length - 1].placeholder = true;
      } else if (name === "w:sdtContent" && parent === "w:sdt" && controls.length && !controls[controls.length - 1].content) {
        const control = controls[controls.length - 1];
        control.content = true;
        if (control.placeholder) prompts++;
      } else if (name === "w:t" && !empty) {
        const run = runs[runs.length - 1];
        const prompt = prompts > 0;
        if (run?.hidden || prompt) {
          out.push(xml.slice(kept, end + 1));
          dropping = true;
          if (run?.hidden && !prompt) run.text = true;
        }
      }
      if (!empty) {
        open.push(name);
        if (name === "w:r") runs.push({ hidden: false, text: false });
        if (name === "w:sdt") controls.push({ placeholder: false, content: false });
      }
    }
    at = end + 1;
  }
  if (out.length === 0) return { xml, hidden: 0 };
  out.push(xml.slice(kept));
  return { xml: out.join(""), hidden };
}

/**
 * Past this many bytes unpacked the docx is read as it is, hidden text and
 * all: the rewrite unpacks every part, media included, which the reader
 * itself may never do.
 *
 * ponytail: fails open on a document past the cap; rewrite the parts in
 * place, without unpacking the rest, if real documents reach it.
 */
const MAX_REWRITE = 256 * 1024 * 1024;

/** The parts of a docx that hold runs: the body, headers, footers, notes and comments. */
const WORD_PART = /^word\/(?:document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/;

/**
 * A docx with its hidden text taken out, and how many hidden runs held text.
 * Anything else, or a docx with nothing hidden, comes back as the same bytes.
 */
export function withoutHiddenWordText(bytes: Uint8Array): { bytes: Uint8Array; hidden: number } {
  let parts: Record<string, Uint8Array>;
  let unpacked = 0;
  try {
    parts = unzipSync(bytes, {
      filter: (file) => {
        unpacked += file.originalSize;
        return WORD_PART.test(file.name);
      },
    });
  } catch {
    return { bytes, hidden: 0 };
  }
  const changed: Record<string, Uint8Array> = {};
  let hidden = 0;
  for (const [name, data] of Object.entries(parts)) {
    const before = strFromU8(data);
    const after = withoutHiddenRuns(before);
    if (after.xml === before) continue;
    changed[name] = strToU8(after.xml);
    hidden += after.hidden;
  }
  if (Object.keys(changed).length === 0 || unpacked > MAX_REWRITE) return { bytes, hidden: 0 };
  // Stored, not deflated: the zip is only read back by the next step.
  return { bytes: zipSync({ ...unzipSync(bytes), ...changed }, { level: 0 }), hidden };
}
