/**
 * Uncaught JavaScript errors, as a counter (ADR-0013).
 *
 * Nothing reported one before. `components/error-boundary.tsx` logs to a console
 * belonging to someone who is not us, and `extract_error` covers only a parser
 * that threw while reading a file, so a crash anywhere else was invisible. An
 * empty `js_error` table is the only thing that can say it is not happening.
 *
 * What leaves the browser is a fixed label, never a message. Messages carry
 * asset URLs, and a thrown string carries whatever the thrower put in it, so the
 * message is matched *here* and discarded and only the classification is sent.
 * The label space is closed by construction: three sources times a fixed list of
 * kinds.
 *
 * This is an alarm, not a diagnosis. What a nonzero count buys is knowing to go
 * open the Clarity recording for the visit.
 */

import { track } from "./metrics";

/** Where the error surfaced: a sync throw, an unhandled promise, a React render. */
export type ErrorSource = "error" | "rejection" | "boundary";

/**
 * The names that reach the wire as themselves. `Error.name` is a source-level
 * identifier rather than user content, but a minifier renaming a custom subclass
 * turns it into an unbounded label, and the privacy claim rests on the value
 * shape being closed rather than on each value looking harmless. Anything
 * outside this list is `other`.
 */
const KNOWN_KINDS: ReadonlySet<string> = new Set([
  "error",
  "typeerror",
  "rangeerror",
  "referenceerror",
  "syntaxerror",
  "urierror",
  "evalerror",
  "aggregateerror",
  // DOMException names worth telling apart. The first is a full local storage,
  // which is where settings live; the rest are what the browser refuses us
  // rather than what our code got wrong.
  "quotaexceedederror",
  "notallowederror",
  "aborterror",
  "securityerror",
  "networkerror",
  "notsupportederror",
  "datacloneerror",
]);

/**
 * A stale asset URL after a deploy. It is the one failure this app has actually
 * shipped, to the point that Google indexed an ErrorBoundary rendering "Failed
 * to fetch dynamically imported module" as the site description, and it arrives
 * as an ordinary TypeError. Classified by name alone it would disappear into the
 * most common kind there is. Every browser words it differently and none of the
 * wordings leaves here.
 */
const CHUNK_MESSAGE = /dynamically imported module|importing a module script|loading chunk/i;

/**
 * What a cross-origin script error looks like from here: no error object and a
 * message the browser has already stripped. Worth its own label rather than
 * `other`, because the two ask for opposite things. `foreign` is Clarity or a
 * font failing and there is nothing of ours to fix.
 */
const FOREIGN_MESSAGE = "Script error.";

/**
 * One row per distinct label per page load. A render loop throws the same error
 * hundreds of times, and hundreds of identical rows would read as "this is
 * common" when it means "this is tight". The number worth having is how many
 * visits hit a kind at all, which is what a row count already is.
 */
const seen = new Set<string>();

let installed = false;

function classify(cause: unknown, message: string): string {
  if (CHUNK_MESSAGE.test(message)) return "chunk";
  if (message === FOREIGN_MESSAGE) return "foreign";
  if (!(cause instanceof Error)) return "other";
  const name = cause.name.toLowerCase();
  return KNOWN_KINDS.has(name) ? name : "other";
}

/**
 * Record one error. Exported because a render error React caught never reaches
 * `window`, so the boundary has to hand it over itself.
 *
 * Carries whatever Run is open (`track` attaches it), which is what separates an
 * error belonging to a drop from one belonging to the page around it.
 */
export function recordError(source: ErrorSource, cause: unknown, message?: string): void {
  const text = message ?? (cause instanceof Error ? cause.message : "");
  const value = `${source}/${classify(cause, text)}`;
  if (seen.has(value)) return;
  seen.add(value);
  track("js_error", value);
}

/**
 * Attaches the listeners. Called from the client entry rather than from a
 * component, so an error thrown during hydration is already counted: that is
 * exactly when a stale chunk fails.
 *
 * Deliberately not `{ capture: true }`. Resource load failures do not bubble, so
 * a 404 on an image or a third-party script an ad blocker ate never reaches
 * these, and none of those are ours to fix.
 */
export function installErrorCounter(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    recordError("error", event.error, event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    recordError("rejection", event.reason);
  });
}
