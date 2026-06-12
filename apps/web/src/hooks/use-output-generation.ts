import { useCallback, useMemo, useState } from "react";
import type { OutputFormat } from "@fileconcat/core";
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
  outputStyle: "xml" | "markdown";
}

export interface OutputGeneration {
  chunkSizeKB: number;
  setChunkSizeKB: (kb: number) => void;
  recommendedFormat: OutputFormat;
  selectedFormat: OutputFormat;
  setUserPickedFormat: (format: OutputFormat) => void;
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
}: OutputGenerationInputs): OutputGeneration {
  const [chunkSizeKB, setChunkSizeKB] = useState(32);
  const [userPickedFormat, setUserPickedFormat] = useState<OutputFormat | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const recommendedFormat: OutputFormat = tokens > MULTI_OUTPUT_LIMIT ? "multi" : "single";
  const selectedFormat: OutputFormat = userPickedFormat ?? recommendedFormat;

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
    const multiple = `${chunks.length} files, ~${formatSize(avg)} each`;
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
      const extension = outputStyle === "xml" ? "xml" : "md";
      const mimeType = outputStyle === "xml" ? "application/xml" : "text/markdown";

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

  const reset = useCallback(() => {
    setMaxFileSizeMB(32);
    setUserPickedFormat(null);
    setIsCopied(false);
    setIsGenerating(false);
  }, []);

  return {
    chunkSizeKB,
    setChunkSizeKB,
    recommendedFormat,
    selectedFormat,
    setUserPickedFormat: (format: OutputFormat) => setUserPickedFormat(format),
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

