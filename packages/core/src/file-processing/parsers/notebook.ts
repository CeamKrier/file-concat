import type { ExtractionNote, ExtractionResult } from "./types";

/**
 * Jupyter notebooks, rendered as the document they represent.
 *
 * A `.ipynb` is JSON, so it already passed the byte classifier as text and went
 * into bundles whole: escaped newlines, per-cell metadata, execution counts,
 * and — the expensive part — base64 PNGs of every plot, which are worth nothing
 * to a model and routinely outweigh the code by an order of magnitude.
 *
 * What comes out here is markdown: prose cells verbatim, code cells fenced in
 * the notebook's own language, text outputs and tracebacks kept. Images and
 * other binary outputs are dropped and *counted*, never silently (ADR-0008).
 *
 * No dependency: the format is JSON and the rendering is ours.
 */

interface NotebookOutput {
  output_type?: string;
  text?: string | string[];
  data?: Record<string, unknown>;
  ename?: string;
  evalue?: string;
  traceback?: string[];
}

interface NotebookCell {
  cell_type?: string;
  source?: string | string[];
  outputs?: NotebookOutput[];
  attachments?: Record<string, unknown>;
}

interface Notebook {
  cells?: NotebookCell[];
  metadata?: {
    language_info?: { name?: string; file_extension?: string };
    kernelspec?: { language?: string; name?: string };
  };
}

/** nbformat stores multi-line strings as an array of lines, newlines included. */
function joinSource(source: string | string[] | undefined): string {
  if (typeof source === "string") return source;
  if (Array.isArray(source)) return source.join("");
  return "";
}

/** Tracebacks carry terminal colour codes that are pure noise in a bundle. */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex -- matching the escape is the point
  return text.replace(/\u001B\[[0-9;]*[A-Za-z]/g, "");
}

function languageOf(notebook: Notebook): string {
  const meta = notebook.metadata;
  return (
    meta?.language_info?.name ??
    meta?.kernelspec?.language ??
    // A kernel name like `python3` is the last hint available; the fence is
    // cosmetic, so guessing wrong costs nothing but a syntax highlight.
    meta?.kernelspec?.name?.replace(/\d+$/, "") ??
    ""
  );
}

/**
 * The text a single output carries, or `null` when it carries none — an image,
 * a widget, an HTML-only view. `text/plain` is preferred over every richer
 * representation because it is the one already meant to be read.
 */
function outputText(output: NotebookOutput): string | null {
  if (output.output_type === "stream") {
    const text = joinSource(output.text);
    return text.trim() ? text : null;
  }

  if (output.output_type === "error") {
    const header = [output.ename, output.evalue].filter(Boolean).join(": ");
    const trace = (output.traceback ?? []).map(stripAnsi).join("\n");
    const text = [header, trace].filter((part) => part.trim()).join("\n");
    return text.trim() ? text : null;
  }

  if (output.output_type === "execute_result" || output.output_type === "display_data") {
    const plain = output.data?.["text/plain"];
    const text = joinSource(plain as string | string[] | undefined);
    return text.trim() ? text : null;
  }

  return null;
}

/** Render one cell, appending to `parts`, and report what it could not carry. */
function renderCell(cell: NotebookCell, language: string, parts: string[]): number {
  let dropped = 0;
  const source = joinSource(cell.source).replace(/\s+$/, "");

  if (cell.cell_type === "code") {
    if (source) parts.push(`\`\`\`${language}\n${source}\n\`\`\``);
    // Images pasted into a markdown cell live here too, base64 and all.
    dropped += Object.keys(cell.attachments ?? {}).length;

    const rendered: string[] = [];
    for (const output of cell.outputs ?? []) {
      const text = outputText(output);
      if (text === null) dropped++;
      else rendered.push(text.replace(/\s+$/, ""));
    }
    if (rendered.length > 0) {
      parts.push(`Output:\n\`\`\`\n${rendered.join("\n")}\n\`\`\``);
    }
    return dropped;
  }

  dropped += Object.keys(cell.attachments ?? {}).length;
  // markdown and raw cells are already the prose the notebook is made of.
  if (source) parts.push(source);
  return dropped;
}

/**
 * Render a notebook to markdown. Answers with empty text — the contract's
 * "couldn't extract" (ADR-0003) — when the bytes are not a notebook after all,
 * which leaves the file surfaced as excluded rather than silently mangled.
 */
export function extractNotebook(bytes: Uint8Array): ExtractionResult {
  let notebook: Notebook;
  try {
    notebook = JSON.parse(new TextDecoder().decode(bytes)) as Notebook;
  } catch {
    return { text: "" };
  }
  if (!Array.isArray(notebook.cells)) return { text: "" };

  const language = languageOf(notebook);
  const parts: string[] = [];
  let dropped = 0;
  for (const cell of notebook.cells) {
    dropped += renderCell(cell, language, parts);
  }

  const notes: ExtractionNote[] = [];
  if (dropped > 0) notes.push({ kind: "attachments-skipped", count: dropped });

  const text = parts.join("\n\n").trim();
  return notes.length > 0 ? { text, notes } : { text };
}
