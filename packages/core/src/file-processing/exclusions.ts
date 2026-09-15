import { isGenericUnreadableLabel, unreadableLabel } from "./unreadable-reason";

/**
 * A summary of the files left out of a bundle that represent **content gaps the
 * model cannot otherwise see** — the tree is built from included files only, so
 * a skipped file is invisible unless we name it (see ADR-0008). Noise (lock
 * files, `node_modules`, gitignored paths) and files the user deliberately
 * deselected are intentionally *not* represented here: mentioning them injects
 * false or useless context into the bundle.
 */
export interface ExcludedSummary {
  /** Left out for exceeding the size limit. */
  oversize?: string[];
  /** Document present, but no text could be extracted (scanned/encrypted). */
  unextractable?: string[];
  /** Image/binary file — can't be read as text. */
  binary?: string[];
  /**
   * Binary files whose kind is known and worth naming: a 97-2003 workbook, an
   * Outlook message, a font. Grouped by label so the note can say what was
   * there instead of "binary". Never overlaps `binary`.
   */
  unsupported?: { label: string; paths: string[] }[];
  /** Couldn't be read at all (rare; e.g. a CLI read error). */
  unreadable?: string[];
}

/** A file-status-shaped record: the path, why it was excluded, and whether it
 * ended up included. Matches both the web `FileStatus` and any ad-hoc list. */
export interface ExclusionInput {
  path: string;
  reason?: string;
  included?: boolean;
  /** Ingest's content verdict, when the caller has one. `binary` files are
   * bucketed on it, so a reason can say what the file is instead of "binary". */
  classification?: string;
}

/**
 * Bucket excluded files into the {@link ExcludedSummary} gap categories by their
 * reason string. Only the three content-gap reasons are kept — anything else
 * (`.gitignore`, include/ignore patterns, hidden files, "Excluded manually") is
 * dropped so the summary never reports noise or user curation. Included files
 * are skipped regardless of reason.
 */
export function summarizeExclusions(items: ExclusionInput[]): ExcludedSummary {
  const oversize: string[] = [];
  const unextractable: string[] = [];
  const binary: string[] = [];
  const unsupported = new Map<string, string[]>();

  for (const { path, reason, included, classification } of items) {
    if (included) continue;
    const r = reason ?? "";
    // Order matters: "extract" is checked before the broad "size"/"binary" so a
    // reason can only land in one bucket.
    if (/extract/i.test(r)) unextractable.push(path);
    else if (/exceed|size/i.test(r)) oversize.push(path);
    else if (classification === "binary" || /binary/i.test(r)) {
      const label = unreadableLabel(r);
      if (!label || isGenericUnreadableLabel(label)) {
        binary.push(path);
      } else {
        const group = unsupported.get(label);
        if (group) group.push(path);
        else unsupported.set(label, [path]);
      }
    }
  }

  const summary: ExcludedSummary = {};
  if (oversize.length) summary.oversize = oversize;
  if (unextractable.length) summary.unextractable = unextractable;
  if (binary.length) summary.binary = binary;
  if (unsupported.size) {
    summary.unsupported = [...unsupported].map(([label, paths]) => ({ label, paths }));
  }
  return summary;
}
