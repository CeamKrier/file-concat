import { unzlibSync } from "fflate";
import { MOBI } from "foliate-js/mobi.js";
import type { ExtractionResult } from "@fileconcat/core";
import { turndown } from "./turndown-client";

/**
 * Kindle books, old MOBI and KF8 (`.azw3`), read by foliate-js, the Foliate
 * reader's engine (extraction router, R5d). Client-only, reached through the
 * guarded dynamic import in ./parsers. In the extraction eval it agreed with
 * Project Gutenberg's own text at 0.996 (mobi) and 0.991 (azw3) over 15 books;
 * before it the product named these files and read none of them.
 */

/** Internal links (`filepos:`, `kindle:pos:`) resolve against this and fall to their text. */
const BASE = "https://localhost/";

export async function extractMobi(bytes: Uint8Array): Promise<ExtractionResult> {
  // foliate-js parses the PalmDOC encryption field and never checks it, so a
  // store-bought book would decode to noise. No reader opens DRM.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const record0 = view.getUint32(78);
  if (view.getUint16(record0 + 12) !== 0) throw new Error("DRM-protected Kindle book");

  const book = await new MOBI({ unzlib: unzlibSync }).open(new Blob([bytes]));
  const service = turndown(BASE);
  // A picture's source is a record inside the book; its alt text is all that reads.
  service.addRule("image", {
    filter: "img",
    replacement: (_content, node) => (node as HTMLElement).getAttribute("alt")?.trim() ?? "",
  });
  const parts: string[] = [];
  for (const section of book.sections) {
    const doc = await section.createDocument?.();
    // As a string: a KF8 section is XHTML, whose lowercase node names Turndown's
    // rules do not match, and its markup reparses as HTML.
    const text = doc?.body ? service.turndown(doc.body.innerHTML).trim() : "";
    if (text) parts.push(text);
  }
  if (parts.length === 0) return { text: "" };
  const title = typeof book.metadata?.title === "string" ? book.metadata.title.trim() : "";
  return { text: [title && `# ${title}`, ...parts].filter(Boolean).join("\n\n"), reader: "foliate" };
}
