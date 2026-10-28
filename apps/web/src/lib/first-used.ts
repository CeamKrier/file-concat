/**
 * How long ago this device first opened the tool, as one coarse band (ADR-0019,
 * amending ADR-0013's "no device-side storage"). The only cross-visit signal the
 * counters have: the page id still dies with the page, so the band says "seen
 * before, roughly this long ago" and never which earlier visit.
 *
 * Mozilla Glean's `first_run_date` pattern under the CNIL audience-measurement
 * conditions: a day-precision date written once and never refreshed by a visit,
 * a 13-month lifetime, an opt-out on `/privacy`, and Global Privacy Control
 * honoured. The date never leaves the browser; only the band does.
 */

const KEY = "fileconcat-first-used";
const OFF_KEY = "fileconcat-first-used-off";
const DAY_MS = 24 * 60 * 60 * 1000;
/** 13 months. Past it the date is replaced, never extended by a visit. */
const LIFETIME_DAYS = 395;

export type FirstUsedBand = "new" | "d0" | "d1-7" | "d8-30" | "d31+" | "off" | "none";

function gpc(): boolean {
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

/**
 * The band for this page load. Writes today's date when none is stored, and
 * reads nothing at all when the visitor opted out or sends GPC.
 */
export function firstUsedBand(now = new Date()): FirstUsedBand {
  if (gpc()) return "off";
  try {
    if (localStorage.getItem(OFF_KEY) === "1") return "off";
    const today = now.toISOString().slice(0, 10);
    const stored = localStorage.getItem(KEY) ?? "";
    // A malformed or future value reads as NaN or negative: treated as absent.
    const age = /^\d{4}-\d{2}-\d{2}$/.test(stored)
      ? (Date.parse(today) - Date.parse(stored)) / DAY_MS
      : Number.NaN;
    if (!(age >= 0)) {
      localStorage.setItem(KEY, today);
      return "new";
    }
    if (age > LIFETIME_DAYS) localStorage.setItem(KEY, today);
    if (age === 0) return "d0";
    if (age <= 7) return "d1-7";
    if (age <= 30) return "d8-30";
    return "d31+";
  } catch {
    return "none";
  }
}

/** Null when storage is unavailable, so the control can say so. */
export function firstUsedOff(): boolean | null {
  if (gpc()) return true;
  try {
    return localStorage.getItem(OFF_KEY) === "1";
  } catch {
    return null;
  }
}

export function setFirstUsedOff(off: boolean): void {
  try {
    if (off) {
      localStorage.setItem(OFF_KEY, "1");
      localStorage.removeItem(KEY);
    } else {
      localStorage.removeItem(OFF_KEY);
    }
  } catch {
    // Storage blocked: nothing is stored, which is what off means anyway.
  }
}

/** Whether the browser itself asked not to be tracked; the control cannot override it. */
export function firstUsedByGpc(): boolean {
  return gpc();
}
