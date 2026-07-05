import type { FileValidationResult, ProcessingConfig } from "../types";
import { BINARY_EXTENSIONS } from "./binary-extensions";
import { classifyBytes, type TextClassification } from "./text-classification";

/** How many leading bytes to sample when sniffing a file's content. */
const SNIFF_BYTES = 8192;

/**
 * Classify a file's content: sniff a leading sample and let the content decide,
 * falling back to the extension denylist only when the bytes can't be read.
 */
async function classifyFile(file: File): Promise<TextClassification> {
  try {
    const prefix = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
    return classifyBytes(prefix).classification;
  } catch {
    const extension = file.name.split(".").pop()?.toLowerCase();
    return extension && BINARY_EXTENSIONS.includes(extension) ? "binary" : "text";
  }
}

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

  // Content check: binary is excluded; ambiguous is kept but flagged so the
  // user can drop it if the bundle shows garbage.
  if (config.excludeBinaryFiles) {
    const classification = await classifyFile(file);
    result.classification = classification;
    if (classification === "binary") {
      result.isValid = false;
      result.reason = "Binary file";
    }
  }

  return result;
};
