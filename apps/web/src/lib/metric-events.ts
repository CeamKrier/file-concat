/**
 * The complete set of product counters (ADR-0013), shared by the browser client
 * (`./metrics`) and the server sink (`../routes/api/e`). Adding a counter is a
 * deliberate two-sided change: a name recorded on one side and missing from the
 * other is silently dropped.
 *
 * This module holds data only — no browser APIs, no imports — so pulling it into
 * the Cloudflare worker bundle costs nothing.
 */
export const METRIC_EVENTS = [
  /** An extension whose bytes we could not turn into text at all. Drives which format to build next. */
  "unreadable_ext",
  /** A format we do support whose reader returned nothing (scanned or encrypted). The OCR business case. */
  "extract_failed",
  /** Which remote source was imported: github | gitlab | bitbucket | gist | url. */
  "source_used",
  /** An archive we cannot open, by extension. */
  "archive_unsupported",
  /** How many files arrived in one batch, as a bucket. */
  "batch_size",
  /** How large the produced bundle was, as a bucket. */
  "bundle_size",
  /** Which of the tool-hosting routes the visit landed on. */
  "entry_surface",
  /** The terminal action: copy | download. */
  "output_taken",
] as const;

export type MetricEvent = (typeof METRIC_EVENTS)[number];
