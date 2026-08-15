import { useCallback, useRef, useState } from "react";
import type {
  DownloadProgress,
  ProcessingConfig,
  SourceType,
  TextClassification,
} from "@fileconcat/core";
import {
  defaultSourceRegistry,
  isPasswordProtected,
  readFileAsText,
  validateFile,
} from "@fileconcat/core";

import { collectFromDataTransfer } from "~/lib/collect-from-drop";
import { markerFor } from "~/lib/ecosystem-markers";
import { addToTally, startRun, track, trackAmount, trackTally, type Tally } from "~/lib/metrics";
import { tagDrop, tagSource } from "~/lib/clarity-tags";
import { readWithOcr } from "~/lib/ocr";
import { browserOcrLanguage, ocrLanguageFor, type OcrLanguage } from "~/lib/ocr-language";
import { parsers } from "~/lib/parsers";
import { prepareBatch } from "~/lib/prepare-batch";

/** Final extension, lowercased — the only thing a counter ever carries from a path. */
function extensionOf(path: string): string {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Extensionless files are a real category, and the empty string is not a valid counter value. */
const NO_EXTENSION = "none";

const MB = 1024 * 1024;
/**
 * Cumulative on purpose: a 40 MB file counts in all three. These are the reading
 * that decides where the oversize warning belongs, so "how many files are over
 * 1 MB" has to include the ones that are far over it.
 */
const SIZE_THRESHOLDS = [
  ["1mb", MB],
  ["10mb", 10 * MB],
  ["32mb", 32 * MB],
] as const;
type SizeThreshold = (typeof SIZE_THRESHOLDS)[number][0];

// Directories that never make it into memory. These are not user-editable;
// dropping their contents into a browser tab would crash the page long before
// any pattern could filter them. Everything else honors the live filter rail.
const HARDCODED_PRUNE_DIRS = new Set([".git", "node_modules"]);

export type ContentEntry = { path: string; content: string };

export type ValidationRecord = {
  included: boolean;
  reason?: string;
  /** text / binary / ambiguous — undefined when binary checking is off. */
  classification?: TextClassification;
  size: number;
  type: string;
  /** True when this entry's content is text pulled out of an extractable
   * document (PDF/Office/ODF) rather than the file's own bytes (ADR-0003). */
  extracted?: boolean;
  /**
   * True once recognition has actually opened this document, whatever came of
   * it. Ingest cannot set this: every scan is recorded as holding no text long
   * before recognition gets a chance to disagree. The distinction is what lets
   * a stopped pass say "not read yet" instead of "the page is blank".
   */
  recognitionTried?: boolean;
};

export type IncomingFile = {
  file: File;
  path?: string;
  content?: string;
};

export type FailedFile = { path: string; error: string };

/**
 * A document we know how to open but found no text in — a scan, or an encrypted
 * PDF. Recognition can sometimes read the first kind, so the handle is kept
 * rather than discarded with the rest of the batch. A `File` is a reference to
 * bytes on disk, not the bytes themselves, so holding a few costs nothing.
 */
export type ScannedDocument = { path: string; format: string; file: File };

/**
 * The formats where "no text came out" can honestly mean "the page is a
 * picture". A scan is a photograph of a page, so it arrives inside a
 * page-shaped document.
 *
 * A spreadsheet with no cells is empty, not scanned, and the same goes for an
 * .eml with no body or a subtitle file with no cues. Sending one to recognition
 * costs a 5 MB language download to read nothing, and — worse — standing in the
 * scanned list is what makes the empty screen say "these pages are pictures"
 * about a workbook. Formats absent here still surface as "no extractable text";
 * they just stop being offered a rescue that cannot apply.
 */
const SCANNABLE_FORMATS = new Set(["pdf", "docx", "pptx", "odt", "odp", "rtf"]);

export type IngestPhase = "unpacking" | "reading" | "fetching" | "recognising";
/**
 * Live progress for the processing view. `total === 0` means indeterminate.
 * `note` is the current coarse stage ("Listing files", "Downloading files")
 * shown while a numeric total isn't known yet, so the spinner is never silent.
 */
export type IngestProgress = {
  phase: IngestPhase;
  done: number;
  total: number;
  note?: string;
} | null;

export interface FileIngestion {
  entries: ContentEntry[];
  validations: Record<string, ValidationRecord>;
  failedFiles: FailedFile[];
  /**
   * Every document in this Run that opened with no text in it, recovered or
   * not. Kept whole so a re-read in another language can go back over the ones
   * recognition already read, not just the ones it failed on.
   */
  scannedDocuments: ScannedDocument[];
  /** The subset of {@link scannedDocuments} still not readable. */
  unreadDocuments: ScannedDocument[];
  /** True while a recognition pass is running. */
  isReading: boolean;
  /** Recognition progress, or null when idle. */
  readProgress: { done: number; total: number } | null;
  /**
   * How many documents recognition has rescued in this Run. Derived rather than
   * counted, so a re-read that loses a document is reflected without a second
   * source of truth. Lives here rather than in the card that reports it,
   * because a scan-only drop moves from the empty state to the result the
   * moment the first one is read — the card unmounts, and a count held inside
   * it would take the confirmation with it.
   */
  recoveredDocuments: number;
  sourceUrl: string | null;
  isProcessing: boolean;
  isRepoLoading: boolean;
  processingStatus: string;
  isDragging: boolean;
  /** True when the last batch unpacked at least one archive. */
  expandedArchive: boolean;
  /** Live read/fetch progress for the processing view, or null when idle. */
  progress: IngestProgress;
  /**
   * Re-read {@link unreadDocuments} with recognition and fold whatever it
   * recovers into the bundle. Resolves to how many documents became readable.
   * A batch starts this on its own; this is the way back in after a stop.
   */
  readUnreadDocuments: () => Promise<number>;
  /**
   * Read the named scanned documents again in a language of the caller's
   * choosing, replacing what an earlier pass produced for them. The way out
   * when the language guessed from the browser was the wrong one, and — via
   * the subset — the way out when one document in the drop is in a different
   * language from the rest.
   */
  readSelected: (paths: readonly string[], locale: string) => Promise<number>;
  /** Abandon the rest of a recognition pass. Whatever was read stays read. */
  stopReading: () => void;
  /**
   * True when the last pass ended because it was stopped, not because it ran
   * out of documents. The difference is what the remaining documents mean:
   * never tried, versus tried and unreadable.
   */
  stoppedReading: boolean;
  /** The language the last pass read in, or null before one has run. */
  readLanguage: OcrLanguage | null;
  /**
   * The language each recovered document was actually read in, by path.
   *
   * Not the same thing as {@link readLanguage} once a pass can cover a subset:
   * read a drop as Turkish and then one document again as English, and the last
   * pass's language describes exactly one of them. Attributing the whole set to
   * it would be a plain untruth on the summary card.
   */
  readLanguages: Record<string, OcrLanguage>;
  ingestBatch: (incoming: IncomingFile[]) => Promise<void>;
  ingestRepo: (url: string, sourceType: SourceType, signal: AbortSignal) => Promise<void>;
  setEntryContent: (path: string, content: string) => void;
  handleFileInput: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleDragEnter: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => Promise<void>;
  reset: () => void;
}

export function useFileIngestion(config: ProcessingConfig): FileIngestion {
  const [entries, setEntries] = useState<ContentEntry[]>([]);
  const [validations, setValidations] = useState<Record<string, ValidationRecord>>({});
  const [failedFiles, setFailedFiles] = useState<FailedFile[]>([]);
  const [scannedDocuments, setScannedDocuments] = useState<ScannedDocument[]>([]);
  const [unreadDocuments, setUnreadDocuments] = useState<ScannedDocument[]>([]);
  const [isReading, setIsReading] = useState(false);
  const [readProgress, setReadProgress] = useState<{ done: number; total: number } | null>(null);
  const recoveredDocuments = scannedDocuments.length - unreadDocuments.length;
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRepoLoading, setIsRepoLoading] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [expandedArchive, setExpandedArchive] = useState(false);
  const [progress, setProgress] = useState<IngestProgress>(null);
  const dragCounter = useRef(0);
  const readingRef = useRef(false);
  const stopRef = useRef(false);
  const [stoppedReading, setStoppedReading] = useState(false);
  const [readLanguage, setReadLanguage] = useState<OcrLanguage | null>(null);
  const [readLanguages, setReadLanguages] = useState<Record<string, OcrLanguage>>({});

  /**
   * Read the documents ingestion could not, with recognition this time, and put
   * whatever comes back into the bundle.
   *
   * Sequential on purpose. The recogniser keeps its own worker pool and a page
   * takes seconds; racing whole documents at it would multiply peak memory for
   * a total that is bounded by the same engine either way, and would make the
   * progress count meaningless.
   *
   * Takes its work and its language as arguments rather than reading state, so
   * a batch can start this the moment it knows what failed, without waiting a
   * render for the state to land.
   *
   * The result is authoritative for every document it was given: one that reads
   * joins the bundle, one that does not is taken back out of it. That is what
   * makes a re-read in another language safe to run over documents an earlier
   * pass already recovered.
   */
  const readDocuments = useCallback(
    async (documents: readonly ScannedDocument[], language: OcrLanguage) => {
      // A ref, not `isReading`: the auto-start fires from inside the ingest that
      // produced the work, where a state read is a render behind.
      if (documents.length === 0 || readingRef.current) return 0;
      readingRef.current = true;
      stopRef.current = false;
      setStoppedReading(false);
      const startedAt = performance.now();
      setIsReading(true);
      setReadProgress({ done: 0, total: documents.length });
      // Also on the ingest channel, because a batch awaits this: recognition is
      // the last stage of the drop, not something happening behind a result that
      // already claims to be ready.
      setProgress({ phase: "recognising", done: 0, total: documents.length });
      // Held for the whole pass, so every document is read the same way and the
      // name reported afterwards is the one that was actually used.
      setReadLanguage(language);

      const recovered: Tally = new Map();
      const readEntries: ContentEntry[] = [];
      const stillUnread: ScannedDocument[] = [];
      const readValidations: Record<string, ValidationRecord> = {};
      // The documents this pass actually opened. Everything else it was given
      // is left exactly as it was — see the merge below for why that matters.
      const attempted = new Set<string>();

      try {
        for (let i = 0; i < documents.length; i++) {
          const document = documents[i];
          // Checked between documents, not inside one: the recogniser has no
          // cancel of its own, so the page in hand always finishes. Stopping
          // keeps everything read so far and leaves the rest untouched.
          if (stopRef.current) {
            setStoppedReading(true);
            break;
          }
          attempted.add(document.path);
          try {
            const bytes = new Uint8Array(await document.file.arrayBuffer());
            const { text } = await readWithOcr(bytes, language.code);
            if (text) {
              addToTally(recovered, document.format, document.file.size);
              readEntries.push({ path: document.path, content: text });
              readValidations[document.path] = {
                included: true,
                classification: "text",
                size: document.file.size,
                type: document.file.type || "application/octet-stream",
                extracted: true,
              };
            } else {
              // Recognition found nothing: an encrypted PDF, a page with no
              // writing on it, or a language this pass read it in cannot see.
              stillUnread.push(document);
              readValidations[document.path] = {
                included: false,
                reason: "No extractable text",
                classification: "binary",
                size: document.file.size,
                type: document.file.type || "application/octet-stream",
                recognitionTried: true,
              };
            }
          } catch (error) {
            console.error(`Recognition failed for ${document.path}:`, error);
            stillUnread.push(document);
            readValidations[document.path] = {
              included: false,
              reason: "Couldn't be read",
              classification: "binary",
              size: document.file.size,
              type: document.file.type || "application/octet-stream",
              recognitionTried: true,
            };
          }
          setReadProgress({ done: i + 1, total: documents.length });
          setProgress({ phase: "recognising", done: i + 1, total: documents.length });
        }

        // Replace in place where a path is already in the bundle (a re-read),
        // append where it is not (the first pass), and drop what this pass could
        // not read so a second language never leaves the first one's text behind.
        const failed = new Set(stillUnread.map((d) => d.path));
        setEntries((prev) => {
          const byPath = new Map(readEntries.map((e) => [e.path, e]));
          const kept = prev.filter((e) => !failed.has(e.path)).map((e) => byPath.get(e.path) ?? e);
          const present = new Set(kept.map((e) => e.path));
          return [...kept, ...readEntries.filter((e) => !present.has(e.path))];
        });
        setValidations((prev) => ({ ...prev, ...readValidations }));
        // Which language each document ended up read in, so a scoped pass never
        // relabels the ones it did not touch. Documents this pass lost drop out.
        setReadLanguages((prev) => {
          const next = { ...prev };
          for (const path of attempted) delete next[path];
          for (const entry of readEntries) next[entry.path] = language;
          return next;
        });
        // Merged, not replaced. A pass now runs over a chosen subset, so the
        // documents it was never given have to keep the standing they already
        // had — replacing the list would quietly rescue every document this
        // pass did not look at. Same reason `attempted` and not `documents`:
        // a stop leaves the tail untouched rather than failed, so stopping a
        // re-read can no longer throw away an earlier pass's good text.
        setUnreadDocuments((prev) => [
          ...prev.filter((d) => !attempted.has(d.path)),
          ...stillUnread,
        ]);

        // What recognition rescued, against the `extract_failed` rows of the same
        // Run — the two together are what says whether this was worth building.
        trackAmount("ocr_ms", { n: performance.now() - startedAt });
        trackTally("ocr_recovered", recovered);
        track("ocr_lang", language.code);
        return readEntries.length;
      } finally {
        readingRef.current = false;
        stopRef.current = false;
        setIsReading(false);
        setReadProgress(null);
      }
    },
    [],
  );

  const ingestBatch = useCallback(
    async (incoming: IncomingFile[]) => {
      const startedAt = performance.now();
      // Everything recorded below belongs to this Run (ADR-0014): one drop and
      // everything that follows it until the next drop replaces it.
      startRun();

      // One pass decides every file's route from its own leading bytes and
      // unpacks the archives among them (ADR-0011), so nothing below sniffs a
      // file twice.
      const { files: routed, expandedCount, unsupported } = await prepareBatch(incoming);
      setExpandedArchive(expandedCount > 0);

      const nextEntries: ContentEntry[] = [];
      const nextValidations: Record<string, ValidationRecord> = {};
      const nextFailed: FailedFile[] = [];
      // Counters accumulate per extension and are reported once at the end
      // (ADR-0014): a folder of 200 screenshots is one `png` row carrying its
      // count and byte total, not two hundred rows. Row count therefore scales
      // with extension variety, which is bounded, and not with file count.
      const extensions: Tally = new Map();
      const unreadable: Tally = new Map();
      const extractFailed: Tally = new Map();
      const extractError: Tally = new Map();
      const nextUnread: ScannedDocument[] = [];
      const archiveUnsupported: Tally = new Map();
      const markers = new Set<string>();
      let totalBytes = 0;
      let maxFileBytes = 0;
      const overThresholds: Record<SizeThreshold, number> = { "1mb": 0, "10mb": 0, "32mb": 0 };

      for (const extension of unsupported) {
        addToTally(archiveUnsupported, extension || NO_EXTENSION);
      }

      const total = routed.length;
      // Cap re-renders at ~100 progress ticks regardless of how large the drop is.
      const tick = Math.max(1, Math.floor(total / 100));
      setProgress({ phase: "reading", done: 0, total });

      for (let i = 0; i < total; i++) {
        const { item: entry, path, route } = routed[i];

        // Composition of the drop, recorded for every file whatever happens to
        // it below. The extension and the size are the whole payload; the name
        // that carried them is only ever tested against the published marker
        // list, never sent (ADR-0014).
        const fileBytes = entry.file.size;
        totalBytes += fileBytes;
        if (fileBytes > maxFileBytes) maxFileBytes = fileBytes;
        for (const [label, bound] of SIZE_THRESHOLDS) {
          if (fileBytes > bound) overThresholds[label] += 1;
        }
        addToTally(extensions, extensionOf(path) || NO_EXTENSION, fileBytes);
        const marker = markerFor(path);
        if (marker !== null) markers.add(marker);

        const tickProgress = () => {
          if ((i + 1) % tick === 0 || i + 1 === total) {
            setProgress({ phase: "reading", done: i + 1, total });
          }
        };

        // A document container: pull the text out and include *that*, instead
        // of classifying the container's raw bytes (ADR-0003). Which parser to
        // load came from the bytes, not the filename, so a renamed `.docx` and
        // an extensionless PDF both land here.
        if (route.kind === "extract") {
          const size = entry.file.size;
          const type = entry.file.type || "application/octet-stream";
          // No size gate. A big PDF used to be skipped here before extraction,
          // and because nothing was pushed to `nextEntries` it never reached
          // the tree either — invisible and un-re-includable, the worst shape
          // a drop can take. Weight is reported after the fact instead.
          try {
            const bytes = new Uint8Array(await entry.file.arrayBuffer());
            const { text } = await parsers.extract(route.parserId, bytes);
            if (text) {
              nextEntries.push({ path, content: text });
              nextValidations[path] = {
                included: true,
                classification: "text",
                size,
                type,
                extracted: true,
              };
            } else {
              // No recoverable text (scanned image-only or encrypted PDF, or
              // a format this build ships no reader for) — surfaced as
              // excluded, never silently dropped.
              addToTally(extractFailed, route.format, size);
              // Keep the handle: this is the shape recognition can sometimes
              // read, and re-reading needs the bytes we are about to drop. Only
              // for a format that could be a scan in the first place.
              if (SCANNABLE_FORMATS.has(route.format)) {
                nextUnread.push({ path, format: route.format, file: entry.file });
              }
              nextValidations[path] = {
                included: false,
                reason: "No extractable text",
                classification: "binary",
                size,
                type,
              };
            }
          } catch (error) {
            console.error(`Failed to extract ${path}:`, error);
            const locked = isPasswordProtected(error);
            addToTally(extractFailed, route.format, size);
            // The subset of `extract_failed` where the reader threw. Only the
            // other half can be a scan, so this is what makes "how many of
            // these could recognition ever help" answerable.
            addToTally(extractError, locked ? "encrypted" : "error", size);
            nextValidations[path] = {
              included: false,
              // A locked file is the one failure the person holding it can act
              // on, and it was reaching them as the same dead end as a corrupt
              // one. Not queued for recognition either way: this document was
              // never opened, so there is nothing for it to read.
              reason: locked ? "Password protected" : "Couldn't extract text",
              classification: "binary",
              size,
              type,
            };
          }
          tickProgress();
          continue;
        }

        const result = await validateFile(entry.file, config);
        nextValidations[path] = {
          included: result.isValid,
          reason: result.reason,
          classification: result.classification,
          size: entry.file.size,
          type: entry.file.type || "text/plain",
        };

        if (result.classification === "binary") {
          // Which formats users bring that we cannot read at all. This is the
          // demand signal that decides which reader to build next. An archive
          // we can't open (rar, 7z) lands here too, under its own extension.
          addToTally(unreadable, extensionOf(path) || NO_EXTENSION, fileBytes);
          // Binary: no recoverable text. Keep it visible in the tree (locked,
          // ADR-0009) but never decode its bytes — a force-include must not be
          // able to leak mojibake into the bundle, and decoding it is wasted work.
          nextEntries.push({ path, content: "" });
        } else {
          try {
            // Decode through the core classifier so odd encodings (e.g. UTF-16)
            // read as real text instead of UTF-8 mojibake. Remote sources already
            // arrive decoded, so their content passes through untouched.
            const content =
              entry.content !== undefined ? entry.content : (await readFileAsText(entry.file)).text;
            nextEntries.push({ path, content });
          } catch (error) {
            console.error(`Failed to read file ${path}:`, error);
            nextFailed.push({ path, error: "File could not be read" });
          }
        }

        if ((i + 1) % tick === 0 || i + 1 === total) {
          setProgress({ phase: "reading", done: i + 1, total });
        }
      }

      setEntries(nextEntries);
      setValidations(nextValidations);
      setFailedFiles(nextFailed);
      setScannedDocuments(nextUnread);
      setUnreadDocuments(nextUnread);
      // A new drop replaces every other list here, so this one cannot keep the
      // last drop's paths either.
      setReadLanguages({});

      // `batch_size` is deliberately redundant with SUM(file_ext.n): it is the
      // authoritative total, so the two disagreeing says extension rows went
      // missing in transit rather than that the drop was small.
      trackAmount("batch_size", { n: total, b: totalBytes });
      trackAmount("ingest_ms", { n: performance.now() - startedAt });
      if (maxFileBytes > 0) trackAmount("max_file_bytes", { b: maxFileBytes });
      for (const [label] of SIZE_THRESHOLDS) {
        if (overThresholds[label] > 0) {
          trackAmount("files_over", { value: label, n: overThresholds[label] });
        }
      }
      trackTally("file_ext", extensions);
      for (const marker of markers) track("marker", marker);
      trackTally("unreadable_ext", unreadable);
      trackTally("extract_failed", extractFailed);
      trackTally("extract_error", extractError);
      trackTally("archive_unsupported", archiveUnsupported);

      // The same drop, said in Clarity's vocabulary so the recording can be
      // found later (ADR-0016). Classes only: which kinds of content we failed
      // to read, never which extension.
      const gaps: string[] = [];
      if (unreadable.size > 0) gaps.push("unreadable");
      if (extractFailed.size > 0) gaps.push("extract_failed");
      if (archiveUnsupported.size > 0) gaps.push("archive_unsupported");
      tagDrop(totalBytes, gaps);

      // Recognition runs as the drop's last stage, awaited, so the processing
      // view carries it and the result is complete the moment it appears. Only
      // ever over documents that already came back empty, so a drop with no
      // scan in it never touches this. Awaited last so the counters above are
      // the drop's own, unmixed with what recognition then rescued.
      if (nextUnread.length > 0) await readDocuments(nextUnread, browserOcrLanguage());
    },
    [config, readDocuments],
  );

  const ingestRepo = useCallback(
    async (url: string, sourceType: SourceType, signal: AbortSignal) => {
      setIsRepoLoading(true);
      setSourceUrl(url);
      // Which remote adapters actually earn their maintenance cost.
      track("source_used", sourceType);
      tagSource(sourceType);
      // Immediate feedback: the spinner shows a stage before the first network
      // round-trip resolves, so a slow connect never reads as "frozen".
      setProgress({ phase: "fetching", done: 0, total: 0, note: "Connecting…" });
      try {
        const adapter = defaultSourceRegistry.getByType(sourceType);
        if (!adapter) throw new Error("Unknown source type");

        // Coarse stages (connect / list / download) drive the heading during
        // the pre-download window; numeric progress takes over once totals land.
        const onStatus = (message: string) =>
          setProgress((prev) => ({
            phase: "fetching",
            done: prev?.done ?? 0,
            total: prev?.total ?? 0,
            note: message,
          }));
        const onProgress = (p: DownloadProgress) =>
          setProgress((prev) => ({
            phase: "fetching",
            done: p.completedFiles,
            total: p.totalFiles,
            note: prev?.note,
          }));
        const { files, error, failures } = await adapter.fetchFiles(url, {
          onProgress,
          onStatus,
          signal,
        });
        if (error) throw new Error(error);

        const incoming: IncomingFile[] = [];
        for (const remote of files) {
          if (signal.aborted) throw new Error("Operation aborted");
          const blob = new Blob([remote.content || ""], { type: remote.type });
          const fileObj = new File([blob], remote.name, { type: remote.type });
          incoming.push({ file: fileObj, path: remote.path, content: remote.content || "" });
        }
        await ingestBatch(incoming);
        // ingestBatch replaces failedFiles with its own read failures, so append
        // the adapter's download failures afterwards. Files that were listed but
        // couldn't be fetched are surfaced, never silently dropped (ADR-0004).
        if (failures?.length) {
          setFailedFiles((prev) => [
            ...prev,
            ...failures.map((f) => ({ path: f.path, error: f.reason })),
          ]);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("Repository fetch aborted");
        }
        throw error;
      } finally {
        setIsRepoLoading(false);
      }
    },
    [ingestBatch],
  );

  const setEntryContent = useCallback((path: string, content: string) => {
    setEntries((prev) => prev.map((e) => (e.path === path ? { ...e, content } : e)));
    setValidations((prev) => {
      const record = prev[path];
      if (!record) return prev;
      const size = new TextEncoder().encode(content).length;
      return { ...prev, [path]: { ...record, size } };
    });
  }, []);

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files;
      if (!selected || selected.length === 0) return;

      setSourceUrl(null);
      setIsProcessing(true);
      tagSource("drop");
      try {
        const incoming: IncomingFile[] = Array.from(selected).map((file) => ({
          file,
          path: file.webkitRelativePath || file.name,
        }));
        await ingestBatch(incoming);
      } catch (error) {
        console.error("Error processing files:", error);
      } finally {
        e.target.value = "";
        setIsProcessing(false);
      }
    },
    [ingestBatch],
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (dragCounter.current === 1) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setSourceUrl(null);
      setIsDragging(false);
      dragCounter.current = 0;
      setIsProcessing(true);
      setProcessingStatus("Scanning files...");
      // Walking a large dropped folder can take a beat before the read loop
      // starts reporting counts — show the stage so it isn't a silent spinner.
      setProgress({ phase: "reading", done: 0, total: 0, note: "Scanning files…" });
      tagSource("drop");

      try {
        const { collected, failed } = await collectFromDataTransfer(e.dataTransfer.items, {
          skipDir: (name) => HARDCODED_PRUNE_DIRS.has(name),
        });
        const incoming: IncomingFile[] = collected.map(({ file, path }) => ({ file, path }));
        setProcessingStatus(`Processing ${incoming.length} files...`);
        await ingestBatch(incoming);
        if (failed.length > 0) setFailedFiles((prev) => [...prev, ...failed]);
      } catch (error) {
        console.error("Error processing files:", error);
      } finally {
        setIsProcessing(false);
        setProcessingStatus("");
      }
    },
    [ingestBatch],
  );


  const readUnreadDocuments = useCallback(
    () => readDocuments(unreadDocuments, readLanguage ?? browserOcrLanguage()),
    [readDocuments, unreadDocuments, readLanguage],
  );

  /**
   * Read a chosen subset of this Run's scanned documents in a chosen language,
   * replacing whatever an earlier pass made of them.
   *
   * The scope is what makes a mixed-language drop recoverable without a
   * language control per file. One language per pass, as always, but the pass
   * need not cover everything: read them all in the language the browser
   * implies, then take the odd one out again in another. Two passes and one
   * control, instead of N controls and N pieces of state to keep straight.
   */
  const readSelected = useCallback(
    (paths: readonly string[], locale: string) => {
      const language = ocrLanguageFor([locale]);
      // Against `ocr_lang`, this counts how often the *browser's* settings were
      // the wrong guess, so it is measured against that guess and not against
      // whatever the last pass ran under. Finishing a stopped pass in the
      // language we chose for you is not an override of it.
      if (language.code !== browserOcrLanguage().code) track("ocr_lang_changed", language.code);
      const chosen = new Set(paths);
      return readDocuments(
        scannedDocuments.filter((d) => chosen.has(d.path)),
        language,
      );
    },
    [readDocuments, scannedDocuments],
  );

  /** Give up on the rest of the pass. What was read stays read. */
  const stopReading = useCallback(() => {
    stopRef.current = true;
  }, []);

  const reset = useCallback(() => {
    setEntries([]);
    setValidations({});
    setFailedFiles([]);
    setScannedDocuments([]);
    setUnreadDocuments([]);
    // Abandons a pass still in flight; its own `finally` clears the rest.
    stopRef.current = true;
    setIsReading(false);
    setReadProgress(null);
    setStoppedReading(false);
    setReadLanguage(null);
    setReadLanguages({});
    setSourceUrl(null);
    setIsProcessing(false);
    setIsRepoLoading(false);
    setProcessingStatus("");
    setIsDragging(false);
    setExpandedArchive(false);
    setProgress(null);
    dragCounter.current = 0;
  }, []);

  return {
    entries,
    validations,
    failedFiles,
    unreadDocuments,
    isReading,
    readProgress,
    recoveredDocuments,
    scannedDocuments,
    readUnreadDocuments,
    readSelected,
    stopReading,
    stoppedReading,
    readLanguage,
    readLanguages,
    sourceUrl,
    isProcessing,
    isRepoLoading,
    processingStatus,
    isDragging,
    expandedArchive,
    progress,
    ingestBatch,
    ingestRepo,
    setEntryContent,
    handleFileInput,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    reset,
  };
}
