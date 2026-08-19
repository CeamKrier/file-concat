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
   * How many files the bundle already held when an append landed, in `n`.
   * Written only by an append, so its row count is how often one happened, and
   * `n = 0` is an append that had nothing to append to — a replace wearing
   * another name. That distinction is the whole question the affordance raises:
   * whether clippings and dropped files genuinely end up in one bundle, or
   * whether people still start over every time.
   */
  "append_to",
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
  /**
   * An extension whose bytes we could not turn into text at all. Drives which
   * format to build next.
   *
   * Written **at ingest**, before recognition is even offered, so an image this
   * Run later reads still sits in here. That is deliberate — the series has to
   * stay comparable across the build that added image recognition — but it means
   * this is never the count of what stayed unread. `ocr_read` is.
   */
  "unreadable_ext",
  /** A format we do support whose reader returned nothing (scanned or encrypted). The OCR business case. */
  "extract_failed",
  /**
   * Why a reader failed, for the subset of `extract_failed` where it **threw**
   * rather than answering with empty text: value `encrypted` | `error`.
   *
   * A strict subset, deliberately, so nothing about the existing series changes
   * and the history stays comparable: `extract_failed` still counts every file
   * no reader could turn into text. What this adds is the split the OCR
   * business case needs, because **only the empty half can ever be a scan** —
   * recognition cannot open a locked document, and until this existed the two
   * populations were one number.
   */
  "extract_error",
  /**
   * What a reader could not recover from a document it *did* open: value is one
   * of the ADR-0008 note kinds (`pages-skipped`, `attachments-skipped`,
   * `ocr-failed`, `cdn-fallback`, `parser-unavailable`), `n` the documents
   * carrying it.
   *
   * Orthogonal to `extract_failed`, not a subset of it: most of these are
   * written for a document that came back with text, and say which part of it
   * did not. Counted once per document rather than once per lost page, so one
   * fifty-page failure cannot outweigh a format that fails on one document in
   * ten.
   *
   * `cdn-fallback` is the one to watch rather than to tally: it means the
   * self-hosted pdf.js worker did not load and the library fetched one from a
   * CDN instead, which is a third-party request `/privacy` does not describe.
   * A single row is a defect, not a distribution.
   */
  "extract_note",
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
   * A format whose text recognition recovered: `n` files totalling `b` bytes.
   *
   * This used to say that recognition ran over exactly the `extract_failed` set
   * of the same Run, so what it could not rescue was their difference and no
   * third counter was needed. **That is no longer true.** Images never reach the
   * extract branch and their pass does not start by itself (ADR-0017), so for an
   * image format the difference would fold "never pressed" together with
   * "pressed, found nothing" — the one distinction that decides what to do next.
   * For image formats read `ocr_offered` / `ocr_read` / this, in that order. The
   * document half of the series is unchanged.
   */
  "ocr_recovered",
  /** Wall-clock milliseconds for one recognition pass, in `n`. Only useful beside `ocr_recovered`. */
  "ocr_ms",
  /**
   * The language a recognition pass read in, as its tesseract code (`eng`,
   * `tur`, …). Written once **per pass**, not per Run: an override makes a Run
   * write this twice, once for the guess and once for the correction.
   */
  "ocr_lang",
  /**
   * The language someone switched **to** after seeing an automatic reading, as
   * its tesseract code. Written only on a deliberate override, so this is how
   * often the guess taken from the browser's own settings was wrong.
   *
   * **The denominator is Runs that recognised anything, not `SUM(ocr_lang.n)`**
   * — an override inflates that sum by the very event being measured, so
   * dividing by it understates the miss rate. Count distinct Runs carrying an
   * `ocr_lang` row instead.
   *
   * A lower bound either way: it counts the people who noticed and acted, never
   * the ones who took a bad reading and left.
   */
  "ocr_lang_changed",
  /**
   * An image recognition was **offered** over, by format (`png`, `jpeg`, …):
   * `n` files totalling `b` bytes. Written once per Run at the end of ingest,
   * over every image the router named as a candidate — whether or not anyone
   * then pressed anything.
   *
   * The denominator for `ocr_read`, and the whole bet ADR-0017 rests on: an
   * offer nobody takes is not answered by a better recogniser.
   */
  "ocr_offered",
  /**
   * An image a recognition pass actually **opened**, by format: `n` files
   * totalling `b` bytes. A strict subset of `ocr_offered` in the same Run.
   *
   * Images only, so the ratio to `ocr_offered` means something. Documents are
   * never offered — their pass starts by itself — and are counted by
   * `ocr_recovered` alone.
   */
  "ocr_read",
  /**
   * How confident tesseract was in a reading, as a band of ten (`0`, `10`, …
   * `90`), `n` readings each. Written per image read, kept or rejected, since
   * the rejections are exactly what says whether the floor sits in the right
   * place.
   *
   * Banded rather than exact, unlike every other quantity here (ADR-0014): a
   * mean confidence is already an average over words, so its last digit carries
   * nothing, and a band keeps the row count at ten however many images a Run
   * brings.
   */
  "ocr_conf",
  /**
   * Why a Run that dropped files combined none of them: one row per exclusion
   * reason, `n` files each. Written once per Run, and only when the bundle came
   * out empty.
   *
   * The absence of `bundle_size` already says a Run reached the empty screen; it
   * cannot say what emptied it, and the three subtractions (`include`, `ignore`,
   * `gitignore`) are indistinguishable from outside. Without this, a drop the
   * default noise list ate and a drop of nothing but scans are the same row.
   *
   * Values are the slugs in `components/app/empty-kind.ts`, not the tree's
   * wording — the copy is free to change without renaming a counter value.
   */
  "empty_reason",
] as const;

export type MetricEvent = (typeof METRIC_EVENTS)[number];
