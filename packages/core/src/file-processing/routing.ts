import type { ArchiveKind } from "./archives";
import { isTarHeader } from "./archives";
import { matchesBinarySignature } from "./binary-signatures";
import type { ParserId } from "./parsers/types";
import { matchTextualSignature, type TextualFormat } from "./text-signatures";

/**
 * The router (ADR-0011). One decision point, reading a file's leading bytes.
 *
 * FileConcat classifies by content everywhere else — ADR-0001 scores decoded
 * printability, ADR-0007 added a magic-signature pre-check so renamed and
 * extensionless files land correctly — but extraction used to branch on the
 * filename. That is gone: a `.docx` renamed `.zip` is now extracted, and a PDF
 * with no extension is read.
 */

/** How many leading bytes the router needs. Matches `validation.ts`'s sniff. */
export const ROUTER_SNIFF_BYTES = 8192;

export type FileRoute =
  /**
   * A known media/executable container. Nothing is loaded and nothing is
   * decoded. `format` is set when a signature named it (`png`, `mp4`, …), so a
   * caller can offer recognition over the raster ones — see
   * {@link RECOGNISABLE_IMAGE_FORMATS}. Absent when the byte classifier, not a
   * signature, is what called the file binary.
   */
  | { kind: "binary"; format?: string }
  /** A document container: load `parserId` and include the text it recovers. */
  | { kind: "extract"; parserId: ParserId; format: string }
  /** An archive: unpack it, and let every entry face classification on its own. */
  | { kind: "expand"; archive: ArchiveKind }
  /**
   * No container recognized. Not a verdict — the caller decodes the bytes and
   * lets {@link classifyBytes} decide text vs binary, which is where every
   * plain source file, config and prose document ends up.
   */
  | { kind: "unknown" };

/**
 * Detected format → the parser that reads it. `officeparser` covers all of the
 * first group through a single entry point, so they share one id.
 *
 * The macro-enabled and template variants are the same package with a
 * different content type, and the detector names each one separately. Before
 * they were listed here an `.xlsm` fell through to the byte classifier and was
 * reported as "image or binary". The office parser is told which base format
 * to read them as (see {@link ./parsers/officeparser} `LIBRARY_FILE_TYPE`).
 */
const DOCUMENT_PARSERS: Readonly<Record<string, ParserId>> = {
  pdf: "office",
  docx: "office",
  docm: "office",
  dotx: "office",
  dotm: "office",
  xlsx: "office",
  xlsm: "office",
  xltx: "office",
  xltm: "office",
  // Binary workbook. `file-type` calls it a zip (its content type has no
  // `+xml`), so {@link ooxmlFromEntryNames} names it.
  xlsb: "office",
  pptx: "office",
  pptm: "office",
  potx: "office",
  potm: "office",
  ppsx: "office",
  ppsm: "office",
  odt: "office",
  ods: "office",
  odp: "office",
  rtf: "office",
  epub: "epub",
  // Kindle: old MOBI and KF8 (.azw3) share the PalmDB `BOOKMOBI` header.
  mobi: "mobi",
  // The OLE2 compound file behind Excel/Word/PowerPoint 97-2003, Outlook
  // `.msg` and every password-protected OOXML document. The signature is the
  // same for all of them and only the stream directory inside says which, so
  // the reader decides: it reads a workbook, and answers parser-unavailable
  // for the rest, which the ledger then names from the extension.
  cfb: "cfb",
};

/**
 * Detected format → archive kind. `jar` and `apk` are deliberately absent:
 * they share the zip signature but their payload is compiled classes and packed
 * resources, so unpacking one produces noise rather than context. They fall
 * through to the byte classifier and land as binaries, as they do today.
 */
const ARCHIVE_KINDS: Readonly<Record<string, ArchiveKind>> = {
  zip: "zip",
  tar: "tar",
  // `file-type` inflates far enough to tell a gzipped tar from a gzipped file
  // and reports them separately. Both map to `gz`: the expander re-checks the
  // decompressed bytes anyway, so it stays right if the detector ever stops
  // looking inside.
  gz: "gz",
  "tar.gz": "gz",
  bz2: "bz2",
  xz: "xz",
  rar: "rar",
  "7z": "7z",
};

/**
 * Text-shaped format → the parser that renders it. These carry no magic number;
 * see {@link ./text-signatures} for why they are routed rather than reshaped
 * after classification.
 */
const TEXTUAL_PARSERS: Readonly<Record<TextualFormat, ParserId>> = {
  ipynb: "notebook",
  srt: "subtitles",
  vtt: "subtitles",
  eml: "email",
  html: "html",
};

/**
 * Every format name a route can carry into a parser, as the file-type or
 * textual detector spells it. For a reading, not for routing: `cfb` is one
 * entry here and covers xls, doc, msg and ppt alike, and the router never
 * looks at an extension.
 */
export const EXTRACTED_FORMATS: ReadonlySet<string> = new Set([
  ...Object.keys(DOCUMENT_PARSERS),
  ...Object.keys(TEXTUAL_PARSERS),
  ...Object.keys(ARCHIVE_KINDS),
]);

