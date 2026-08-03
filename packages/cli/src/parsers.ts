import { createParserRegistry, extractOfficeDocument, type ParserRegistry } from "@fileconcat/core";

/**
 * The CLI's parser loader map (ADR-0012). Core routes; this decides what the
 * published npm package is willing to carry.
 *
 * Only `office` is registered. tsup bundles core (`noExternal`), so every
 * loader named here becomes a dependency of a package whose users are mostly
 * concatenating code repositories — which is why the map is a platform choice
 * and not something core hard-codes.
 *
 * No `pdfWorkerSrc`: that option exists for the browser, where the worker must
 * be self-hosted (ADR-0003). Under node officeparser resolves its own.
 */
export const parsers: ParserRegistry = createParserRegistry({
  office: (bytes) => extractOfficeDocument(bytes),
});
