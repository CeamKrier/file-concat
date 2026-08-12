export type EmptyKind = "image" | "archive" | "scanned" | "filtered" | "other";

/**
 * Which rescue a drop that combined nothing earns, from what was dropped and
 * how much of it is a scan. Tailored, because a lone .7z is an archive we can't
 * open, not "an image": scans first, then archives (a .7z reads as a binary
 * otherwise), then images, then a generic.
 *
 * Scans outrank everything because theirs is the only variant that is not a
 * dead end. A drop of nothing but scanned documents combines zero files and
 * lands on the empty state, so if this does not say "scanned", recognition is
 * unreachable in exactly the case it exists for. "filtered" comes next for the
 * same reason: readable files the filters ate are one drawer away from a
 * bundle, and calling them binary would be a lie with a dead end attached.
 *
 * Its own module, not `result-empty.tsx`: a component file that also exports a
 * function trips `react-refresh/only-export-components`.
 */
export function emptyKindFor(
  droppedFiles: string[],
  unreadDocumentCount: number,
  excludedReadableCount = 0,
): EmptyKind {
  if (droppedFiles.length === 0) return "other";
  if (unreadDocumentCount > 0) return "scanned";
  if (excludedReadableCount > 0) return "filtered";
  const ARCHIVE = /\.(7z|rar|zip|tar\.gz|tgz|tar|gz|bz2|xz)$/i;
  const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif|heic|heif|tiff?)$/i;
  if (droppedFiles.some((n) => ARCHIVE.test(n))) return "archive";
  const images = droppedFiles.filter((n) => IMAGE.test(n)).length;
  if (images > 0 && images >= droppedFiles.length / 2) return "image";
  return "other";
}
