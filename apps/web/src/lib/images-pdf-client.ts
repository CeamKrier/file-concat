/**
 * Images in, PDF out: one image per page, each under an "Image N" bar, split
 * into parts an AI chat reads whole. Browser only (canvas); callers guard with
 * `import.meta.env.SSR` before importing.
 *
 * Every image is redrawn on a canvas and stored as JPEG. That is a deliberate
 * departure from passing JPEG bytes through: one path covers PNG, WebP,
 * transparency and rotation, the file stays small, and nothing the photo
 * carried besides its pixels (location, camera) reaches the PDF. Measured
 * 2026-11-25: this encoding answered 72 of 72 questions on Claude, ChatGPT
 * and Gemini.
 */

/** Long edge of a page's image. The measured value; raise only with a rerun. */
export const MAX_SIDE = 2000;
const QUALITY = 0.8;
/** Claude reads a PDF's pages as images only up to this many pages. */
export const MAX_PAGES = 100;
/** Gemini takes 100 MB per file; a part closes before that. */
export const MAX_BYTES = 90_000_000;
/** A capture taller than 3x its width is cut into pages at this width. */
const TALL_WIDTH = 1200;
const OVERLAP = 80;
/** Past these an image is left out and named: a hostile or broken file must not take the tab down. */
const MAX_SOURCE_PIXELS = 100_000_000;
const MAX_SLICES = 40;

export interface PdfPage {
  jpeg: Blob;
  width: number;
  height: number;
}

export interface Layout {
  width: number;
  height: number;
  /** Rows of the scaled image each page shows. */
  slices: { top: number; height: number }[];
}

/** Scaled size of an image, and where a long scrolling capture is cut. */
export function layout(w: number, h: number): Layout {
  const tall = h > 3 * w;
  const s = tall ? Math.min(1, TALL_WIDTH / w) : Math.min(1, MAX_SIDE / Math.max(w, h));
  const width = Math.max(1, Math.round(w * s));
  const height = Math.max(1, Math.round(h * s));
  if (height <= MAX_SIDE) return { width, height, slices: [{ top: 0, height }] };
  const slices: Layout["slices"] = [];
  // Neighbouring pages share a strip, so a line cut by one edge is whole on the other.
  for (let top = 0; top < height; top += MAX_SIDE - OVERLAP) {
    slices.push({ top, height: Math.min(MAX_SIDE, height - top) });
    if (top + MAX_SIDE >= height) break;
  }
  return { width, height, slices };
}

/** Pages in order, cut where a part would pass the page or byte limit. */
export function planParts<T extends { jpeg: { size: number } }>(
  pages: readonly T[],
  maxPages = MAX_PAGES,
  maxBytes = MAX_BYTES,
): T[][] {
  const parts: T[][] = [];
  let bytes = 0;
  for (const page of pages) {
    const last = parts[parts.length - 1];
    if (!last || last.length >= maxPages || bytes + page.jpeg.size > maxBytes) {
      parts.push([page]);
      bytes = page.jpeg.size;
    } else {
      last.push(page);
      bytes += page.jpeg.size;
    }
  }
  return parts;
}

/**
 * A PDF whose every page is one JPEG at the page's own size. Nothing but
 * numbers is written into the PDF's syntax: no title, no file name.
 */
export function writePdf(pages: readonly PdfPage[]): Blob {
  const parts: BlobPart[] = [];
  const offsets: number[] = [];
  let pos = 0;
  // Every string below is ASCII, so its length is its byte length.
  const put = (part: string | Blob) => {
    parts.push(part);
    pos += typeof part === "string" ? part.length : part.size;
  };
  const obj = (n: number, body: string, stream?: string | Blob) => {
    offsets[n] = pos;
    put(`${n} 0 obj\n${body}\n`);
    if (stream !== undefined) {
      put("stream\n");
      put(stream);
      put("\nendstream\n");
    }
    put("endobj\n");
  };
  put("%PDF-1.4\n");
  put(new Blob([new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])]));
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Count ${pages.length} /Kids [${kids}] >>`);
  pages.forEach((p, i) => {
    const page = 3 + i * 3;
    const draw = `q ${p.width} 0 0 ${p.height} 0 0 cm /Im0 Do Q`;
    obj(
      page,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.width} ${p.height}] /Resources << /XObject << /Im0 ${page + 2} 0 R >> >> /Contents ${page + 1} 0 R >>`,
    );
    obj(page + 1, `<< /Length ${draw.length} >>`, draw);
    obj(
      page + 2,
      `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.size} >>`,
      p.jpeg,
    );
  });
  const xref = pos;
  const count = 3 + pages.length * 3;
  put(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) put(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  put(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: "application/pdf" });
}

const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", QUALITY),
  );
}

export interface ImagesPdf {
  /** One PDF per part, in order. */
  parts: Blob[];
  pages: number;
  images: number;
  /** Paths left out: the browser could not open them as an image, or they are too large. */
  skipped: string[];
}

/** Build the PDF parts for these images, in natural name order. */
export async function imagesToPdf(
  files: readonly { path: string; file: Blob }[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<ImagesPdf> {
  const sorted = [...files].sort((a, b) => byName.compare(a.path, b.path));
  const pages: PdfPage[] = [];
  const skipped: string[] = [];
  const canvas = document.createElement("canvas");
  let images = 0;
  for (const [i, { path, file }] of sorted.entries()) {
    signal?.throwIfAborted();
    let bmp: ImageBitmap;
    try {
      // ponytail: decodes at full size before scaling; a 48 MP photo holds about
      // 190 MB for a moment. Pass resizeWidth once a header-only size read exists.
      bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      skipped.push(path);
      onProgress?.(i + 1, sorted.length);
      continue;
    }
    const { width, height, slices } = layout(bmp.width, bmp.height);
    if (bmp.width * bmp.height > MAX_SOURCE_PIXELS || slices.length > MAX_SLICES) {
      bmp.close();
      skipped.push(path);
      onProgress?.(i + 1, sorted.length);
      continue;
    }
    images += 1;
    const bar = Math.max(28, Math.round(width * 0.035));
    for (const [k, slice] of slices.entries()) {
      canvas.width = width;
      canvas.height = slice.height + bar;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d canvas");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#000";
      ctx.font = `600 ${Math.round(bar * 0.6)}px sans-serif`;
      ctx.textBaseline = "middle";
      const part = slices.length > 1 ? ` (part ${k + 1} of ${slices.length})` : "";
      ctx.fillText(`Image ${images}${part}`, Math.round(bar * 0.3), bar / 2);
      ctx.drawImage(bmp, 0, bar - slice.top, width, height);
      pages.push({ jpeg: await encode(canvas), width, height: canvas.height });
    }
    bmp.close();
    onProgress?.(i + 1, sorted.length);
  }
  canvas.width = canvas.height = 0;
  return { parts: planParts(pages).map(writePdf), pages: pages.length, images, skipped };
}
