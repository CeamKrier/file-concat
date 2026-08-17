export type EmptyKind = "image" | "recognisable" | "archive" | "scanned" | "filtered" | "other";

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
  offerableImageCount = 0,
): EmptyKind {
  if (droppedFiles.length === 0) return "other";
  if (unreadDocumentCount > 0) return "scanned";
  if (excludedReadableCount > 0) return "filtered";
  const ARCHIVE = /\.(7z|rar|zip|tar\.gz|tgz|tar|gz|bz2|xz)$/i;
  const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif|heic|heif|tiff?)$/i;
  if (droppedFiles.some((n) => ARCHIVE.test(n))) return "archive";
  // Images whose pixels might hold writing and that nobody has tried yet: an
  // offer, not a dead end (ADR-0017). Once a pass has been over them the count
  // is zero and the drop falls through to `image`, which is finally telling the
  // truth when it does — recognition looked and found nothing.
  if (offerableImageCount > 0) return "recognisable";
  const images = droppedFiles.filter((n) => IMAGE.test(n)).length;
  if (images > 0 && images >= droppedFiles.length / 2) return "image";
  return "other";
}

/**
 * The exclusion reasons a file can carry, as counter values. Keyed by the
 * wording `use-filter-state`'s `excludeReason` and core's `validateFile`
 * produce, because those are the two places a file is refused and neither has
 * anything shorter to hand.
 *
 * A slug rather than the wording itself for two reasons: `normalizeValue`
 * strips spaces, so `Matched ignore patterns` would land as
 * `matchedignorepatterns`, and a copy edit in the tree would otherwise rename a
 * counter value and silently split its history.
 */
const REASON_SLUGS: Record<string, string> = {
  "Outside include patterns": "include",
  "Matched ignore patterns": "ignore",
  "Matched .gitignore": "gitignore",
  "Excluded manually": "manual",
  "Hidden file": "hidden",
  "Binary file": "binary",
  "No extractable text": "no-text",
  "Couldn't extract text": "extract-error",
  "Password protected": "encrypted",
};

/**
 * One counter value for one refused file. Anything unmapped becomes `other`
 * rather than being dropped, so a reason added later still shows up as a
 * quantity worth chasing instead of vanishing from the total.
 */
export function emptyReasonSlug(reason: string | undefined): string {
  if (reason === undefined) return "other";
  return REASON_SLUGS[reason] ?? "other";
}
