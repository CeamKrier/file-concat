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

  it("writes a web link over the words its rectangle covers, in place when they occur once", async () => {
    const item = (text: string, y: number) => ({ text, x: 0, y, width: text.length * 10, height: 10, rotation: 0 });
    const link = (uri: string, x: number, width: number, y: number) => ({ subtype: "link", uri, rect: { x, y, width, height: 10 } });
    class Parser {
      async parse() {
        const markdown = "Read our docs today\n\ndocs again docs";
        const textItems = [item("Read our docs today", 0), item("docs again docs", 20)];
        const annotations = [
          link("https://x.example/docs", 50, 80, 0),
          link("https://x.example/again", 100, 50, 20),
          link("#page=2", 0, 40, 0),
          link("https://x.example/none", 0, 100, 60),
        ];
        return { pages: [{ pageNum: 1, markdown, textItems, annotations }, { pageNum: 2, markdown, textItems, annotations }], pageErrors: [] };
      }
      free() {}
    }
    const { pages } = await parsePdfPages(Parser as unknown as typeof LiteParse, new Uint8Array());

    expect(pages[0]?.text).toBe("Read [our docs](https://x.example/docs) today\n\ndocs again docs\n\n[docs](https://x.example/again)");
  });

  it("hands over review comments, with the words a highlight covers", async () => {
    const item = (text: string, y: number) => ({ text, x: 0, y, width: text.length * 10, height: 10, rotation: 0 });
    const rect = (x: number, y: number, width: number) => ({ x, y, width, height: 10 });
    class Parser {
      async parse() {
        const textItems = [item("Net revenue rose", 0), item("Costs fell", 20)];
        const annotations = [
          { subtype: "highlight", contents: "Check", title: "Ann", rect: rect(0, 0, 160), quadpointRects: [rect(0, 0, 110), rect(0, 20, 50)] },
          { subtype: "text", contents: "Margin note", rect: rect(300, 0, 20) },
          { subtype: "popup", contents: "the popup's own", rect: rect(300, 0, 20) },
          { subtype: "widget", title: "field name", rect: rect(0, 40, 20) },
          { subtype: "square", contents: " ", rect: rect(0, 0, 20) },
        ];
        return { pages: [1, 2].map((pageNum) => ({ pageNum, markdown: "Net revenue rose\n\nCosts fell", textItems, annotations })), pageErrors: [] };
      }
      free() {}
    }
    const { pages } = await parsePdfPages(Parser as unknown as typeof LiteParse, new Uint8Array());

    expect(pages[0]?.comments).toEqual([
      { text: "Check", author: "Ann", anchor: "Net revenue Costs" },
      { text: "Margin note" },
    ]);
  });
});

/**
 * A stand-in reader over pages whose text items lie at the given angles, each
 * item `chars` characters long. Like liteparse's markdown, a page reads empty
 * unless its text is upright or a correction turned it so, and a turned page's
 * items come back turned with it.
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
            textItems: items.map((item) => ({ rotation: item.rotation - (turned.get(i + 1) ?? 0), text: "x".repeat(item.chars ?? 10) })),
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

  it("writes an upright page's vertical lines after its text, a line repeated across pages once", async () => {
    const item = (text: string, x: number, rotation: number) => ({ text, x, y: 0, width: 10, height: 100, rotation });
    class Parser {
      async parse() {
        const banner = item("arXiv:2310.01234 [cs.CL]", 20, 90);
        return {
          pages: [
            { pageNum: 1, markdown: "Body one", textItems: [item("Body one", 100, 0), banner, item("Total", 500, 270), item("cost", 500, 270), item("Diagonal", 300, 45)] },
            { pageNum: 2, markdown: "Body two Shown", textItems: [item("Body two", 100, 0), banner, item("Shown", 500, 270)] },
          ],
          pageErrors: [],
        };
      }
      free() {}
    }
    const { pages } = await parsePdfPages(Parser as unknown as typeof LiteParse, new Uint8Array());

    expect(pages.map((page) => page.text)).toEqual(["Body one\n\narXiv:2310.01234 [cs.CL]\n\nTotal cost", "Body two Shown"]);
  });

  it("lets no diagonal watermark turn a page", async () => {
    const { Parser, corrections } = sidewaysParser([[{ rotation: 315, chars: 900 }, { rotation: 0 }], [{ rotation: 0 }]]);
    await parsePdfPages(Parser, new Uint8Array());

    expect(corrections).toEqual([undefined]);
  });
});
