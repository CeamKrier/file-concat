import { COMPILED_LABEL, GENERIC_UNREADABLE_LABEL, unreadableLabel } from "@fileconcat/core";

export type EmptyKind =
  | "image"
  | "recognisable"
  | "guessed"
  | "speech"
  | "archive"
  | "scanned"
  | "filtered"
  | "pruned"
  | "other";

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
  prunedCount = 0,
  offerableMediaCount = 0,
  guessedImageCount = 0,
): EmptyKind {
  // Nothing was read. Either nothing was dropped, or all of it was turned
  // away at the door (a build tree, a fonts folder); calling the second one
  // "binary" would describe files nobody opened.
  if (droppedFiles.length === 0) return prunedCount > 0 ? "pruned" : "other";
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
  // Audio or a video with no subtitle track, not yet transcribed: the same
  // offer, heard rather than seen (D5).
  if (offerableMediaCount > 0) return "speech";
  // Read, but under the confidence floor: the text is there to include, so this
  // is still not a dead end (Q134 O3).
  if (guessedImageCount > 0) return "guessed";
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
 *
 * A binary file's reason now says what kind it is ("Excel 97-2003 workbook.
 * Save it as .xlsx ...") and no longer reads "Binary file", so the verdict is
 * taken from the classification when the caller has one. The counter value
 * stays `binary`, and its history stays one series.
 */
export function emptyReasonSlug(reason: string | undefined, classification?: string): string {
  if (classification === "binary") return "binary";
  if (reason === undefined) return "other";
  return REASON_SLUGS[reason] ?? "other";
}

/**
 * Why a file nobody could read was left out, in the order the empty screen
 * lists the groups: what the person can fix first, what nobody can last. The
 * codes are also the `unreadable_reason` counter values.
 */
export const UNREADABLE_CODES = ["encrypted", "damaged", "no-reader", "compiled", "no-text", "binary", "read-failed"] as const;
export type UnreadableCode = (typeof UNREADABLE_CODES)[number];

export interface UnreadableGroup {
  code: UnreadableCode;
  label: string;
  files: { name: string; why: string }[];
}

const GROUP_LABELS: Record<UnreadableCode, string> = {
  encrypted: "Encrypted",
  damaged: "Damaged",
  "no-reader": "No reader here",
  compiled: "Compiled",
  "no-text": "No text inside",
  binary: "Not text",
  "read-failed": "Could not be read",
};

const READ_FAILED = "Your browser could not read it. It may have moved or be open in another program.";

/**
 * Every file left out because it could not be read, grouped by why, each with
 * the line that says what it is and what would get it read. Files a filter
 * left out are not here: they are readable, and the drawer is their way back.
 */
export function unreadableGroups(
  validations: Record<string, { included: boolean; reason?: string; classification?: string; controlShare?: number }>,
  failed: readonly { path: string }[],
): UnreadableGroup[] {
  const groups = new Map<UnreadableCode, { name: string; why: string }[]>();
  const add = (code: UnreadableCode, path: string, why: string) => {
    const name = path.split("/").pop() ?? path;
    const files = groups.get(code) ?? [];
    files.push({ name, why });
    groups.set(code, files);
  };
  for (const [path, v] of Object.entries(validations)) {
    const row = v.included ? null : describe(path, v);
    if (row) add(row.code, path, row.why);
  }
  for (const { path } of failed) add("read-failed", path, READ_FAILED);
  return UNREADABLE_CODES.filter((code) => groups.has(code)).map((code) => ({
    code,
    label: GROUP_LABELS[code],
    files: groups.get(code)!,
  }));
}

function describe(
  path: string,
  v: { reason?: string; classification?: string; controlShare?: number },
): { code: UnreadableCode; why: string } | null {
  const { reason } = v;
  if (reason === "Password protected") {
    return { code: "encrypted", why: "Encrypted or copy-protected. Remove the password or protection, then drop it again." };
  }
  if (reason === "Couldn't extract text") {
    const dot = path.lastIndexOf(".");
    const format = dot > path.lastIndexOf("/") + 1 ? `${path.slice(dot + 1).toUpperCase()} ` : "";
    return { code: "damaged", why: `Damaged ${format}file. It would not open here or, most likely, anywhere.` };
  }
  if (reason === "No extractable text") return { code: "no-text", why: "It opened, but there is no text in it." };
  if (v.classification !== "binary" || !reason) return null;
  const label = unreadableLabel(reason);
  if (label === COMPILED_LABEL) {
    return { code: "compiled", why: "Compiled code or build output. Drop the source files instead." };
  }
  if (label === GENERIC_UNREADABLE_LABEL) {
    const why =
      v.controlShare === undefined
        ? "Not text: its first 8 KB hold control bytes no text file contains."
        : `Not text: ${Math.round(v.controlShare * 100)}% of its first 8 KB are control bytes no text file contains.`;
    return { code: "binary", why };
  }
  return { code: "no-reader", why: reason };
}
