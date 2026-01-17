/**
 * Remove empty lines from content
 */
export function removeEmptyLines(content: string): string {
  return content.replace(/^\s*[\r\n]/gm, '');
}

/**
 * Add line numbers to content
 */
export function addLineNumbers(content: string): string {
  // Normalize line endings to LF before processing
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return normalized
    .split('\n')
    .map((line, index) => `${String(index + 1).padStart(4, ' ')} | ${line}`)
    .join('\n');
}

export type TransformOptions = {
  removeEmptyLines?: boolean;
  showLineNumbers?: boolean;
};

/**
 * Process file content with specified transformations
 */
export function processFileContent(content: string, _language: string, options: TransformOptions): string {
  let processed = content;

  if (options.removeEmptyLines) {
    processed = removeEmptyLines(processed);
  }

  if (options.showLineNumbers) {
    processed = addLineNumbers(processed);
  }

  return processed;
}
