import type { FileRoute } from "./routing";

/**
 * Why a file the classifier called binary holds no text we can use, in the
 * words shown beside its name.
 *
 * Every file this describes was left out, so the question is never whether
 * but what kind of thing it was, and what the person can do about it. "Binary
 * file" answered neither: over six weeks of counters the second most common
 * document people brought that we could not open was a 97-2003 Excel workbook,
 * and the screen called each one an image. The families here are the ones the
 * `unreadable_ext` counter actually reports, most common first, so a remedy
 * exists exactly where one exists in the world: a legacy Office file is one
 * Save As away from being read, a font never will be.
 *
 * The label ends at the first sentence. `unreadableLabel` recovers it from a
 * stored reason, which is how the bundle's own "not included" note groups these
 * by kind without carrying a second field through every status record.
 */
export interface UnreadableReason {
  /** What the file is, as a noun phrase: "Excel 97-2003 workbook". */
  label: string;
  /** What would make it readable, when something would. */
  remedy?: string;
}

/** The catch-all. */
export const GENERIC_UNREADABLE_LABEL = "Binary file";

/**
 * Labels the bundle note keeps under "image or binary": nothing to name, or an
 * image, which has its own recognition offer on screen and needs no line here.
 */
export function isGenericUnreadableLabel(label: string): boolean {
  return label === GENERIC_UNREADABLE_LABEL || label === "Image";
}

/** Extension families for the bytes the router does not name itself. */
const FAMILIES: ReadonlyArray<readonly [label: string, extensions: readonly string[]]> = [
  ["Font file", ["ttf", "otf", "woff", "woff2", "eot", "ttc"]],
  [
    "Audio or video",
    ["mp3", "wav", "flac", "ogg", "oga", "m4a", "aac", "mp4", "m4v", "webm", "mkv", "avi", "mov", "wmv", "mid", "midi"],
  ],
  [
    "Compiled code or library",
    ["pyc", "pyo", "pyd", "o", "obj", "a", "lib", "so", "dll", "dylib", "exe", "pdb", "class", "jar", "dex", "apk", "aab", "arsc", "flat", "wasm", "node", "rlib", "rmeta", "ilk", "exp", "res"],
  ],
  ["Database file", ["db", "sqlite", "sqlite3", "db-wal", "db-shm", "sqlite-wal", "sqlite-shm", "mdb", "accdb", "ldb"]],
  [
    "Data or model file",
    ["bin", "dat", "npy", "npz", "pkl", "pickle", "parquet", "orc", "h5", "hdf5", "pt", "pth", "onnx", "safetensors", "ckpt", "gguf", "mat", "sav", "nc"],
  ],
];

/**
 * Videos whose container can carry a subtitle track, which the web reads as
 * the transcript (extraction router, D4). They pass the walk so their header
 * can be looked at; one without a track costs that header and no more.
 */
const SUBTITLE_CONTAINERS: ReadonlySet<string> = new Set(["mp4", "m4v", "mov", "mkv", "webm"]);

/** Audio the web offers to transcribe (extraction router, D5). */
const SPEECH_AUDIO: ReadonlySet<string> = new Set(["mp3", "wav", "flac", "ogg", "oga", "m4a", "aac"]);

/**
 * Every extension the families above name: a file that never holds text, so
 * the web walk drops it before its first byte is read (`prunedAtWalk`). Images
 * are deliberately not here, since a dropped image gets the recognition offer,
 * and neither is audio or a video that can carry speech, for the same reason.
 */
export const NEVER_TEXT_EXTENSIONS: ReadonlySet<string> = new Set(
  FAMILIES.flatMap(([, extensions]) => extensions).filter((ext) => !SUBTITLE_CONTAINERS.has(ext) && !SPEECH_AUDIO.has(ext)),
);

const NO_SUBTITLE_TRACK: UnreadableReason = {
  label: "Video with no subtitle track",
  remedy: "Drop its .srt or .vtt file to have the words read.",
};

/** Formats the office parser reads, for the "saved under a new name" remedy. */
const OOXML_SAVE_AS: Readonly<Record<string, string>> = {
  docx: ".docx",
  docm: ".docx",
  xlsx: ".xlsx",
  xlsm: ".xlsx",
  pptx: ".pptx",
  pptm: ".pptx",
};

