import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DecodedText,
  DownloadProgress,
  ExtractionNote,
  ProcessingConfig,
  SourceType,
  TextClassification,
} from "@fileconcat/core";
import {
  classifyBytes,
  decodeAs,
  defaultSourceRegistry,
  isEncryptedContainer,
  isPasswordProtected,
  isPrunedDirectory,
  markedPages,
  RECOGNISABLE_IMAGE_FORMATS,
  replacePages,
  unreadableReason,
  unreadableReasonText,
  validateFile,
  withTitle,
} from "@fileconcat/core";

import { collectFromDataTransfer } from "~/lib/collect-from-drop";
import { encodingGuesser } from "~/lib/encoding-guess";
import { markerFor } from "~/lib/ecosystem-markers";
import { addToTally, startRun, track, trackAmount, trackTally, type Tally } from "~/lib/metrics";
import { tagDrop, tagSource } from "~/lib/clarity-tags";
import {
  MAX_SPEECH_BYTES,
  prepareReader,
  readFailure,
  readPdfPagesWithOcr,
  readRecording,
  readWithOcr,
  recogniseImageWithOcr,
  releaseReader,
  SPEECH_FORMATS,
  SpeechTooLongError,
  type ReadFailure,
} from "~/lib/ocr";
import {
  browserLanguageWithoutReader,
  browserOcrLanguage,
  ocrLanguageFor,
  type OcrLanguage,
} from "~/lib/ocr-language";
import { planPreview } from "~/lib/scan-preview";
import { parsers, readFetchedPage, readSubtitleTrack, SUBTITLE_TRACK_FORMATS } from "~/lib/parsers";
import { prepareBatch } from "~/lib/prepare-batch";
import { extensionOf, mergePruned, NO_EXTENSION, pruneAtDoor, type PrunedAtDoor } from "~/lib/prune-at-door";

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

/**
 * Every stage a run can pass through. The label is also the note its stage
 * sets, so the view places the two against each other without a second
 * vocabulary to keep in step.
 */
export const STAGE = {
  scan: "Scanning files...",
  fetch: "Fetching files...",
  prepare: "Preparing files...",
  read: "Reading files...",
  recognise: "Reading scanned pages...",
} as const;

/**
 * Which stages a run will show, decided by the door its files came through:
 * only a dropped folder is walked, only a remote source is fetched.
 *
 * Recognition is in none of them. Whether it runs at all is decided by what
 * the read found, so it joins the end of the list when it starts rather than
 * standing there greyed out through every drop that holds no scan.
 */
const BATCH_STAGES = [STAGE.prepare, STAGE.read] as const;
const DROP_STAGES = [STAGE.scan, ...BATCH_STAGES] as const;
const REMOTE_STAGES = [STAGE.fetch, ...BATCH_STAGES] as const;

export type ContentEntry = {
  path: string;
  content: string;
  /** Set when recognition produced some or all of this content, so the bundle
   * can say the characters are a guess (ADR-0017). */
  recognised?: true;
};

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
  /**
   * What the reader could not recover from this document, when it said so
   * (ADR-0008). A parser reports these on partial successes too, so a record
   * can carry both `extracted: true` and a note: the text arrived, part of the
   * document did not.
   */
  notes?: ExtractionNote[];
  /**
   * The encoding a text file was read with, set only when nothing in its bytes
   * named it: `guess` from the guesser, `fallback` windows-1252 when the
   * guesser could not load, `picked` once the person chose another.
   */
  encoding?: string;
  guessed?: "guess" | "fallback" | "picked";
  /** Share of the first 8 KB that is control bytes no text holds, on a file that read as binary. */
  controlShare?: number;
};

/**
 * A file's bytes as text. The encoding guesser is fetched only for a file that
 * is neither UTF-8 nor says what it is, which most drops never hold.
 */
async function readText(file: File): Promise<DecodedText> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const read = classifyBytes(bytes);
  if (read.guessed !== "fallback") return read;
  const guess = await encodingGuesser();
  return guess ? classifyBytes(bytes, guess) : read;
}

export type IncomingFile = {
  file: File;
  path?: string;
  content?: string;
};

export type FailedFile = { path: string; error: string };

/**
 * A file recognition might be able to read: a document we know how to open but
 * found no text in (a scan, or an encrypted PDF), or an image, whose pixels
 * might hold writing and whose format promises nothing either way. The handle is
 * kept rather than discarded with the rest of the batch. A `File` is a reference
 * to bytes on disk, not the bytes themselves, so holding a few costs nothing.
 *
 * One list holds both populations and {@link ScannedDocument.format} tells them
 * apart, because everything downstream — the pass, the stop, the language
 * re-read — is identical for the two. What differs is only who starts it: a
 * document's pass begins by itself, an image's never does (ADR-0017).
 */
export type ScannedDocument = {
  path: string;
  format: string;
  file: File;
  /**
   * The pages recognition should re-read, when extraction could place what it
   * lost. Absent for a scan, where the whole document is the work.
   */
  pages?: number[];
  /**
   * What extraction did recover, for a document that is already in the bundle
   * with part of itself. The rescue puts its pages back into *this*, so the
   * pages that decoded keep the document's own exact characters.
   */
  text?: string;
  /**
   * Its first pages were read on their own because the drop was past the caps
   * (Q112 O1), so it is in the bundle with `text` and `pages` is the rest.
   */
  previewed?: boolean;
};

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

/**
 * How much recognition a drop is allowed to start on its own.
 *
 * The auto-start was written for the shape it was measured on: one scan in a
 * drop, read before anyone notices. `ocr_ms` says a pile is a different thing
 * entirely. Recognition over a scanned document runs at seconds to minutes
 * each, so a dozen of them is tens of minutes, and nobody waits that out in a
 * tab with a finished bundle sitting behind it.
 *
 * Count and weight each miss half of it: a few heavy documents and a long list
 * of light ones land in the same place, so both are capped. Past either, the
 * bundle lands first and the read becomes an offer, which is the deal images
 * already get (ADR-0017).
 *
 * Nothing here caps a pass someone asked for. Waiting is only worth refusing
 * when the wait was not chosen.
 */
const AUTO_READ_MAX_DOCUMENTS = 3;
const AUTO_READ_MAX_BYTES = 8 * 1024 * 1024;

/** Whether a {@link ScannedDocument} is an image rather than a document — the
 * one thing that decides whether its pass starts by itself. */
/** Prev order preserved, same path replaced in place, newcomers appended. */
function mergeByPath<T extends { path: string }>(prev: T[], next: T[]): T[] {
  const byPath = new Map(prev.map((item) => [item.path, item]));
  for (const item of next) byPath.set(item.path, item);
  return [...byPath.values()];
}

export function isRecognisableImage(format: string): boolean {
  return RECOGNISABLE_IMAGE_FORMATS.has(format);
}

/** Audio, or a video with no subtitle track: offered for speech to text (D5). */
export function isSpeechMedia(format: string): boolean {
  return SPEECH_FORMATS.has(format);
}

