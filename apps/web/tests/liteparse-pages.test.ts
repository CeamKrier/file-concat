import { describe, expect, it } from "vitest";
import type { LiteParse } from "@llamaindex/liteparse-wasm";
import { parsePdfPages } from "~/lib/liteparse-pages";

/** A stand-in reader: `pages` pages, and a record of each read's header setting. */
function fakeParser(pages: number, tree?: unknown) {
  const reads: boolean[] = [];
  class Parser {
    constructor(private options: { keepHeadersFooters: boolean }) {}
    async parse() {
      reads.push(this.options.keepHeadersFooters);
      const strip = !this.options.keepHeadersFooters;
      return {
        pages: Array.from({ length: pages }, (_, i) => ({ pageNum: i + 1, markdown: strip ? "body" : "Header\n\nbody", structureTree: tree })),
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

  it("hands over each tagged figure's alternative text, nested ones included", async () => {
    const element = (type: string, children: unknown[] = [], altText?: string) => ({ type, altText, children });
    const tree = { roots: [element("Document", [element("Figure", [], "Chart"), element("P", [], "not a figure"), element("Sect", [element("Figure", [], "Map")])])] };
    const { Parser } = fakeParser(1, tree);
    const { pages } = await parsePdfPages(Parser, new Uint8Array());

    expect(pages[0]?.figures).toEqual(["Chart", "Map"]);
  });
});

/**
 * A stand-in reader over pages whose text items lie at the given angles, each
 * item `chars` characters long. Like liteparse's markdown, a page reads empty
 * unless its text is upright or a correction turned it so.
 */
function sidewaysParser(pages: { rotation: number; chars?: number }[][]) {
  const corrections: unknown[] = [];
  class Parser {
    constructor(private options: { pageOrientationCorrections?: { page: number; angle: number }[] }) {}
    async parse() {
      corrections.push(this.options.pageOrientationCorrections);
      const turned = new Map((this.options.pageOrientationCorrections ?? []).map((c) => [c.page, c.angle]));
      return {
        pages: pages.map((items, i) => {
          const upright = items.some((item) => (item.rotation - (turned.get(i + 1) ?? 0)) % 360 === 0);
          return {
            pageNum: i + 1,
            markdown: upright ? `page ${i + 1}` : "",
            textItems: items.map((item) => ({ rotation: item.rotation, text: "x".repeat(item.chars ?? 10) })),
          };
        }),
        pageErrors: [],
      };
    }
    free() {}
  }
  return { Parser: Parser as unknown as typeof LiteParse, corrections };
}

describe("parsePdfPages on a sideways page", () => {
  it("reads a page set at a quarter turn upright again", async () => {
    const { Parser, corrections } = sidewaysParser([[{ rotation: 90 }], [{ rotation: 0 }], [{ rotation: 0 }]]);
    const { pages } = await parsePdfPages(Parser, new Uint8Array());

    expect(corrections).toEqual([undefined, [{ page: 1, angle: 90 }]]);
    expect(pages.map((page) => page.text)).toEqual(["page 1", "page 2", "page 3"]);
  });

  it("leaves a page alone when its upright text outweighs a sideways margin note", async () => {
    const { Parser, corrections } = sidewaysParser([
      [{ rotation: 0, chars: 400 }, { rotation: 270, chars: 30 }],
      [{ rotation: 0 }],
    ]);
    await parsePdfPages(Parser, new Uint8Array());

    expect(corrections).toEqual([undefined]);
  });

  it("lets no diagonal watermark turn a page", async () => {
    const { Parser, corrections } = sidewaysParser([[{ rotation: 315, chars: 900 }, { rotation: 0 }], [{ rotation: 0 }]]);
    await parsePdfPages(Parser, new Uint8Array());

    expect(corrections).toEqual([undefined]);
  });
});
