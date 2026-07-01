import type { FileValidationResult, ProcessingConfig } from "../types";
import { BINARY_EXTENSIONS } from "./binary-extensions";

/** How many leading bytes to sample when sniffing for binary content. */
const SNIFF_BYTES = 8192;

/**
 * Content-based binary check. A NUL byte in the sampled prefix is the classic,
 * reliable tell: text files (source, configs, logs, JSON, even UTF-8 with odd
 * extensions) effectively never contain one, while images, archives,
 * executables, and office documents carry NUL within their first few KB. This
 * lets an oddly-named text file through (an `.ai` that is really XML) and
 * catches a mislabeled binary regardless of its extension.
 */
export function isBinaryContent(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, SNIFF_BYTES);
  for (let i = 0; i < limit; i++) {
    if (bytes[i] === 0) return true;
  }
  return false;
}

/**
 * Decide whether `file` is binary. Content wins: sniff the leading bytes and
 * only fall back to the extension allowlist when the bytes can't be read.
 */
export const isBinaryFile = async (file: File): Promise<boolean> => {
  try {
    const prefix = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
    return isBinaryContent(prefix);
  } catch {
    const extension = file.name.split(".").pop()?.toLowerCase();
    return !!extension && BINARY_EXTENSIONS.includes(extension);
  }
};

/**
 * Validate a file against the processing configuration
 */
export const validateFile = async (
  file: File,
  config: ProcessingConfig,
): Promise<FileValidationResult> => {
  const result: FileValidationResult = {
    isValid: true,
    reason: undefined,
  };

  // Size check
  if (file.size > config.maxFileSizeMB * 1024 * 1024) {
    result.isValid = false;
    result.reason = `File size exceeds ${config.maxFileSizeMB}MB limit`;
    return result;
  }

  // Hidden file check
  if (config.excludeHiddenFiles && file.name.startsWith(".")) {
    result.isValid = false;
    result.reason = "Hidden file";
    return result;
  }

  // Binary file check
  if (config.excludeBinaryFiles && (await isBinaryFile(file))) {
    result.isValid = false;
    result.reason = "Binary file";
    return result;
  }

  return result;
};