/** Offered, never read by itself (ADR-0017): an image, or speech. */
function isOfferOnly(format: string): boolean {
  return isRecognisableImage(format) || isSpeechMedia(format);
}

/** A mean confidence as a band of ten, the shape `ocr_conf` records. Averaged
 * over words already, so the last digit carries nothing worth a row. */
function confidenceBand(confidence: number): string {
  const floor = Math.floor(Math.max(0, confidence) / 10) * 10;
  return String(Math.min(90, floor));
}

/**
 * `append` extends the bundle instead of replacing it, de-duplicating by path
 * so re-clipping a video updates its file where it already sits rather than
 * doubling it. The first drop on an empty screen never asks for it: replacing
 * nothing is what starting over means, and an append onto an empty bundle is
 * the same act anyway.
 *
 * It carries which affordance asked, rather than a boolean, because the two
 * are the same road and nothing downstream could tell them apart. A boolean
 * plus a separate source would allow an append with no source, which is the
 * hole this closes: `append_to` rows written before 2026-08-22 carry no value
 * and can only ever be read as one undifferentiated total.
 */
export type AppendSource = "clipper" | "manual";
export type IngestOptions = { append?: AppendSource };

export type ReadProgress = { done: number; total: number; note?: string } | null;

/**
 * How the last pass ended, for the line that reports it: how many of the files
 * it was given came back with text, and the cause when any of them could not
 * be read for a reason someone can act on (`offline`, `memory`).
 */
export type LastPass = { read: number; total: number; failure: ReadFailure | null } | null;

/** Shown while the recogniser and its language data load, before the first file. */
export const GETTING_READER = "Getting the reader";
/** The reading bar's note while the held scans' first pages are read (Q131 O2). */
export const PREVIEW_NOTE = "The first pages of each held scan";

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
  /**
   * Every stage this run will pass through, in order, so the processing view
   * can show where in the pipeline it is. A stage's percent restarts at each
   * one, and without the list that reads as the whole thing starting over.
   * Absent for a single-stage pass (recognition), which has nothing to place.
   */
  stages?: readonly string[];
} | null;

export interface FileIngestion {
  entries: ContentEntry[];
  validations: Record<string, ValidationRecord>;
  failedFiles: FailedFile[];
  /**
   * What the door turned away unread, so the screen can name it: the one
   * thing that separates "you dropped nothing readable" from "you dropped
   * nothing". Null until a drop has been through a door.
   */
  pruned: PrunedAtDoor | null;
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
  /** True while the pass running is the held scans' first pages (Q131 O2). */
  isPreviewing: boolean;
  /** Recognition progress, or null when idle. `note` says where inside one
   * long file the pass is (speech: the model download, the position reached). */
  readProgress: ReadProgress;
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
  /** Read a file whose encoding was guessed again in the one the person picked. */
  decodeFileAs: (path: string, encoding: string) => Promise<void>;
  /**
   * True between the stop being asked for and the pass actually ending.
   *
   * Exposed because the gap is real and used to be invisible: the abort reaches
   * the recogniser at once, but the page in hand still has to come back. A
   * button that acknowledges nothing for that long reads as a broken button,
   * which is exactly how it was being read.
   */
  isStopping: boolean;
  /**
   * True when the last pass ended because it was stopped, not because it ran
   * out of documents. The difference is what the remaining documents mean:
   * never tried, versus tried and unreadable.
   */
  stoppedReading: boolean;
  /** The language the last pass read in, or null before one has run. */
  readLanguage: OcrLanguage | null;
  /**
   * The files the running pass has not reached yet, by path. Export stays open
   * during a pass (Q7 O2) and each file joins the bundle as it is read, so the
   * bundle names these instead of leaving them to read as binary.
   */
  pendingReads: string[];
  /** How the last pass ended; null before one has. */
  lastPass: LastPass;
  /**
   * The language each recovered document was actually read in, by path.
   *
   * Not the same thing as {@link readLanguage} once a pass can cover a subset:
   * read a drop as Turkish and then one document again as English, and the last
   * pass's language describes exactly one of them. Attributing the whole set to
   * it would be a plain untruth on the summary card.
   */
  readLanguages: Record<string, OcrLanguage>;
  ingestBatch: (incoming: IncomingFile[], options?: IngestOptions) => Promise<void>;
  /**
   * Drop every file the given paths do not name.
   *
   * The undo an append needs. `ingestBatch` merges by path and never removes,
   * so a batch that landed on a bundle it was not meant to join can only be
   * unmixed from here, by the paths that batch carried.
   */
  keepOnly: (paths: readonly string[]) => void;
  ingestRepo: (url: string, sourceType: SourceType, signal: AbortSignal) => Promise<void>;
  setEntryContent: (path: string, content: string) => void;
  handleFileInput: (e: React.ChangeEvent<HTMLInputElement>, options?: IngestOptions) => Promise<void>;
  handleDragEnter: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent, options?: IngestOptions) => Promise<void>;
  reset: () => void;
}

