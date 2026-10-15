import { unzlibSync } from "fflate";
import type { ExtractionResult } from "./types";

/**
 * Whether a PDF opens with a layer switched off (Q18 O1): an optional content
 * group listed in the default configuration's `/OFF` array (ISO 32000-1
 * 8.11.4.3). The readers take every layer's text, a viewer shows only the ones
 * switched on, so the bundle can carry text the author's reader never sees.
 * The text is kept and the document says so.
 *
 * A byte scan, not a parse: `/OCProperties` and an `/OFF [... R ...]` array,
 * or a reference to one, in the file or in its object streams, which is where
 * a PDF 1.5 save puts the catalog. A `/Configs` entry's `/OFF` array counts
 * too, and `/BaseState /OFF` is not read. On pdf.js's 964 test files it
 * agrees with pdf.js's own reading on all 952 that pdf.js opened, 7 of them
 * with a layer off (2026-10-14).
 * ponytail: no layered PDF among the 1475 of the extraction corpus
 * (2026-10-14), so nothing more exact; resolve `/D` through the object table
 * if a false notice is ever reported.
 */
export function pdfLayersOff(bytes: Uint8Array): boolean {
  return scanned(bytes, holds);
}

/**
 * Whether a PDF may hold an interactive form or an attached file: the names
 * `/AcroForm`, `/EmbeddedFiles` or `/FileAttachment`, in the file or in its
 * object streams, scanned as {@link pdfLayersOff} scans. A yes only says the
 * second read (pdf.js) is worth paying for; it reads what is really there.
 */
export function pdfMayHoldFormsOrFiles(bytes: Uint8Array): boolean {
  return scanned(bytes, (part) => FORMS_OR_FILES.some((name) => find(part, name) !== -1));
}

/** `test` over the file, then over each Flate object stream inflated, within the budgets. */
function scanned(bytes: Uint8Array, test: (part: Uint8Array) => boolean): boolean {
  if (test(bytes)) return true;
  const out = new Uint8Array(STREAM_CAP);
  let budget = INFLATE_BUDGET;
  for (let at = find(bytes, OBJSTM); at !== -1 && budget > 0; at = find(bytes, OBJSTM, at + 1)) {
    const keyword = find(bytes, STREAM, at);
    if (keyword === -1) break;
    let start = keyword + STREAM.length;
    if (bytes[start] === 0x0d) start++;
    if (bytes[start] === 0x0a) start++;
    const end = find(bytes, ENDSTREAM, start);
    if (end === -1) break;
    try {
      // A fixed buffer stops a stream at the cap instead of growing with it.
      const inflated = unzlibSync(bytes.subarray(start, end), { out });
      budget -= inflated.length;
      if (test(inflated)) return true;
    } catch {
      // Not Flate, or damaged: the readers will say what they make of it.
    }
    at = end;
  }
  return false;
}

/** Past any real object stream; a stream that inflates further is cut there. */
const STREAM_CAP = 4 << 20;
/** What one document may inflate in all, so a file of small bombs stays cheap. */
const INFLATE_BUDGET = 64 << 20;

const ascii = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));
const OBJSTM = ascii("/ObjStm");
const STREAM = ascii("stream");
const ENDSTREAM = ascii("endstream");
const OCPROPERTIES = ascii("/OCProperties");
const OFF = ascii("/OFF");
const FORMS_OR_FILES = [ascii("/AcroForm"), ascii("/EmbeddedFiles"), ascii("/FileAttachment")];

function holds(bytes: Uint8Array): boolean {
  if (find(bytes, OCPROPERTIES) === -1) return false;
  for (let at = find(bytes, OFF); at !== -1; at = find(bytes, OFF, at + 1)) {
    let open = at + OFF.length;
    while (open < bytes.length && (bytes[open] === 0x20 || bytes[open] === 0x0a || bytes[open] === 0x0d)) open++;
    // An array kept as its own object is taken as holding one: Acrobat writes
    // it that way, and following the reference means reading the object table.
    if (bytes[open] >= 0x30 && bytes[open] <= 0x39) return true;
    if (bytes[open] !== 0x5b) continue;
    const close = bytes.indexOf(0x5d, open);
    if (close === -1) return false;
    if (bytes.subarray(open, close).includes(0x52)) return true;
    // On past the array, so a run of unclosed `/OFF [` costs one scan, not one each.
    at = close;
  }
  return false;
}

function find(bytes: Uint8Array, needle: Uint8Array, from = 0): number {
  for (let at = bytes.indexOf(needle[0], from); at !== -1; at = bytes.indexOf(needle[0], at + 1)) {
    let matched = 1;
    while (matched < needle.length && bytes[at + matched] === needle[matched]) matched++;
    if (matched === needle.length) return at;
  }
  return -1;
}

/**
 * A PDF's reading with the switched-off layers said: a line over the text, so
 * the model reading the bundle knows too, and a `layers-off` note. Which text
 * sat on which layer is not known here, so the line covers the document.
 */
export function noteLayersOff(result: ExtractionResult, bytes: Uint8Array): ExtractionResult {
  if (!result.text || !pdfLayersOff(bytes)) return result;
  return {
    ...result,
    text: `(This PDF has layers a viewer hides. Their text is included below.)\n\n${result.text}`,
    notes: [...(result.notes ?? []), { kind: "layers-off" }],
  };
}
