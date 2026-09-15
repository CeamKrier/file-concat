/**
 * What the product would make of an extension, asked of the product itself.
 *
 * The pulse reading lists every extension `unreadable_ext` and `pruned_ext`
 * carried in the window and needs to say, per row, whether the tool reads
 * that format (so the bytes were not what the name said, or a reader declined),
 * names it without reading it (a reader candidate, ranked by Runs), refuses it
 * at the door (never text), offers recognition (an image), or has never looked
 * at it. Those answers live in core (`EXTRACTED_FORMATS`, `unreadableReason`,
 * `NEVER_TEXT_EXTENSIONS`, `RECOGNISABLE_IMAGE_FORMATS`) and drift the moment
 * a copy of them is kept anywhere else, so the reading asks here instead of
 * keeping a list.
 *
 * Usage: pnpm exec tsx scripts/input-catalogue.ts ext,ext,ext
 * Prints one JSON object: { ext: { kind, label } }.
 */
import {
  canExpandArchive,
  EXTRACTED_FORMATS,
  NEVER_TEXT_EXTENSIONS,
  RECOGNISABLE_IMAGE_FORMATS,
  unreadableReason,
  type FileRoute,
} from "@fileconcat/core";

export type InputKind = "reader" | "image" | "never-text" | "named" | "unknown";

/**
 * The compound-file family, decided by the container's stream directory in
 * `apps/web/src/lib/extract-cfb-client.ts`, not by extension. These are the
 * extensions that directory reads (workbook, Word document, Outlook message)
 * and the one it declines (PowerPoint); the router itself knows only `cfb`.
 */
const CFB_READ = new Set(["xls", "xlt", "xla", "doc", "dot", "msg"]);
const CFB_NAMED = new Set(["ppt", "pps", "pot"]);
const CFB_ROUTE: FileRoute = { kind: "extract", parserId: "cfb", format: "cfb" };

/** Archive kinds the router names; `canExpandArchive` says which open. */
const ARCHIVES = new Set(["zip", "tar", "gz", "tgz", "rar", "7z"]);

/** Image extensions by their detector name, so the label matches the screen's. */
const IMAGE_FORMAT: Record<string, string> = {
  png: "png",
  jpg: "jpeg",
  jpeg: "jpeg",
  gif: "gif",
  tif: "tiff",
  tiff: "tiff",
  webp: "webp",
  ico: "ico",
  cur: "cur",
  psd: "psd",
  heic: "iso-bmff",
  heif: "iso-bmff",
  bmp: "bmp",
  avif: "avif",
};

export function catalogue(ext: string): { kind: InputKind; label: string } {
  const e = ext.toLowerCase();
  if (ARCHIVES.has(e)) {
    const kind = e === "tgz" ? "gz" : e;
    const route: FileRoute = { kind: "expand", archive: kind as "zip" | "tar" | "gz" | "rar" | "7z" };
    return canExpandArchive(route.archive)
      ? { kind: "reader", label: `${kind} archive, opened here` }
      : { kind: "named", label: unreadableReason(`f.${e}`, route).label };
  }
  if (CFB_READ.has(e)) return { kind: "reader", label: unreadableReason(`f.${e}`, CFB_ROUTE).label };
  if (CFB_NAMED.has(e)) return { kind: "named", label: unreadableReason(`f.${e}`, CFB_ROUTE).label };
  if (EXTRACTED_FORMATS.has(e)) return { kind: "reader", label: `${e} document, read here` };
  if (IMAGE_FORMAT[e]) {
    const route: FileRoute = { kind: "binary", format: IMAGE_FORMAT[e] };
    const label = unreadableReason(`f.${e}`, route).label;
    return RECOGNISABLE_IMAGE_FORMATS.has(IMAGE_FORMAT[e]) ? { kind: "image", label } : { kind: "named", label };
  }
  if (NEVER_TEXT_EXTENSIONS.has(e)) return { kind: "never-text", label: unreadableReason(`f.${e}`).label };
  const { label } = unreadableReason(`f.${e}`);
  return { kind: label === "Binary file" ? "unknown" : "named", label };
}

if (process.argv[1]?.endsWith("input-catalogue.ts")) {
  const exts = (process.argv[2] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const out: Record<string, { kind: InputKind; label: string }> = {};
  for (const ext of exts) out[ext] = catalogue(ext);
  process.stdout.write(JSON.stringify(out));
}