export function useFileIngestion(config: ProcessingConfig): FileIngestion {
  const [entries, setEntries] = useState<ContentEntry[]>([]);
  const [validations, setValidations] = useState<Record<string, ValidationRecord>>({});
  const [failedFiles, setFailedFiles] = useState<FailedFile[]>([]);
  const [pruned, setPruned] = useState<PrunedAtDoor | null>(null);
  const [scannedDocuments, setScannedDocuments] = useState<ScannedDocument[]>([]);
  const [unreadDocuments, setUnreadDocuments] = useState<ScannedDocument[]>([]);
  const [isReading, setIsReading] = useState(false);
  const [readProgress, setReadProgress] = useState<ReadProgress>(null);
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
  // One controller per pass. A ref rather than state for the same reason the
  // old boolean was one: the auto-start fires from inside the ingest that
  // produced the work, where a state read is a render behind.
  const abortRef = useRef<AbortController | null>(null);
  const [isStopping, setIsStopping] = useState(false);
  const [stoppedReading, setStoppedReading] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [readLanguage, setReadLanguage] = useState<OcrLanguage | null>(null);
  const [readLanguages, setReadLanguages] = useState<Record<string, OcrLanguage>>({});
  const [pendingReads, setPendingReads] = useState<string[]>([]);
  const [lastPass, setLastPass] = useState<LastPass>(null);
  // Read by `ingestBatch` to report what an append landed on top of. A ref
  // rather than a dependency, so adding this does not re-create every ingest
  // callback on each entry change.
  const entryCountRef = useRef(0);
  // The files read in a guessed encoding, kept so a pick can read them again.
  // A File is a handle to bytes on disk, so holding one costs nothing.
  const guessedFiles = useRef(new Map<string, File>());
  useEffect(() => {
    entryCountRef.current = entries.length;
  }, [entries.length]);

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
   *
   * Each document lands as soon as it is read, not when the pass ends (Q7 O2),
   * so Copy and Download stay open throughout and take whatever is in.
   */
  const readDocuments = useCallback(
    async (
      documents: readonly ScannedDocument[],
      language: OcrLanguage,
      // The rail this pass belongs to, when it is the tail of a run. A pass
      // started by hand from the result screen has no rail and passes none.
      stages?: readonly string[],
    ) => {
      // A ref, not `isReading`: the auto-start fires from inside the ingest that
      // produced the work, where a state read is a render behind.
      if (documents.length === 0 || readingRef.current) return 0;
      readingRef.current = true;
      const controller = new AbortController();
      abortRef.current = controller;
      setIsStopping(false);
      setStoppedReading(false);
      const startedAt = performance.now();
      setIsReading(true);
      setLastPass(null);
      setPendingReads(documents.map((d) => d.path));
      setReadProgress({ done: 0, total: documents.length });
      // Also on the ingest channel, because a batch awaits this: recognition is
      // the last stage of the drop, not something happening behind a result that
      // already claims to be ready.
      setProgress({
        phase: "recognising",
        done: 0,
        total: documents.length,
        note: STAGE.recognise,
        stages,
      });
      // Held for the whole pass, so every document is read the same way and the
      // name reported afterwards is the one that was actually used.
      setReadLanguage(language);

      const recovered: Tally = new Map();
      // Images only, both of them: `ocr_read` is measured against `ocr_offered`
      // and documents are never offered, so mixing them in would make the ratio
      // mean nothing (ADR-0017).
      const imagesRead: Tally = new Map();
      // The same for speech, against `asr_offered`.
      const mediaRead: Tally = new Map();
      // The videos among them whose frames gave text, against `frames_read`.
      const framesRead: Tally = new Map();
      const confidences: Tally = new Map();
      const failures: Tally = new Map();
      let failure: ReadFailure | null = null;
      const readEntries: ContentEntry[] = [];
      // The documents this pass actually opened. Everything else it was given
      // is left exactly as it was — see `merge` for why that matters.
      const attempted = new Set<string>();

      /**
       * One document's result, into the bundle at once. Replace in place where
       * the path is already there (a re-read), append where it is not, and take
       * out what this pass could not read so a second language never leaves the
       * first one's text behind. `unreadPages` are pages of a document already
       * in the bundle that this pass drew and got nothing from, so the bundle's
       * note keeps naming them.
       */
      const merge = (
        path: string,
        entry: ContentEntry | undefined,
        unread: ScannedDocument | undefined,
        validation: ValidationRecord | undefined,
        unreadPages: readonly number[] = [],
      ) => {
        // Keep only took the pass away: this document is no longer in the set.
        if (abortRef.current !== controller) return;
        setEntries((prev) => {
          if (unread) return prev.filter((e) => e.path !== path);
          if (!entry) return prev;
          return prev.some((e) => e.path === path)
            ? prev.map((e) => (e.path === path ? entry : e))
            : [...prev, entry];
        });
        if (validation) {
          setValidations((prev) => {
            const notes = afterRecognition(prev[path]?.notes, unreadPages);
            return { ...prev, [path]: validation.included && notes.length ? { ...validation, notes } : validation };
          });
        }
        // Which language each document ended up read in, so a scoped pass never
        // relabels the ones it did not touch. Documents this pass lost drop out.
        setReadLanguages((prev) => {
          const next = { ...prev };
          delete next[path];
          if (entry) next[path] = language;
          return next;
        });
        // Merged, not replaced. A pass runs over a chosen subset, so the
        // documents it was never given keep the standing they already had. A
        // stop leaves the tail untouched rather than failed, so stopping a
        // re-read can never throw away an earlier pass's good text.
        setUnreadDocuments((prev) => [...prev.filter((d) => d.path !== path), ...(unread ? [unread] : [])]);
        setPendingReads((prev) => prev.filter((p) => p !== path));
      };

      try {
        // The recogniser first, as a stage of its own: on the first pass it is
        // a download, and a first file that sat on it looked like a hang. Speech
        // loads its own model and says so in its own note.
        if (documents.some((d) => !isSpeechMedia(d.format))) {
          setReadProgress({ done: 0, total: documents.length, note: GETTING_READER });
          try {
            trackAmount("ocr_ready_ms", { n: await prepareReader(language.code, controller.signal) });
          } catch (error) {
            if (controller.signal.aborted) {
              setStoppedReading(true);
              trackAmount("read_stopped", { n: documents.length });
              return 0;
            }
            // Nothing was opened, so nothing changes standing: every document
            // stays the offer it was, under a line that says why.
            failure = readFailure(error);
            console.error("Recognition could not start:", error);
            trackAmount("ocr_failed", { value: failure, n: documents.length });
            return 0;
          }
          setReadProgress({ done: 0, total: documents.length });
        }

        for (let i = 0; i < documents.length; i++) {
          const document = documents[i];
          // The cheap half of the stop. The signal below is what makes it land
          // inside a document too; this is what keeps the loop from opening the
          // next one. Stopping keeps everything read so far and leaves the rest
          // untouched.
          if (controller.signal.aborted) {
            setStoppedReading(true);
            break;
          }
          attempted.add(document.path);
          let pagesLeft: number[] = [];
          try {
            let text = "";
            if (isSpeechMedia(document.format)) {
              // Heard, and in a video also seen on screen. The note carries the
              // model download and the position reached, as one file can be the
              // whole pass.
              addToTally(mediaRead, document.format, document.file.size);
              const recording = await readRecording(document.file, document.format, language, controller.signal, (note) =>
                setReadProgress({ done: i, total: documents.length, note }),
              );
              if (recording.seen) addToTally(framesRead, document.format, document.file.size);
              text = recording.text;
            } else if (isRecognisableImage(document.format)) {
              // An image: the whole file is the picture, so it goes to the
              // recogniser as it is. No bytes are read here — the `File` is a
              // reference and the recogniser decodes it itself.
              const reading = await recogniseImageWithOcr(document.file, language.code, controller.signal);
              addToTally(imagesRead, document.format, document.file.size);
              addToTally(confidences, confidenceBand(reading.confidence));
              text = reading.text;
            } else {
              const bytes = new Uint8Array(await document.file.arrayBuffer());
              if (document.pages && document.pages.length > 0) {
                // A page whose fonts carry no character map: drawn, then read.
                // Progress counts pages here because one such document can be
                // the whole pass, and a document counter would sit still
                // through it.
                const read = await readPdfPagesWithOcr(
                  bytes,
                  document.pages,
                  language.code,
                  (done, total) =>
                    setProgress({
                      phase: "recognising",
                      done: i,
                      total: documents.length,
                      note: `Page ${done + 1} of ${total}`,
                      stages,
                    }),
                  controller.signal,
                );
                pagesLeft = document.pages.filter((page) => !read.has(page));
                if (read.size > 0) {
                  text = document.text
                    ? replacePages(document.text, read)
                    : [...read.values()].join("\n\n");
                }
              } else {
                ({ text } = await readWithOcr(bytes, language.code, controller.signal));
              }
            }
            if (text) {
              addToTally(recovered, document.format, document.file.size);
              const entry: ContentEntry = { path: document.path, content: text, recognised: true };
              readEntries.push(entry);
              merge(document.path, entry, undefined, {
                included: true,
                classification: "text",
                size: document.file.size,
                type: document.file.type || "application/octet-stream",
                // A document's text was extracted and then patched by
                // recognition; an image's was never extracted at all, and
                // saying so would put a PNG under "text extracted from 1
                // document". The bundle's recognition line covers both.
                ...(isOfferOnly(document.format) ? {} : { extracted: true }),
              }, pagesLeft);
            } else if (!document.text) {
              // Recognition found nothing: an encrypted PDF, a page with no
              // writing on it, or a language this pass read it in cannot see.
              // An image is left saying what it was, because it never promised
              // text in the first place — "no extractable text" would read as a
              // failure on a photograph that simply has no writing in it.
              merge(document.path, undefined, document, {
                included: false,
                reason: isSpeechMedia(document.format)
                  ? "No speech found"
                  : isRecognisableImage(document.format)
                    ? "Binary file"
                    : "No extractable text",
                classification: "binary",
                size: document.file.size,
                type: document.file.type || "application/octet-stream",
                recognitionTried: true,
              }, pagesLeft);
            } else {
              // A document that came here with text of its own and gained
              // nothing is left exactly as it was. It is already in the bundle
              // with the part of itself that decoded, and calling it unread
              // would take that back out: a failed rescue must not cost more
              // than it found.
              merge(document.path, undefined, undefined, undefined);
            }
          } catch (error) {
            // A stop now throws out of the reader mid-document. That document
            // was interrupted, not tried and found wanting, so it goes back to
            // the standing it arrived with rather than becoming a failure,
            // the same rule the untouched tail gets, and the reason it has to
            // leave `attempted` again.
            if (controller.signal.aborted) {
              attempted.delete(document.path);
              setStoppedReading(true);
              break;
            }
            console.error(`Recognition failed for ${document.path}:`, error);
            // The cause someone can act on wins over "the file itself", so a
            // pass that lost its connection half-way says so.
            const cause = readFailure(error);
            addToTally(failures, cause, document.file.size);
            if (failure === null || failure === "other") failure = cause;
            if (!document.text) {
              merge(document.path, undefined, document, {
                included: false,
                reason:
                  error instanceof SpeechTooLongError
                    ? `Too long to transcribe here (${error.message})`
                    : "Couldn't be read",
                classification: "binary",
                size: document.file.size,
                type: document.file.type || "application/octet-stream",
                recognitionTried: true,
              });
            } else {
              merge(document.path, undefined, undefined, undefined);
            }
          }
          setReadProgress({ done: i + 1, total: documents.length });
          setProgress({
            phase: "recognising",
            done: i + 1,
            total: documents.length,
            note: STAGE.recognise,
            stages,
          });
        }

        // What recognition rescued, against the `extract_failed` rows of the same
        // Run — the two together are what says whether this was worth building.
        trackAmount("ocr_ms", { n: performance.now() - startedAt });
        trackTally("ocr_recovered", recovered);
        trackTally("ocr_read", imagesRead);
        trackTally("asr_read", mediaRead);
        trackTally("frames_read", framesRead);
        // Rejections included: they are what says whether the floor sits in the
        // right place, which is the only way those two guesses ever move.
        trackTally("ocr_conf", confidences);
        track("ocr_lang", language.code);
        // English standing in for a browser language no reader exists for:
        // which language, so the next one worth adding is a count, not a guess.
        const missing = browserLanguageWithoutReader();
        if (missing && language.code === "eng") track("ocr_lang_fallback", missing);
        trackTally("ocr_failed", failures);
        // How much of the pass a stop left: the files it never finished. A
        // transcript cut short returns instead of throwing, so the loop never
        // saw that stop and this is where the pass is marked stopped.
        if (controller.signal.aborted) {
          setStoppedReading(true);
          trackAmount("read_stopped", { n: documents.length - attempted.size });
        }
        return readEntries.length;
      } finally {
        readingRef.current = false;
        abortRef.current = null;
        setIsStopping(false);
        setIsReading(false);
        setReadProgress(null);
        setPendingReads([]);
        setLastPass({ read: readEntries.length, total: documents.length, failure });
        void releaseReader();
      }
    },
    [],
  );

  /**
   * The first pages of the scans a drop's caps held back (Q112 O1), read behind
   * the result once it is on screen (Q131 O2): the wait in front of it ran to
   * minutes. Each document joins the bundle as its pages land, the way the hand
   * pass does (Q7 O2), and Copy and Download take what is in. The rest of each
   * stays an offer, with its pages counted, the way a PDF viewer reads the page
   * in view and leaves the whole document to a press.
   *
   * Not {@link readDocuments}: that pass is authoritative for what it is given,
   * so a document read in part would come out of it counted as rescued and its
   * other pages gone from its note. Here it joins the bundle as a document with
   * pages still to read, which is the shape the rescue of a text PDF's scanned
   * pages already takes, and the existing pass reads the rest into it.
   *
   * Start over and Keep only take the pass away (`abortRef`), and from then on
   * it writes nothing, not even its counters: its documents are gone, and a
   * merge would put one back into a bundle someone just pruned. The same check
   * PDF.js makes before each write of a search that outlived its document.
   */
  const previewScans = useCallback(
    async (documents: readonly ScannedDocument[], language: OcrLanguage) => {
      const { read: plan, skipped } = planPreview(documents);
      // Why each held document got no first pages, so a Run in `ocr_deferred`
      // without `ocr_previewed` says which of six things happened to it.
      const skips: Tally = new Map();
      for (const { document, reason } of skipped) addToTally(skips, reason, document.file.size);
      if (plan.length === 0 || readingRef.current) {
        trackTally("ocr_preview_skipped", skips);
        return;
      }
      readingRef.current = true;
      const startedAt = performance.now();
      const controller = new AbortController();
      abortRef.current = controller;
      const current = () => abortRef.current === controller;
      setIsStopping(false);
      setStoppedReading(false);
      setIsReading(true);
      setIsPreviewing(true);
      setPendingReads(plan.map(({ document }) => document.path));
      setReadProgress({ done: 0, total: plan.length, note: PREVIEW_NOTE });
      const previewed: Tally = new Map();
      const recovered: Tally = new Map();
      const opened = new Set<string>();
      try {
        for (let i = 0; i < plan.length; i++) {
          const { document, first } = plan[i];
          if (controller.signal.aborted) break;
          opened.add(document.path);
          try {
            const bytes = new Uint8Array(await document.file.arrayBuffer());
            const read = await readPdfPagesWithOcr(bytes, first, language.code, undefined, controller.signal);
            if (!current()) return;
            // Nothing legible on the first pages: left as the caps left it,
            // held and offered, since the pages after them were never looked at.
            if (read.size === 0) {
              addToTally(skips, controller.signal.aborted ? "stopped" : "blank", document.file.size);
              continue;
            }
            const pages = document.pages ?? [];
            const unread = pages.filter((page) => !read.has(page));
            const text = markedPages(pages, read);
            const entry: ContentEntry = { path: document.path, content: text, recognised: true };
            const validation: ValidationRecord = {
              included: true,
              classification: "text",
              size: document.file.size,
              type: document.file.type || "application/octet-stream",
              extracted: true,
              ...(unread.length > 0 ? { notes: [{ kind: "pages-scanned", count: unread.length, pages: unread }] } : {}),
            };
            // A short scan the byte cap held can be read whole by its first
            // pages. Then it is rescued like any other, and counted that way.
            const rest = unread.length === 0 ? null : { ...document, pages: unread, text, previewed: true };
            addToTally(rest ? previewed : recovered, document.format, document.file.size);
            setEntries((prev) => [...prev.filter((e) => e.path !== document.path), entry]);
            setValidations((prev) => ({ ...prev, [document.path]: validation }));
            setUnreadDocuments((prev) => prev.flatMap((d) => (d.path !== document.path ? [d] : rest ? [rest] : [])));
            setReadLanguage(language);
            setReadLanguages((prev) => ({ ...prev, [document.path]: language }));
          } catch (error) {
            if (!current()) return;
            if (controller.signal.aborted) {
              addToTally(skips, "stopped", document.file.size);
              break;
            }
            addToTally(skips, "error", document.file.size);
            console.error(`First-page recognition failed for ${document.path}:`, error);
          } finally {
            if (current()) {
              setPendingReads((prev) => prev.filter((p) => p !== document.path));
              setReadProgress({ done: i + 1, total: plan.length, note: PREVIEW_NOTE });
            }
          }
        }
        if (controller.signal.aborted) setStoppedReading(true);
        for (const { document } of plan) {
          if (!opened.has(document.path)) addToTally(skips, "stopped", document.file.size);
        }
        // How long the read behind the result took. Not `ocr_ms`, which stays the
        // mark of a pass someone chose.
        trackAmount("ocr_preview_ms", { n: performance.now() - startedAt });
        trackTally("ocr_preview_skipped", skips);
        // Its own counter, never `ocr_recovered`: a document read in part is not
        // rescued, and the clean-Run measure reads that counter as whole.
        trackTally("ocr_previewed", previewed);
        trackTally("ocr_recovered", recovered);
      } finally {
        readingRef.current = false;
        // A superseded pass leaves the screen to whatever took it away.
        if (current()) {
          abortRef.current = null;
          setIsStopping(false);
          setIsReading(false);
          setIsPreviewing(false);
          setReadProgress(null);
          setPendingReads([]);
        }
        void releaseReader();
      }
    },
    [],
  );

  const ingestBatch = useCallback(
    async (
      incoming: IncomingFile[],
      options?: IngestOptions,
      // Not on the exported type: the doors above pass their own list, and an
      // outside caller (the extension push) is exactly the batch-only run.
      stages: readonly string[] = BATCH_STAGES,
      // Milliseconds the folder walk ahead of this batch took, for the door
      // that walks one. Reported here rather than where it happened so it lands
      // inside the Run, next to the file count that makes it mean something.
      scanMs = 0,
      // What the door turned away, from the two doors that prune. Same
      // reason: written inside the Run, beside the counters for what got in.
      prunedAtDoor: PrunedAtDoor | null = null,
    ) => {
      const append = options?.append;
      const startedAt = performance.now();
      // Everything recorded below belongs to this Run (ADR-0014): one drop and
      // everything that follows it until the next drop replaces it.
      startRun();

      // One pass decides every file's route from its own leading bytes and
      // unpacks the archives among them (ADR-0011), so nothing below sniffs a
      // file twice. The archives' contents meet the same door as the drop.
      const {
        files: routed,
        expandedCount,
        unsupported,
        archiveReads,
        pruned: prunedInArchives,
      } = await prepareBatch(incoming, (done, total) =>
        setProgress({ phase: "reading", done, total, note: STAGE.prepare, stages }),
      );
      setExpandedArchive((prev) => (append ? prev || expandedCount > 0 : expandedCount > 0));
      const prunedNow = mergePruned(prunedAtDoor, prunedInArchives);
      setPruned((prev) => (append ? mergePruned(prev, prunedNow) : prunedNow));
      if (prunedNow) {
        for (const dir of prunedNow.dirs) track("pruned_dir", dir);
        trackTally("pruned_ext", prunedNow.exts);
      }

      const nextEntries: ContentEntry[] = [];
      const nextValidations: Record<string, ValidationRecord> = {};
      const nextFailed: FailedFile[] = [];
      // Counters accumulate per extension and are reported once at the end
      // (ADR-0014): a folder of 200 screenshots is one `png` row carrying its
      // count and byte total, not two hundred rows. Row count therefore scales
      // with extension variety, which is bounded, and not with file count.
      const extensions: Tally = new Map();
      const unreadable: Tally = new Map();
      const readFailed: Tally = new Map();
      const textEncoding: Tally = new Map();
      const extractFailed: Tally = new Map();
      const extractError: Tally = new Map();
      const extractNotes: Tally = new Map();
      const extractReader: Tally = new Map();
      const nextUnread: ScannedDocument[] = [];
      const imagesOffered: Tally = new Map();
      const mediaOffered: Tally = new Map();
      const archiveUnsupported: Tally = new Map();
      const markers = new Set<string>();
      let totalBytes = 0;
      let maxFileBytes = 0;
      const overThresholds: Record<SizeThreshold, number> = { "1mb": 0, "10mb": 0, "32mb": 0 };

      for (const extension of unsupported) {
        addToTally(archiveUnsupported, extension || NO_EXTENSION);
      }
      const archiveReader: Tally = new Map();
      for (const read of archiveReads) addToTally(archiveReader, read);

      const total = routed.length;
      // Cap re-renders at ~100 progress ticks regardless of how large the drop is.
      const tick = Math.max(1, Math.floor(total / 100));
      setProgress({ phase: "reading", done: 0, total, note: STAGE.read, stages });

      for (let i = 0; i < total; i++) {
        const { item: entry, path, route, sniffed, controlShare, encrypted } = routed[i];

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
            setProgress({ phase: "reading", done: i + 1, total, note: STAGE.read, stages });
          }
        };

        // Its own bytes say it is locked: an encrypted zip, or a DRM book's
        // chapters dropped unpacked. No reader opens it, so it lands with the
        // locked documents below rather than as an unreadable format.
        if (encrypted) {
          addToTally(extractError, "encrypted", fileBytes);
          nextValidations[path] = {
            included: false,
            reason: "Password protected",
            classification: "binary",
            size: fileBytes,
            type: entry.file.type || "application/octet-stream",
          };
          tickProgress();
          continue;
        }

        // A document container: pull the text out and include *that*, instead
        // of classifying the container's raw bytes (ADR-0003). Which parser to
        // load came from the bytes, not the filename, so a renamed `.docx` and
        // an extensionless PDF both land here.
        // A reader that opened the container and found nothing it reads (a Word
        // 97-2003 file inside the compound format the workbook reader owns), or
        // a build with no reader at all. Not a failed extraction: a file this
        // build cannot read, which takes the same path as every other one so
        // the ledger names it and `unreadable_ext` still counts its extension.
        let unreadableHere = false;
        if (route.kind === "extract") {
          const size = entry.file.size;
          const type = entry.file.type || "application/octet-stream";
          // No size gate. A big PDF used to be skipped here before extraction,
          // and because nothing was pushed to `nextEntries` it never reached
          // the tree either — invisible and un-re-includable, the worst shape
          // a drop can take. Weight is reported after the fact instead.
          try {
            const bytes = new Uint8Array(await entry.file.arrayBuffer());
            // A password-protected Office file, a rights-managed one, a DRM
            // book: the reader would fail on it or read noise, so the catch
            // below names it from the bytes instead.
            if (isEncryptedContainer(bytes)) throw new Error("Password protected");
            const extracted = await parsers.extract(route.parserId, bytes, route.format);
            const { notes, reader } = extracted;
            // The document's own title above its text, when it says something (Q30 O2).
            const text = withTitle(extracted.text, extracted.title, path);
            // What the reader gave up on, counted once per document rather than
            // once per lost page: the question these answer is "how many drops
            // hit this", and a fifty-page PDF failing wholesale must not swamp
            // the format that fails on one document in ten.
            const kinds = notes?.map((note) => note.kind);
            for (const kind of kinds ?? []) addToTally(extractNotes, kind, size);
            // Pages whose fonts carry no character map, and scanned pages bound
            // into a text PDF. Recognition can read them by drawing them, and the
            // notes say which ones — so this is a second reason to keep the file
            // handle, beside a document that came back with nothing at all.
            const lostPages = (notes ?? [])
              .filter((note) => note.kind === "text-undecodable" || note.kind === "pages-scanned")
              .flatMap((note) => note.pages ?? [])
              .sort((a, b) => a - b);
            if (text) {
              nextEntries.push({ path, content: text });
              // Which reader of the format's chain produced it, so a fallback's
              // share is measured after shipping (extraction router, R1).
              if (reader) addToTally(extractReader, `${extensionOf(path) || NO_EXTENSION}/${reader}`, size);
              // Already in the bundle, and still incomplete: the rescue replaces
              // the lost pages inside this text rather than the whole document.
              if (lostPages.length > 0) {
                nextUnread.push({
                  path,
                  format: route.format,
                  file: entry.file,
                  pages: lostPages,
                  text,
                });
              }
              nextValidations[path] = {
                included: true,
                classification: "text",
                size,
                type,
                extracted: true,
                ...(notes?.length ? { notes } : {}),
              };
            } else if (kinds?.includes("parser-unavailable")) {
              unreadableHere = true;
            } else {
              // No recoverable text (a scanned image-only or encrypted PDF):
              // surfaced as excluded, never silently dropped.
              addToTally(extractFailed, route.format, size);
              // Keep the handle: this is the shape recognition can sometimes
              // read, and re-reading needs the bytes we are about to drop. Only
              // for a format that could be a scan in the first place.
              if (SCANNABLE_FORMATS.has(route.format)) {
                // With pages named, the rescue draws those pages; without, it is
                // a scan and officeparser's own recognition over the embedded
                // pictures is the path that reads it.
                nextUnread.push({
                  path,
                  format: route.format,
                  file: entry.file,
                  ...(lostPages.length > 0 ? { pages: lostPages } : {}),
                });
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
          if (!unreadableHere) {
            tickProgress();
            continue;
          }
        }

        // A video's own subtitle track is its transcript (extraction router,
        // D4), read from the file in place and never whole. A video without
        // one carries on to the binary path below, as every video did before.
        if (route.kind === "binary" && route.format && SUBTITLE_TRACK_FORMATS.has(route.format)) {
          const text = await readSubtitleTrack(entry.file, route.format).catch((error: unknown) => {
            console.error(`Failed to read the subtitle track of ${path}:`, error);
            return "";
          });
          if (text) {
            nextEntries.push({ path, content: text });
            addToTally(extractReader, `${extensionOf(path) || NO_EXTENSION}/subtitle-track`, fileBytes);
            nextValidations[path] = {
              included: true,
              classification: "text",
              size: fileBytes,
              type: entry.file.type || "application/octet-stream",
              extracted: true,
            };
            tickProgress();
            continue;
          }
        }

        const result = await validateFile(entry.file, config, sniffed);
        nextValidations[path] = {
          included: result.isValid,
          // "Binary file" said nothing about a 97-2003 workbook or an Outlook
          // message. The router's own verdict on the bytes, refined by the
          // extension, says what it was and what would make it readable.
          reason:
            result.classification === "binary"
              ? unreadableReasonText(unreadableReason(path, route))
              : result.reason,
          classification: result.classification,
          size: entry.file.size,
          type: entry.file.type || "text/plain",
          ...(controlShare !== undefined ? { controlShare } : {}),
        };

        if (result.classification === "binary") {
          // Which formats users bring that we cannot read at all. This is the
          // demand signal that decides which reader to build next. An archive
          // we can't open (rar, 7z) lands here too, under its own extension.
          addToTally(unreadable, extensionOf(path) || NO_EXTENSION, fileBytes);
          // An image the router named from its own bytes: a candidate for
          // recognition, never a subject of it until someone asks (ADR-0017).
          // Every image is a candidate and no signal separates the receipt from
          // the icon, so the offer is made and the work is not.
          if (route.kind === "binary" && route.format && isRecognisableImage(route.format)) {
            nextUnread.push({ path, format: route.format, file: entry.file });
            addToTally(imagesOffered, route.format, fileBytes);
          }
          // Speech, on the same terms. A file past the size cap is not offered,
          // as decoding it whole would hold more memory than a laptop has.
          if (
            route.kind === "binary" &&
            route.format &&
            isSpeechMedia(route.format) &&
            entry.file.size <= MAX_SPEECH_BYTES
          ) {
            nextUnread.push({ path, format: route.format, file: entry.file });
            addToTally(mediaOffered, route.format, fileBytes);
          }
          // Binary: no recoverable text. Keep it visible in the tree (locked,
          // ADR-0009) but never decode its bytes — a force-include must not be
          // able to leak mojibake into the bundle, and decoding it is wasted work.
          nextEntries.push({ path, content: "" });
        } else {
          try {
            // Decode through the core classifier so odd encodings (UTF-16, a
            // legacy code page) read as real text instead of UTF-8 mojibake.
            // Remote sources already arrive decoded, so their content passes
            // through untouched.
            if (entry.content !== undefined) {
              nextEntries.push({ path, content: entry.content });
            } else {
              const read = await readText(entry.file);
              const record = nextValidations[path];
              // The whole file overrules the 8 KB sniff: an encoding can turn
              // out to be a guess past it, and padding can hide binary from it.
              record.classification = read.classification;
              if (read.classification === "binary" && config.excludeBinaryFiles) {
                record.included = false;
                record.reason = unreadableReasonText(unreadableReason(path, route));
                record.controlShare = read.controlShare;
              }
              if (read.guessed) {
                record.encoding = read.encoding;
                record.guessed = read.guessed;
                guessedFiles.current.set(path, entry.file);
              }
              if (read.stoppedAt !== undefined) {
                record.notes = [...(record.notes ?? []), { kind: "binary-tail", count: read.stoppedAt }];
              }
              if (read.classification !== "binary" && read.encoding !== "utf-8") {
                addToTally(textEncoding, read.encoding, fileBytes);
              }
              nextEntries.push({ path, content: read.text });
            }
          } catch (error) {
            console.error(`Failed to read file ${path}:`, error);
            nextFailed.push({ path, error: "File could not be read" });
            // The failure the screen already showed and the data never did.
            addToTally(readFailed, extensionOf(path) || NO_EXTENSION, fileBytes);
          }
        }

        if ((i + 1) % tick === 0 || i + 1 === total) {
          setProgress({ phase: "reading", done: i + 1, total, note: STAGE.read, stages });
        }
      }

      if (append) {
        // Merging keeps a re-clipped file where it already sits rather than
        // moving it to the end: the same path is one file in the bundle, and
        // the newer read of it wins.
        //
        // `mergeByPath` only overwrites paths present in the incoming list —
        // it never removes one. A path this batch actually read (it is in
        // `nextEntries`) has to be taken out of the *old* failed/scanned/unread
        // records by hand first, or a file that failed last time and reads
        // fine now keeps a stale failure sitting next to its working content.
        // `scannedDocuments` and `unreadDocuments` are pruned by the same set
        // so the two stay in lockstep: `recoveredDocuments` is their length
        // difference, and dropping a path from one but not the other would
        // count a re-dropped file as a rescue that never happened.
        const readPaths = new Set(nextEntries.map((e) => e.path));
        setEntries((prev) => mergeByPath(prev, nextEntries));
        setValidations((prev) => ({ ...prev, ...nextValidations }));
        setFailedFiles((prev) =>
          mergeByPath(
            prev.filter((f) => !readPaths.has(f.path)),
            nextFailed,
          ),
        );
        setScannedDocuments((prev) =>
          mergeByPath(
            prev.filter((d) => !readPaths.has(d.path)),
            nextUnread,
          ),
        );
        setUnreadDocuments((prev) =>
          mergeByPath(
            prev.filter((d) => !readPaths.has(d.path)),
            nextUnread,
          ),
        );
        // Languages are keyed by path and describe files that are still here,
        // so unlike a replacing drop this one keeps them.
      } else {
        setEntries(nextEntries);
        setValidations(nextValidations);
        setFailedFiles(nextFailed);
        setScannedDocuments(nextUnread);
        setUnreadDocuments(nextUnread);
        // A new drop replaces every other list here, so this one cannot keep
        // the last drop's paths either.
        setReadLanguages({});
      }

      // `batch_size` is deliberately redundant with SUM(file_ext.n): it is the
      // authoritative total, so the two disagreeing says extension rows went
      // missing in transit rather than that the drop was small.
      trackAmount("batch_size", { n: total, b: totalBytes });
      // What the bundle held when this append landed. Zero means an append that
      // had nothing to append to, which is a replace wearing another name — so
      // this is the counter that says whether bundles genuinely get mixed, not
      // just whether the button gets pressed.
      if (append) trackAmount("append_to", { value: append, n: entryCountRef.current });
      trackAmount("ingest_ms", { n: performance.now() - startedAt });
      if (scanMs > 0) trackAmount("scan_ms", { n: scanMs });
      if (maxFileBytes > 0) trackAmount("max_file_bytes", { b: maxFileBytes });
      for (const [label] of SIZE_THRESHOLDS) {
        if (overThresholds[label] > 0) {
          trackAmount("files_over", { value: label, n: overThresholds[label] });
        }
      }
      trackTally("file_ext", extensions);
      for (const marker of markers) track("marker", marker);
      trackTally("unreadable_ext", unreadable);
      trackTally("read_failed", readFailed);
      trackTally("text_encoding", textEncoding);
      trackTally("extract_failed", extractFailed);
      trackTally("extract_error", extractError);
      trackTally("extract_note", extractNotes);
      trackTally("extract_reader", extractReader);
      trackTally("archive_unsupported", archiveUnsupported);
      trackTally("archive_reader", archiveReader);
      // The offer, whether or not it is ever taken — the denominator `ocr_read`
      // is measured against, and the one number that says whether ADR-0017's bet
      // was right.
      trackTally("ocr_offered", imagesOffered);
      trackTally("asr_offered", mediaOffered);

      // The same drop, said in Clarity's vocabulary so the recording can be
      // found later (ADR-0016). Classes only: which kinds of content we failed
      // to read, never which extension.
      const gaps: string[] = [];
      if (unreadable.size > 0) gaps.push("unreadable");
      if (readFailed.size > 0) gaps.push("read_failed");
      if (extractFailed.size > 0) gaps.push("extract_failed");
      if (archiveUnsupported.size > 0) gaps.push("archive_unsupported");
      tagDrop(totalBytes, gaps);

      // Recognition runs as the drop's last stage, awaited, so the processing
      // view carries it and the result is complete the moment it appears. Only
      // ever over documents that already came back empty, so a drop with no
      // scan in it never touches this. Awaited last so the counters above are
      // the drop's own, unmixed with what recognition then rescued.
      //
      // Images are filtered out and left for the offer: a document earned its
      // pass by failing an honest attempt first, and an image offers no such
      // evidence (ADR-0017). A drop with one scan and twenty-six screenshots
      // reads the scan and offers the screenshots.
      const autoRead = nextUnread.filter((d) => !isOfferOnly(d.format));
      const autoReadBytes = autoRead.reduce((sum, d) => sum + d.file.size, 0);
      if (autoRead.length > 0) {
        if (autoRead.length <= AUTO_READ_MAX_DOCUMENTS && autoReadBytes <= AUTO_READ_MAX_BYTES) {
          await readDocuments(autoRead, browserOcrLanguage(), [...stages, STAGE.recognise]);
        } else {
          // The bundle is already assembled at this point, so declining the
          // pass is what releases it. Recorded by format, because whether the
          // offer is then taken is the only thing that says whether this was
          // the right trade. Nothing else is stored: which documents no pass
          // has opened is already legible from their own validation records,
          // and a Run-level flag beside them would be wrong first on an append.
          const deferred: Tally = new Map();
          for (const d of autoRead) addToTally(deferred, d.format, d.file.size);
          trackTally("ocr_deferred", deferred);
          // Not awaited (Q131 O2): the result shows now and the first pages land
          // in it as they are read, on the result screen's own reading bar.
          void previewScans(autoRead, browserOcrLanguage());
        }
      }
    },
    [config, readDocuments, previewScans],
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
      setProgress({
        phase: "fetching",
        done: 0,
        total: 0,
        note: "Connecting...",
        stages: REMOTE_STAGES,
      });
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
            stages: REMOTE_STAGES,
          }));
        const onProgress = (p: DownloadProgress) =>
          setProgress((prev) => ({
            phase: "fetching",
            done: p.completedFiles,
            total: p.totalFiles,
            note: prev?.note,
            stages: REMOTE_STAGES,
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
          let { name, path, type, content = "" } = remote;
          // A web page arrives as its markup; the caption promises readable text.
          if (sourceType === "url" && type.includes("text/html")) {
            content = await readFetchedPage(content, url);
            const { pathname, hostname } = new URL(url);
            const slug = pathname.split("/").filter(Boolean).pop()?.replace(/\.html?$/i, "");
            name = path = `${slug || hostname}.md`;
            type = "text/markdown";
          }
          const fileObj = new File([new Blob([content], { type })], name, { type });
          incoming.push({ file: fileObj, path, content });
        }
        await ingestBatch(incoming, undefined, REMOTE_STAGES);
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
    async (e: React.ChangeEvent<HTMLInputElement>, options?: IngestOptions) => {
      const selected = e.target.files;
      if (!selected || selected.length === 0) return;

      if (!options?.append) setSourceUrl(null);
      setIsProcessing(true);
      tagSource("drop");
      try {
        // The browser has already enumerated everything, so the prune runs on
        // the list; the drag walk applies it while walking. Not user-editable:
        // what it drops never reaches the filter rail.
        const { kept, pruned } = pruneAtDoor(
          Array.from(selected).map((file) => ({ file, path: file.webkitRelativePath || file.name })),
        );
        await ingestBatch(kept, options, BATCH_STAGES, 0, pruned);
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
    async (e: React.DragEvent, options?: IngestOptions) => {
      e.preventDefault();
      e.stopPropagation();
      if (!options?.append) setSourceUrl(null);
      setIsDragging(false);
      dragCounter.current = 0;
      setIsProcessing(true);
      setProcessingStatus("Scanning files...");
      // Walking a large dropped folder can take a beat before the read loop
      // starts reporting counts — show the stage so it isn't a silent spinner.
      setProgress({
        phase: "reading",
        done: 0,
        total: 0,
        note: STAGE.scan,
        stages: DROP_STAGES,
      });
      tagSource("drop");

      const walkStartedAt = performance.now();
      // Directories the walk declined to enter, one entry each: never
      // enumerated, so the only count there is of them.
      const refusedDirs: string[] = [];
      try {
        const { collected, failed } = await collectFromDataTransfer(e.dataTransfer.items, {
          skipDir: (name) => {
            const skip = isPrunedDirectory(name);
            if (skip) refusedDirs.push(name);
            return skip;
          },
          // The walk has no total to count towards, so it reports what it has
          // found so far. Every 25th file, to cap re-renders on a big folder.
          onProgress: (found) => {
            if (found % 25 === 0)
              setProgress({
                phase: "reading",
                done: found,
                total: 0,
                note: STAGE.scan,
                stages: DROP_STAGES,
              });
          },
        });
        const { kept: incoming, pruned } = pruneAtDoor(collected, refusedDirs);
        setProcessingStatus(`Processing ${incoming.length} files...`);
        await ingestBatch(incoming, options, DROP_STAGES, performance.now() - walkStartedAt, pruned);
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
    // Speech is left out: its first pass downloads a model of up to 244 MB,
    // which only the reading dialog names before it is spent.
    () =>
      readDocuments(
        unreadDocuments.filter((d) => !isSpeechMedia(d.format)),
        readLanguage ?? browserOcrLanguage(),
      ),
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

  /**
   * Give up on the rest of the pass. What was read stays read.
   *
   * The abort reaches the recogniser immediately and terminates the worker
   * holding the page, but the call still has to unwind, so the flag says the
   * press landed. Without it the button had no way to answer at all and the
   * only signal a stop had worked was the screen changing, minutes later.
   */
  const stopReading = useCallback(() => {
    if (!abortRef.current) return;
    setIsStopping(true);
    abortRef.current.abort();
  }, []);

  const decodeFileAs = useCallback(async (path: string, encoding: string) => {
    const file = guessedFiles.current.get(path);
    if (!file) return;
    const text = decodeAs(new Uint8Array(await file.arrayBuffer()), encoding);
    if (text === null) return;
    setEntries((prev) => prev.map((e) => (e.path === path ? { ...e, content: text } : e)));
    setValidations((prev) =>
      prev[path] ? { ...prev, [path]: { ...prev[path], encoding, guessed: "picked" } } : prev,
    );
  }, []);

  /**
   * Keep the named paths, drop the rest, and give up the name the bundle went
   * by: pruned to a subset it is no longer that import, and the result header
   * would go on saying it was.
   *
   * Manual per-file toggles are keyed by path and left where they are, the same
   * way a replacing drop leaves them.
   */
  const keepOnly = useCallback((paths: readonly string[]) => {
    // A pass still reading would put a pruned document back, so this ends it.
    // The first-page read writes nothing more; a hand pass reports a stop.
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setIsReading(false);
      setIsPreviewing(false);
      setIsStopping(false);
      setReadProgress(null);
      setPendingReads([]);
    }
    const kept = new Set(paths);
    const rows = <T extends { path: string }>(prev: T[]) =>
      prev.filter((row) => kept.has(row.path));
    const keyed = <T>(prev: Record<string, T>) =>
      Object.fromEntries(Object.entries(prev).filter(([path]) => kept.has(path)));
    setEntries(rows);
    setValidations(keyed);
    setFailedFiles(rows);
    setScannedDocuments(rows);
    setUnreadDocuments(rows);
    setReadLanguages(keyed);
    setSourceUrl(null);
  }, []);

  const reset = useCallback(() => {
    setEntries([]);
    setValidations({});
    setFailedFiles([]);
    setPruned(null);
    setScannedDocuments([]);
    setUnreadDocuments([]);
    // Abandons a pass still in flight; its own `finally` clears the rest.
    abortRef.current?.abort();
    abortRef.current = null;
    setIsReading(false);
    setIsPreviewing(false);
    setIsStopping(false);
    setReadProgress(null);
    setStoppedReading(false);
    setReadLanguage(null);
    setReadLanguages({});
    setPendingReads([]);
    setLastPass(null);
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
    pruned,
    unreadDocuments,
    isReading,
    isPreviewing,
    readProgress,
    recoveredDocuments,
    scannedDocuments,
    readUnreadDocuments,
    readSelected,
    stopReading,
    decodeFileAs,
    isStopping,
    stoppedReading,
    readLanguage,
    readLanguages,
    pendingReads,
    lastPass,
    sourceUrl,
    isProcessing,
    isRepoLoading,
    processingStatus,
    isDragging,
    expandedArchive,
    progress,
    ingestBatch,
    keepOnly,
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

/**
 * A document's notes once recognition has read some of its lost pages: a loss
 * placed on pages keeps only the pages still unread and goes when none are.
 * What recognition cannot touch (a page that failed to load, hidden text, a
 * loss with no page) stays as it was.
 */
function afterRecognition(notes: readonly ExtractionNote[] | undefined, unread: readonly number[]): ExtractionNote[] {
  return (notes ?? []).flatMap((note) => {
    if ((note.kind !== "pages-scanned" && note.kind !== "text-undecodable") || !note.pages) return [note];
    const pages = note.pages.filter((page) => unread.includes(page));
    return pages.length ? [{ kind: note.kind, pages }] : [];
  });
}
