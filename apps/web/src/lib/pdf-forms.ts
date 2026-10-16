import { classifyBytes, type PdfAttachment, type PdfPage } from "@fileconcat/core";

/**
 * A PDF's form fields and attached files, read with pdf.js, which liteparse
 * does not give: it reports a field's name and nothing of its value, its
 * user-facing name (`/TU`) or a check box's state, and no attached file.
 * Kept apart from the worker, as `liteparse-pages.ts` is, so the extraction
 * measurement reads PDFs exactly as the browser does, each passing its own
 * build of pdf.js.
 *
 * Run only when `pdfMayHoldFormsOrFiles` finds a form or an attachment, so an
 * ordinary PDF never loads pdf.js for it (Q36 O1).
 */

/** The part of pdf.js read here. */
export interface PdfJs {
  getDocument(source: { data: Uint8Array; isEvalSupported?: boolean; verbosity?: number }): {
    promise: Promise<PdfDocument>;
    destroy(): Promise<void>;
  };
}

interface PdfDocument {
  numPages: number;
  getPage(number: number): Promise<{ getAnnotations(): Promise<Annotation[]>; cleanup(): void }>;
  getAttachments(): Promise<Map<string, FileSpec> | Record<string, FileSpec> | null>;
  getAttachmentContent(id: string): Promise<Uint8Array | null>;
}

interface FileSpec {
  filename?: string;
  description?: string;
}

interface Annotation {
  subtype?: string;
  hidden?: boolean;
  fieldName?: string;
  fieldValue?: unknown;
  /** The field's `/TU`, the name a viewer shows. */
  alternativeText?: string;
  checkBox?: boolean;
  radioButton?: boolean;
  pushButton?: boolean;
  /** A check box's on state. */
  exportValue?: string;
  /** A radio button's own state. */
  buttonValue?: string;
  file?: FileSpec;
  fileId?: string;
}

/** A body past this is named, not included: a text attachment is notes or data, not a book. */
const MAX_BODY = 1 << 20;
/**
 * Once the bodies read reach this, the rest are named, not read. pdf.js decodes
 * a body whole before its size is known, so one body can pass it; the tab that
 * pays is the one that dropped the file.
 */
const BODY_BUDGET = 16 << 20;
/** Attachments read per document; past this they are not listed either. */
const MAX_FILES = 200;

export interface PdfForms {
  pages: Map<number, Pick<PdfPage, "fields" | "attachments">>;
  files: PdfAttachment[];
}

export async function readPdfForms(pdfjs: PdfJs, bytes: Uint8Array): Promise<PdfForms> {
  // A copy, since pdf.js hands its buffer to its worker.
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, verbosity: 0 });
  const pages: PdfForms["pages"] = new Map();
  const files: PdfAttachment[] = [];
  let budget = BODY_BUDGET;
  let listed = 0;
  try {
    const document = await task.promise;
    // The text of a text file, else nothing; read within the budget.
    const body = async (id: string): Promise<string | undefined> => {
      if (budget <= 0) return undefined;
      const content = await document.getAttachmentContent(id).catch(() => null);
      if (!content) return undefined;
      budget -= content.length;
      if (content.length > MAX_BODY) return undefined;
      const read = classifyBytes(content);
      return read.classification === "text" ? read.text : undefined;
    };
    const attachment = async (spec: FileSpec | undefined, id: string | undefined): Promise<PdfAttachment | undefined> => {
      if (!spec || listed >= MAX_FILES) return undefined;
      listed++;
      const text = id ? await body(id) : undefined;
      return {
        name: spec.filename ?? "",
        ...(spec.description ? { description: spec.description } : {}),
        ...(text !== undefined ? { text } : {}),
      };
    };

    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const fields: NonNullable<PdfPage["fields"]> = [];
      const attachments: PdfAttachment[] = [];
      const radios = new Set<string>();
      for (const annotation of await page.getAnnotations()) {
        if (annotation.hidden) continue;
        if (annotation.subtype === "FileAttachment") {
          const file = await attachment(annotation.file, annotation.fileId);
          if (file) attachments.push(file);
          continue;
        }
        if (annotation.subtype !== "Widget" || annotation.pushButton) continue;
        const name = annotation.alternativeText?.trim() || annotation.fieldName || "";
        const value = annotation.fieldValue;
        if (annotation.checkBox) {
          fields.push({ name, value: typeof value === "string" && value !== "Off" && (!annotation.exportValue || value === annotation.exportValue) });
        } else if (annotation.radioButton) {
          // A group is one field drawn as several buttons: written once, as the chosen one.
          if (typeof value === "string" && value === annotation.buttonValue && !radios.has(name)) {
            radios.add(name);
            fields.push({ name, value });
          }
        } else if (typeof value === "string") fields.push({ name, value });
        else if (Array.isArray(value)) fields.push({ name, value: value.filter((item) => typeof item === "string").join(", ") });
      }
      page.cleanup();
      if (fields.length || attachments.length) {
        pages.set(number, { ...(fields.length ? { fields } : {}), ...(attachments.length ? { attachments } : {}) });
      }
    }

    const tree = await document.getAttachments();
    const entries = tree instanceof Map ? Array.from(tree) : Object.entries(tree ?? {});
    for (const [id, spec] of entries) {
      const file = await attachment({ ...spec, filename: spec.filename || id }, id);
      if (file) files.push(file);
    }
  } finally {
    await task.destroy();
  }
  return { pages, files };
}

/** `pages` with each page's fields and attached files added. */
export function withPdfForms(pages: readonly PdfPage[], forms: PdfForms): PdfPage[] {
  return pages.map((page) => ({ ...page, ...forms.pages.get(page.number) }));
}
