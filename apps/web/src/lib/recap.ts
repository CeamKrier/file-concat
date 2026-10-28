/**
 * This device's totals over its exported Runs, kept for the recap card
 * (Q118 O2) and sent only as a band (ADR-0019, amended 2026-10-28). Stored
 * beside the first-use date and bound to it: `./first-used` deletes these
 * totals whenever the date is rewritten or the visitor opts out.
 *
 * What is stored is counts: exports, files, tokens and files per extension.
 * Never a name, a path or any content. What leaves the browser is one label
 * per exported Run, `device_exports`, the band of the export total.
 */

import { RECAP_KEY, firstUsedOff } from "./first-used";

/** Distinct extensions kept; the rest fold into `other`. */
const EXT_LIMIT = 30;

export type RecapTotals = {
  exports: number;
  files: number;
  tokens: number;
  ext: Record<string, number>;
};
export type ExportsBand = "1" | "2-4" | "5-19" | "20+" | "off" | "none";

const isCount = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;

/** The stored totals, or empty ones when nothing valid is stored. */
export function readRecap(): RecapTotals {
  const empty: RecapTotals = { exports: 0, files: 0, tokens: 0, ext: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(RECAP_KEY) ?? "null") as Partial<RecapTotals> | null;
    if (!raw || !isCount(raw.exports) || !isCount(raw.files) || !isCount(raw.tokens)) return empty;
    const ext = raw.ext && typeof raw.ext === "object" ? raw.ext : {};
    if (!Object.values(ext).every(isCount)) return empty;
    return { exports: raw.exports, files: raw.files, tokens: raw.tokens, ext };
  } catch {
    return empty;
  }
}

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  return /^[a-z0-9]{1,16}$/.test(ext) ? ext : "none";
}

function band(exports: number): ExportsBand {
  if (exports <= 1) return "1";
  if (exports <= 4) return "2-4";
  if (exports <= 19) return "5-19";
  return "20+";
}

/** The last Run added, so a copy and then a download of one Run count once. */
let recordedRun: number | null = null;

/**
 * Adds one exported Run to the totals and returns the band to send, or null
 * when this Run was already counted.
 */
export function recordExport(
  run: number | null,
  paths: string[],
  tokens: number,
): ExportsBand | null {
  if (run !== null && run === recordedRun) return null;
  recordedRun = run;
  if (firstUsedOff() === true) return "off";
  try {
    const totals = readRecap();
    totals.exports += 1;
    totals.files += paths.length;
    totals.tokens += isCount(tokens) ? Math.round(tokens) : 0;
    for (const path of paths) {
      let key = extensionOf(path);
      if (!(key in totals.ext) && Object.keys(totals.ext).length >= EXT_LIMIT) key = "other";
      totals.ext[key] = (totals.ext[key] ?? 0) + 1;
    }
    localStorage.setItem(RECAP_KEY, JSON.stringify(totals));
    return band(totals.exports);
  } catch {
    return "none";
  }
}
