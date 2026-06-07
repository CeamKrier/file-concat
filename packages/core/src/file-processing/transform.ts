/**
 * Add line numbers to content
 */
export function addLineNumbers(content: string): string {
  // Normalize line endings to LF before processing
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  // Drop a trailing empty element produced by a final newline so we don't
  // number a phantom line after the last real one.
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines
    .map((line, index) => `${String(index + 1).padStart(4, ' ')} | ${line}`)
    .join('\n');
}

export type TransformOptions = {
  showLineNumbers?: boolean;
};

/**
 * Process file content with specified transformations
 */
export function processFileContent(content: string, _language: string, options: TransformOptions): string {
  let processed = content;

  if (options.showLineNumbers) {
    processed = addLineNumbers(processed);
  }

  return processed;
}
