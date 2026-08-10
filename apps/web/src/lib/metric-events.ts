/**
 * The complete set of product counters (ADR-0013, revised by ADR-0014), shared
 * by the browser client (`./metrics`) and the server sink (`../routes/api/e`).
 * Adding a counter is a deliberate two-sided change: a name recorded on one
 * side and missing from the other is silently dropped.
 *
 * Quantities are exact, not bucketed, and every counter below a `run` marker is
 * scoped to one **Run** (see `CONTEXT.md`): one drop and everything that
 * followed it. What never leaves the browser is unchanged: no file contents,
 * and no file *name* outside the published marker list.
 *
 * This module holds data only — no browser APIs, no imports — so pulling it into
 * the Cloudflare worker bundle costs nothing.
 */
export const METRIC_EVENTS = [
  /** Which of the tool-hosting routes the visit landed on. Once per page load. */
  "entry_surface",
  /** Which remote source was imported: github | gitlab | bitbucket | gist | url. */
  "source_used",

  // --- per run, written when ingestion finishes ---

  /**
   * The drop itself: `n` files totalling `b` bytes. Deliberately redundant with
   * `SUM(file_ext.n)` — it is the authoritative total, so a mismatch between the
   * two says extension rows went missing in transit rather than that the drop
   * was small.
   */
  "batch_size",
  /** Wall-clock milliseconds for one ingest, in `n`. Only useful beside `batch_size`. */
  "ingest_ms",
  /**
   * One row per file extension in the drop: `n` files totalling `b` bytes.
   * Capped at the most common few, remainder folded into `other` — folded, never
   * silently truncated, since a dropped tail reads as full coverage later.
   */
  "file_ext",
  /**
   * A filename from the published ecosystem marker list (`package.json`,
   * `go.mod`, …). Only membership is ever recorded, never a name from outside
   * the list. This is what says which ecosystem a drop came from without
   * carrying a single user-authored file name.
   */
  "marker",
  /** The largest single file in the drop, bytes in `b`. Sets the oversize-warning threshold. */
  "max_file_bytes",
  /** How many files exceeded a named threshold: value `1mb` | `10mb` | `32mb`, count in `n`. */
  "files_over",
  /** An extension whose bytes we could not turn into text at all. Drives which format to build next. */
  "unreadable_ext",
  /** A format we do support whose reader returned nothing (scanned or encrypted). The OCR business case. */
  "extract_failed",
  /** An archive we cannot open, by extension. */
  "archive_unsupported",

  // --- per run, written later ---

  /**
   * The produced bundle: `n` files totalling `b` bytes. Written when the bundle
   * first exists, **not** when it is exported, so an abandoned run still records
   * a size. Tying it to the export handler is what made "did they leave because
   * the bundle was too big" unanswerable.
   */
  "bundle_size",
  /** The terminal action: copy | download. May occur more than once per run. */
  "output_taken",
  /**
   * A format whose text OCR recovered after the ordinary reader returned
   * nothing: `n` files totalling `b` bytes. Recognition only ever runs over the
   * `extract_failed` set of the same Run, so the two are directly comparable and
   * what OCR could *not* rescue is their difference — no third counter needed.
   */
  "ocr_recovered",
  /** Wall-clock milliseconds for one recognition pass, in `n`. Only useful beside `ocr_recovered`. */
  "ocr_ms",
] as const;

export type MetricEvent = (typeof METRIC_EVENTS)[number];
