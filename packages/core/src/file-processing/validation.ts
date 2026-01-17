import type { FileValidationResult, ProcessingConfig } from '../types';
import { BINARY_EXTENSIONS } from './binary-extensions';

/**
 * Check if a file is binary based on its extension
 */
export const isBinaryFile = async (file: File): Promise<boolean> => {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension && BINARY_EXTENSIONS.includes(extension)) {
    return true;
  }
  return false;
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