// Reached when no reader opened it: damaged, encrypted, or a method 7-Zip lacks.
const ARCHIVE_REMEDY = "Unpack it on your computer and drop the folder instead.";

const extensionOf = (path: string): string => {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

/**
 * Describe a file the classifier called binary. `route` is what the router
 * said about its bytes; the extension only refines that, never contradicts it,
 * so a `.txt` holding a compound file is still reported as one.
 */
export function unreadableReason(path: string, route?: FileRoute): UnreadableReason {
  const ext = extensionOf(path);

  if (route?.kind === "expand") {
    return { label: `${route.archive} archive the browser can't open`, remedy: ARCHIVE_REMEDY };
  }

  // The compound-file reader opened it and found no workbook inside (or the
  // build carries no such reader). The directory would say what it is; the
  // extension is the cheap proxy and has been right on every one counted.
  if (route?.kind === "extract" && route.format === "cfb") {
    switch (ext) {
      case "xls":
      case "xlt":
      case "xla":
        return { label: "Excel 97-2003 workbook", remedy: "Save it as .xlsx and it will be read." };
      case "doc":
      case "dot":
        return { label: "Word 97-2003 document", remedy: "Save it as .docx and it will be read." };
      case "ppt":
      case "pps":
      case "pot":
        return { label: "PowerPoint 97-2003 file", remedy: "Save it as .pptx and it will be read." };
      case "msg":
        return { label: "Outlook message", remedy: "Save it as .eml and it will be read." };
      default:
        if (OOXML_SAVE_AS[ext]) {
          return {
            label: "Password-protected or 97-2003 Office file",
            remedy: `Remove the password, or open it and save it again as ${OOXML_SAVE_AS[ext]}.`,
          };
        }
        return { label: "Microsoft 97-2003 Office family file" };
    }
  }

  if (route?.kind === "binary" && route.format) {
    switch (route.format) {
      case "ico":
      case "cur":
        return { label: "Icon file" };
      case "psd":
        return { label: "Photoshop file", remedy: "Export it as a PDF or an image to have it read." };
      case "heif":
        return { label: "HEIC or AVIF photo", remedy: "A photo saved as JPEG or PNG can be read." };
      case "iso-bmff":
        if (SUBTITLE_CONTAINERS.has(ext)) return NO_SUBTITLE_TRACK;
        return { label: "Audio or video" };
      case "matroska":
        return NO_SUBTITLE_TRACK;
      case "mp3":
      case "aac":
      case "flac":
      case "ogg":
      case "wave":
        return { label: "Audio or video" };
      default:
        return { label: "Image" };
    }
  }

  switch (ext) {
    case "mobi":
    case "azw":
    case "azw3":
      return { label: "Kindle ebook", remedy: "Convert it to .txt or .pdf (Calibre does this) and drop that." };
    case "djvu":
      return { label: "DjVu scan", remedy: "Convert it to PDF to have it read." };
    case "pages":
      return { label: "Apple Pages document", remedy: "Export it as .docx or PDF." };
    case "numbers":
      return { label: "Apple Numbers spreadsheet", remedy: "Export it as .xlsx or CSV." };
    case "key":
      return { label: "Apple Keynote deck", remedy: "Export it as .pptx or PDF." };
    case "rar":
    case "7z":
    case "bz2":
    case "xz":
    case "zst":
    case "lz4":
    case "lzma":
    case "z":
    case "dmg":
    case "iso":
    case "deb":
    case "rpm":
    case "cab":
      return { label: `.${ext} archive the browser can't open`, remedy: ARCHIVE_REMEDY };
  }

  for (const [label, extensions] of FAMILIES) {
    if (extensions.includes(ext)) return { label };
  }
  return { label: GENERIC_UNREADABLE_LABEL };
}

/** The one string a status record stores: label, then the remedy as its own sentence. */
export function unreadableReasonText(reason: UnreadableReason): string {
  return reason.remedy ? `${reason.label}. ${reason.remedy}` : reason.label;
}

/** The label back out of a stored reason: everything before the first sentence end. */
export function unreadableLabel(reason: string): string {
  const end = reason.indexOf(". ");
  return end === -1 ? reason : reason.slice(0, end);
}
