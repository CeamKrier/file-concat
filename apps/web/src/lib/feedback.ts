/**
 * A note someone chose to send from the result screen, shared by the browser
 * (`components/app/feedback-dock.tsx`) and the sink (`routes/api/feedback.ts`),
 * so the limits the textarea enforces are the limits the server checks.
 *
 * Data and validation only, no browser APIs, so the worker bundle pays nothing
 * for importing it.
 */
import { PAGE_ID_PATTERN } from "./metric-events";

/** Long enough for "the PDF came out empty, here is what ChatGPT said". */
export const FEEDBACK_MAX_CHARS = 2000;

/**
 * Where the panel was opened from: after a one-tap `yes` or `no`, from the empty
 * screen's note, or from the result screen's own link. A closed set, like a
 * counter value, so the column can be grouped without cleaning.
 */
export const FEEDBACK_ORIGINS = ["yes", "no", "empty", "link"] as const;
export type FeedbackOrigin = (typeof FEEDBACK_ORIGINS)[number];

/** Where someone can write instead when sending fails. */
export const FEEDBACK_EMAIL = "hello@ceamkrier.com";

/** The longest address SMTP delivers to. */
export const FEEDBACK_EMAIL_MAX = 254;

/**
 * The HTML spec's own check for `<input type="email">`, so an address the
 * field lets through is never refused here as a failed send.
 */
const EMAIL_PATTERN =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export type ValidFeedback = {
  page: string;
  run: number | null;
  origin: FeedbackOrigin;
  message: string;
  /** Only when someone asked for a reply. */
  email: string | null;
};

/** Wire shape: `s` page id, `r` run, `o` origin, `m` message, `e` reply address. */
export function validFeedback(raw: unknown): ValidFeedback | null {
  if (!raw || typeof raw !== "object") return null;
  const { s, r, o, m, e } = raw as Record<string, unknown>;

  if (typeof s !== "string" || !PAGE_ID_PATTERN.test(s)) return null;
  if (typeof o !== "string" || !(FEEDBACK_ORIGINS as readonly string[]).includes(o)) return null;
  if (typeof m !== "string") return null;
  // Rejected rather than cut: the textarea stops at the limit, so only a
  // hand-built request goes past it, and half a note reads as a whole one.
  const message = m.trim();
  if (message.length === 0 || message.length > FEEDBACK_MAX_CHARS) return null;

  let email: string | null = null;
  if (e !== undefined) {
    if (typeof e !== "string") return null;
    const address = e.trim();
    if (address.length > FEEDBACK_EMAIL_MAX) return null;
    if (address.length > 0 && !EMAIL_PATTERN.test(address)) return null;
    email = address || null;
  }

  const run = typeof r === "number" && Number.isInteger(r) && r >= 1 && r <= 1000 ? r : null;
  return { page: s, run, origin: o as FeedbackOrigin, message, email };
}
