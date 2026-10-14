import { describe, expect, it } from "vitest";
import type { LiteParse } from "@llamaindex/liteparse-wasm";
import { parsePdfPages } from "~/lib/liteparse-pages";

/** A stand-in reader: `pages` pages, and a record of each read's header setting. */
function fakeParser(pages: number) {
  const reads: boolean[] = [];
  class Parser {
    constructor(private options: { keepHeadersFooters: boolean }) {}
    async parse() {
      reads.push(this.options.keepHeadersFooters);
      const strip = !this.options.keepHeadersFooters;
      return {
        pages: Array.from({ length: pages }, (_, i) => ({ pageNum: i + 1, markdown: strip ? "body" : "Header\n\nbody" })),
        pageErrors: [],
      };
    }
    free() {}
  }
  return { Parser: Parser as unknown as typeof LiteParse, reads };
}

describe("parsePdfPages", () => {
  it("keeps running headers on a document of several pages, for core to thin", async () => {
    const { Parser, reads } = fakeParser(3);
    const { pages } = await parsePdfPages(Parser, new Uint8Array());

    expect(reads).toEqual([true]);
    expect(pages.every((page) => page.text.startsWith("Header"))).toBe(true);
  });

  it("reads a single page again with liteparse's stripping on", async () => {
    const { Parser, reads } = fakeParser(1);
    const { pages } = await parsePdfPages(Parser, new Uint8Array());

    expect(reads).toEqual([true, false]);
    expect(pages).toEqual([{ number: 1, text: "body", scanned: false }]);
  });
});
