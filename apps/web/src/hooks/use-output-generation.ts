import { useCallback, useMemo, useState } from "react";
import type { OutputFormat, OutputFormatPreference, OutputStyle } from "@fileconcat/core";
import {
  MULTI_OUTPUT_LIMIT,
  assembleOutput,
  formatSize,
  generateFileTree,
  generateProjectName,
} from "@fileconcat/core";

import type { ContentEntry } from "./use-file-ingestion";

/**
 * Browsers throttle programmatic `<a download>` clicks fired in quick
 * succession. A short spacer between blob downloads avoids dropped files in
 * Chromium-derived browsers, without showing up to the user.
 */
const DOWNLOAD_THROTTLE_MS = 100;

export interface OutputGenerationInputs {
  includedContents: ContentEntry[];
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
  tokens,
  sourceUrl,
  outputStyle,
  formatPreference,
  chunkSizeKB,
}: OutputGenerationInputs): OutputGeneration {
  const [isCopied, setIsCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const recommendedFormat: OutputFormat = tokens > MULTI_OUTPUT_LIMIT ? "multi" : "single";
  const selectedFormat: OutputFormat =
    formatPreference === "auto" ? recommendedFormat : formatPreference;

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
        }),
      };
    },
    [outputStyle, sourceUrl],
  );

  const copy = useCallback(async () => {
    try {
      const { text } = buildSingle(includedContents);
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
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
        triggerDownload(text, `${projectName}_fileconcat.${extension}`, mimeType);
        return;
      }

      const total = chunks.length;
      for (let i = 0; i < total; i++) {
        const { projectName, text } = buildSingle(chunks[i], { index: i + 1, total });
        triggerDownload(text, `${projectName}-fileconcat-part${i + 1}.${extension}`, mimeType);
        if (i < total - 1) {
          await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_THROTTLE_MS));
        }
      }
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