type Detector = (bytes: Uint8Array) => Promise<{ ext: string } | undefined>;

let detector: Promise<Detector> | null = null;

/**
 * `file-type` is loaded lazily and cached. It is ~19 KB gzipped and only
 * fetched once the user has actually handed us files, which is the trade for
 * not maintaining our own container table — the maintenance burden that made
 * the old extension list wrong every time a format was added.
 */
function loadDetector(): Promise<Detector> {
  detector ??= import("file-type").then((mod) => mod.fileTypeFromBuffer as Detector);
  return detector;
}

/**
 * Route a file from its leading bytes. Pass at least {@link ROUTER_SNIFF_BYTES};
 * that is enough for every container we recognize, including the zip family,
 * whose disambiguating entry (`[Content_Types].xml` for OOXML, `mimetype` for
 * OpenDocument and EPUB) is the first thing in the archive.
 */
export async function routeBytes(prefix: Uint8Array): Promise<FileRoute> {
  // Cheap and synchronous, and it settles the most common binaries (images,
  // video) without loading the detector at all. See ADR-0007.
  const signature = matchesBinarySignature(prefix);
  if (signature) return { kind: "binary", format: signature };

  const fileTypeFromBuffer = await loadDetector();
  const detected = await fileTypeFromBuffer(prefix);

  if (detected) {
    const ooxml = detected.ext === "zip" ? ooxmlFromEntryNames(prefix) : undefined;
    if (ooxml) return { kind: "extract", parserId: "office", format: ooxml };

    const parserId = DOCUMENT_PARSERS[detected.ext];
    if (parserId) return { kind: "extract", parserId, format: detected.ext };

    const archive = ARCHIVE_KINDS[detected.ext];
    if (archive) return { kind: "expand", archive };
  }

  // `file-type` identifies tar by the `ustar` magic, which pre-POSIX v7 tars do
  // not carry. Their header checksum still identifies them from content alone.
  if (isTarHeader(prefix)) return { kind: "expand", archive: "tar" };

  // Formats whose signature is ASCII rather than a magic number. Checked after
  // the detector so a real container always wins, and before falling through:
  // these files *are* text, but the text is a serialization, not the document.
  const textual = matchTextualSignature(prefix);
  if (textual) {
    return { kind: "extract", parserId: TEXTUAL_PARSERS[textual], format: textual };
  }

  // Anything the detector recognizes but we have no branch for (images with
  // odd headers, audio, executables) is left to the byte classifier rather than
  // being declared binary here — it already handles them, and it will not
  // mistake an `.xml` or `.svg`, which `file-type` also recognizes, for one.
  return { kind: "unknown" };
}

/**
 * An Office package `file-type` reported as a plain zip. It names OOXML from
 * `[Content_Types].xml` when that entry comes first and its main content type
 * ends in `+xml`; a binary workbook's does not, and some writers put the parts
 * before it. On the POI test files that sent 10 of 10 `.xlsb` and 6 `.xlsx` to
 * be unpacked as archives on their prefix (2026-10-05). The web's batch step
 * re-routes the whole file when an unpacked zip holds `[Content_Types].xml`,
 * which already rescued the `.xlsx`; a `.xlsb` stayed a zip even then.
 *
 * The rule is `file-type`'s own fallback (`getOpenXmlFileTypeFromDirectoryNames`:
 * `word/`, then `ppt/`, then `xl/`), applied to the local headers in the bytes
 * given, which its fallback skips when a sniffed prefix ends mid-entry. A part
 * suffix is required as well, so a zip of a folder named `word` still unpacks.
 */
function ooxmlFromEntryNames(prefix: Uint8Array): string | undefined {
  const view = new DataView(prefix.buffer, prefix.byteOffset, prefix.byteLength);
  const decoder = new TextDecoder();
  const seen = new Set<string>();
  for (let at = 0; at + 30 <= prefix.length && view.getUint32(at, true) === 0x04034b50; ) {
    const nameLength = view.getUint16(at + 26, true);
    const name = decoder.decode(prefix.subarray(at + 30, at + 30 + nameLength));
    const part = /^(word|ppt|xl)\/.*\.(xml|rels|bin)$/.exec(name);
    if (part) seen.add(name === "xl/workbook.bin" ? "xlsb" : part[1]);
    // A writer that streams (flag bit 3) leaves the size at 0 here, so the walk
    // lands on the entry's data, the signature check fails and the loop ends.
    at += 30 + nameLength + view.getUint16(at + 28, true) + view.getUint32(at + 18, true);
  }
  if (seen.has("word")) return "docx";
  if (seen.has("ppt")) return "pptx";
  if (seen.has("xlsb")) return "xlsb";
  if (seen.has("xl")) return "xlsx";
  return undefined;
}

/** {@link routeBytes} over a `File`, reading only the prefix it needs. */
export async function routeFile(file: File): Promise<FileRoute> {
  const prefix = new Uint8Array(await file.slice(0, ROUTER_SNIFF_BYTES).arrayBuffer());
  return routeBytes(prefix);
}
