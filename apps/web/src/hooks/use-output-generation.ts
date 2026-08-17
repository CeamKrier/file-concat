import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ExcludedSummary,
  OutputFormat,
  OutputFormatPreference,
  OutputStyle,
} from "@fileconcat/core";
import {
  MULTI_OUTPUT_LIMIT,
  SPLIT_OUTPUT_ENABLED,
  assembleOutput,
  formatSize,
  generateFileTree,
  generateProjectName,
} from "@fileconcat/core";

import { currentRun, track, trackAmount } from "~/lib/metrics";
import { tagBundleReady, tagOutcome } from "~/lib/clarity-tags";

import type { ContentEntry } from "./use-file-ingestion";

/**
 * Browsers throttle programmatic `<a download>` clicks fired in quick
 * succession. A short spacer between blob downloads avoids dropped files in
 * Chromium-derived browsers, without showing up to the user.
 */
const DOWNLOAD_THROTTLE_MS = 100;

export interface OutputGenerationInputs {
  includedContents: ContentEntry[];
  /** Real content gaps (oversize / unextractable / binary) reported in the
   * bundle summary. Absent categories are simply not listed (ADR-0008). */
  excluded: ExcludedSummary;
  tokens: number;
  sourceUrl: string | null;
  outputStyle: OutputStyle;
  /** Persisted format preference. `"auto"` defers to {@link recommendedFormat}. */
  formatPreference: OutputFormatPreference;
  /** Persisted target size (KB) per part for multi-part output. */
  chunkSizeKB: number;
}

export interface OutputGeneration {
  recommendedFormat: OutputFormat;
  selectedFormat: OutputFormat;
  estimations: { single: string; multiple: string };
  isCopied: boolean;
  isGenerating: boolean;
  canEmit: boolean;
  copy: () => Promise<void>;
  download: () => Promise<void>;
  reset: () => void;
}

