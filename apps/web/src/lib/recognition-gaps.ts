import type { ExclusionInput } from "@fileconcat/core";

interface Tried {
  included?: boolean;
  reason?: string;
  classification?: string;
  recognitionTried?: boolean;
}

/**
 * The files a recognition pass opened and got nothing from. The pass takes
 * their entry out of the set, so they have no file status and the bundle's
 * note (ADR-0008) would not name them: a model would not know they existed.
 * `listed` holds the paths that already have a status.
 */
export function recognitionGaps(
  unread: readonly { path: string }[],
  validations: Readonly<Record<string, Tried | undefined>>,
  listed: ReadonlySet<string>,
): ExclusionInput[] {
  const gaps: ExclusionInput[] = [];
  for (const { path } of unread) {
    const v = validations[path];
    if (listed.has(path) || !v?.recognitionTried || v.included) continue;
    gaps.push({ path, reason: v.reason, included: false, classification: v.classification });
  }
  return gaps;
}
