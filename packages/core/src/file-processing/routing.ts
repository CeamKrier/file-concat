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
  /** A known media/executable container. Nothing is loaded and nothing is decoded. */
  | { kind: "binary" }
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
 */
const DOCUMENT_PARSERS: Readonly<Record<string, ParserId>> = {
  pdf: "office",
  docx: "office",
  xlsx: "office",
  pptx: "office",
  odt: "office",
  ods: "office",
  odp: "office",
  rtf: "office",
  epub: "epub",
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
};

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
  if (matchesBinarySignature(prefix)) return { kind: "binary" };

  const fileTypeFromBuffer = await loadDetector();
  const detected = await fileTypeFromBuffer(prefix);

  if (detected) {
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

/** {@link routeBytes} over a `File`, reading only the prefix it needs. */
export async function routeFile(file: File): Promise<FileRoute> {
  const prefix = new Uint8Array(await file.slice(0, ROUTER_SNIFF_BYTES).arrayBuffer());
  return routeBytes(prefix);
}