export function useOutputGeneration({
  includedContents,
  excluded,
  tokens,
  sourceUrl,
  outputStyle,
  formatPreference,
  chunkSizeKB,
}: OutputGenerationInputs): OutputGeneration {
  const [isCopied, setIsCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const recommendedFormat: OutputFormat = tokens > MULTI_OUTPUT_LIMIT ? "multi" : "single";
  // Split output is disabled (see SPLIT_OUTPUT_ENABLED): downloads stay single
  // regardless of the persisted preference. Flip the flag to restore multi-part.
  const selectedFormat: OutputFormat = !SPLIT_OUTPUT_ENABLED
    ? "single"
    : formatPreference === "auto"
      ? recommendedFormat
      : formatPreference;

  const chunks = useMemo(
    () => chunkContents(includedContents, chunkSizeKB * 1024),
    [includedContents, chunkSizeKB],
  );

  const estimations = useMemo(() => {
    const total = includedContents.reduce(
      (acc, file) => acc + new TextEncoder().encode(file.content).length,
      0,
    );
    const single = `~${formatSize(total)}`;

    if (chunks.length === 0) return { single, multiple: "0 files" };
    const sizes = chunks.map((chunk) =>
      chunk.reduce((acc, file) => acc + new TextEncoder().encode(file.content).length, 0),
    );
    const avg = Math.ceil(sizes.reduce((a, b) => a + b, 0) / sizes.length);
    const partWord = chunks.length === 1 ? "file" : "files";
    const multiple = `${chunks.length} ${partWord}, ~${formatSize(avg)} each`;
    return { single, multiple };
  }, [includedContents, chunks]);

  /**
   * The bundle's size is recorded once, when the bundle first exists — not when
   * it is exported (ADR-0014). Hanging it off copy/download meant an abandoned
   * run recorded no size at all, so "did they leave because the bundle was too
   * big" could not be asked, and a run that was copied and then downloaded
   * recorded the same bundle twice.
   *
   * The reading is the included content in bytes, which is what the UI shows and
   * what exists before anything is assembled. It is taken at the first settled
   * selection deliberately: that is the bundle the reader saw when they decided
   * whether to keep going.
   */
  const sizedRun = useRef<number | null>(null);
  useEffect(() => {
    const run = currentRun();
    if (run === null || run === sizedRun.current || includedContents.length === 0) return;
    sizedRun.current = run;
    const bytes = includedContents.reduce(
      (acc, file) => acc + new TextEncoder().encode(file.content).length,
      0,
    );
    trackAmount("bundle_size", { n: includedContents.length, b: bytes });
    // From here on, leaving without an export is abandonment (ADR-0016).
    tagBundleReady();
  }, [includedContents]);

  const buildSingle = useCallback(
    (files: ContentEntry[], part?: { index: number; total: number }) => {
      const tree = generateFileTree(files.map((f) => f.path));
      const projectName = generateProjectName(files.map((f) => f.path));
      return {
        projectName,
        text: assembleOutput({
          projectName,
          files,
          tree,
          style: outputStyle,
          source: sourceUrl ?? undefined,
          part,
          excluded,
        }),
      };
    },
    [outputStyle, sourceUrl, excluded],
  );

  const copy = useCallback(async () => {
    try {
      const { text } = buildSingle(includedContents);
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      // Recorded after the write succeeds: a failed copy is not an outcome.
      track("output_taken", "copy");
      tagOutcome("copied");
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  }, [buildSingle, includedContents]);

  const download = useCallback(async () => {
    setIsGenerating(true);
    try {
      const extension = outputStyle === "xml" ? "xml" : outputStyle === "markdown" ? "md" : "txt";
      const mimeType =
        outputStyle === "xml"
          ? "application/xml"
          : outputStyle === "markdown"
            ? "text/markdown"
            : "text/plain";

      if (selectedFormat === "single") {
        const { projectName, text } = buildSingle(includedContents);
        triggerDownload(text, outputFileName(projectName, extension), mimeType);
        track("output_taken", "download");
        tagOutcome("downloaded");
        return;
      }

      const total = chunks.length;
      for (let i = 0; i < total; i++) {
        const { projectName, text } = buildSingle(chunks[i], { index: i + 1, total });
        triggerDownload(
          text,
          outputFileName(projectName, extension, { index: i + 1, total }),
          mimeType,
        );
        if (i < total - 1) {
          await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_THROTTLE_MS));
        }
      }
      // One multi-part download is one outcome, however many parts it wrote.
      track("output_taken", "download");
      tagOutcome("downloaded");
    } catch (error) {
      console.error("Error generating output:", error);
    } finally {
      setIsGenerating(false);
    }
  }, [selectedFormat, includedContents, chunks, buildSingle, outputStyle]);

  // Format and chunk size are persisted preferences (owned by useConfig), so a
  // fresh ingest only clears the transient emit state — not the user's choices.
  const reset = useCallback(() => {
    setIsCopied(false);
    setIsGenerating(false);
  }, []);

  return {
    recommendedFormat,
    selectedFormat,
    estimations,
    isCopied,
    isGenerating,
    canEmit: includedContents.length > 0,
    copy,
    download,
    reset,
  };
}

function chunkContents(files: ContentEntry[], target: number): ContentEntry[][] {
  const chunks: ContentEntry[][] = [];
  let current: ContentEntry[] = [];
  let currentSize = 0;

  for (const file of files) {
    const fileSize = new TextEncoder().encode(file.content).length;

    if (currentSize + fileSize > target && current.length > 0) {
      chunks.push(current);
      current = [];
      currentSize = 0;
    }

    if (fileSize > target) {
      const parts = Math.ceil(fileSize / target);
      for (let i = 0; i < parts; i++) {
        const start = i * target;
        const end = Math.min((i + 1) * target, fileSize);
        chunks.push([
          {
            ...file,
            path: `${file.path} (part ${i + 1}/${parts})`,
            content: file.content.slice(start, end),
          },
        ]);
      }
      continue;
    }

    current.push(file);
    currentSize += fileSize;
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * A single-file (or single-chunk) download carries no part suffix; only a
 * genuine multi-part split (`total > 1`) is numbered. Keeping the one-part case
 * un-suffixed is what stops a bundle that fits in one chunk from ever
 * downloading as `…-part1`.
 */
function outputFileName(
  projectName: string,
  extension: string,
  part?: { index: number; total: number },
): string {
  if (!part || part.total === 1) return `${projectName}_fileconcat.${extension}`;
  return `${projectName}-fileconcat-part${part.index}.${extension}`;
}

function triggerDownload(text: string, fileName: string, mimeType: string) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
