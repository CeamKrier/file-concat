import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatPpt } from "../src/file-processing/parsers/ppt";
import { amend, atom, deckStreams, group, shape, slideContainer, text, textLink, u32s } from "./fixtures/ppt";

const UNAVAILABLE = { text: "", notes: [{ kind: "parser-unavailable" }] };
/** PlaceholderEnum (MS-PPT 2.13.21). */
const PH = { masterTitle: 1, slideNumber: 8, footer: 9, header: 10, notesImage: 11, notesBody: 12, title: 13, body: 14 };

describe("formatPpt", () => {
  it("writes the automatic number PowerPoint shows before a numbered paragraph", () => {
    const u16s = (...values: number[]) => Uint8Array.from(values.flatMap((v) => [v & 0xff, (v >> 8) & 0xff]));
    const cat = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((part) => Array.from(part)));
    // One paragraph run for the whole text, then a character run per paragraph naming its ___PPT9 entry.
    const runs = (pp9rts: [number, number][]) =>
      atom(0x0fa1, cat(u32s(13), u16s(0), u32s(0), ...pp9rts.map(([count, rt]) => cat(u32s(count, 0x3c00), u16s(rt << 10)))));
    const pp9 = cat(
      // Entry 0: alphaLcParenRight from 3. Entry 1: no number. Entry 2: numbered, no scheme.
      u32s(0x3000000), u16s(1, 9, 3), u32s(0, 0),
      u32s(0, 0, 0),
      u32s(0x2000000), u16s(1), u32s(0, 0),
    );
    const body = [...text("A\rB\rC\rD\rE"), runs([[2, 0], [2, 0], [2, 1], [2, 0], [3, 2]])];
    expect(formatPpt(deckStreams({ slides: [{ shapes: [shape({ text: body, pp9 })] }] })).text).toContain(
      "c) A\nd) B\nC\nc) D\n1. E",
    );
  });

  it("marks each slide, labels a hidden one, keeps a table's rows and the master text and footer once", () => {
    const { text: out } = formatPpt(
      deckStreams({
        slides: [
          {
            outline: [...text("QZTITLE"), ...text("QZBODYONE\rQZBODYTWO")],
            shapes: [
              shape({ ph: PH.title, outline: 0 }),
              shape({ ph: PH.body, outline: 1 }),
              shape({ text: text("QZTEXTBOX") }),
              // Furniture: the number is what the marker says, the footer comes once below.
              shape({ ph: PH.slideNumber, text: text("*", { fields: [0] }) }),
              shape({ ph: PH.footer, text: text("QZFOOTER") }),
            ],
          },
          { hidden: true, shapes: [shape({ text: text("QZHIDDENTITLE") })] },
          {
            shapes: [
              group(
                [
                  shape({ anchor: [0, 0], text: text("QZCELLA") }),
                  shape({ anchor: [100, 0], text: text("QZCELLB") }),
                  shape({ anchor: [0, 50], text: text("QZCELLC") }),
                  shape({ anchor: [100, 50], text: text("QZCELLD") }),
                  // A grid line between the cells; placed, it would add a column and a row.
                  shape({ anchor: [50, 25], shapeType: 20 }),
                ],
                true,
              ),
            ],
          },
        ],
        masters: [
          {
            shapes: [
              shape({ ph: PH.masterTitle, text: text("Click to edit Master title style") }),
              shape({ text: text("QZMASTERTEXT") }),
              shape({ ph: PH.footer, text: text("*", { fields: [0], fieldType: 0x0ffa }) }),
            ],
          },
        ],
        footer: { text: "QZFOOTER", on: true },
      }),
    );
    expect(out).toBe(
      [
        "# Slide 1\nQZTITLE\nQZBODYONE\nQZBODYTWO\nQZTEXTBOX",
        "# Slide 2 (hidden)\nQZHIDDENTITLE",
        "# Slide 3\nQZCELLA\tQZCELLB\nQZCELLC\tQZCELLD",
        "# Master\nQZMASTERTEXT\nFooter: QZFOOTER",
      ].join("\n\n"),
    );
  });

  it("reads a deck whose only text is on its master or in its footer", () => {
    // Both came back as 0 chars through anydoc (master_text.ppt, headers_footers.ppt).
    const onMaster = deckStreams({
      slides: [{ shapes: [] }],
      masters: [{ shapes: [shape({ text: text("Text that I added to the master slide") })] }],
    });
    expect(formatPpt(onMaster).text).toBe("# Slide 1\n\n# Master\nText that I added to the master slide");
    const inFooter = deckStreams({ slides: [{ shapes: [] }], footer: { text: "Global Slide Footer", on: true } });
    expect(formatPpt(inFooter).text).toBe("# Slide 1\n\n# Master\nFooter: Global Slide Footer");
  });

  it("leaves out a footer the deck switched off, unless PowerPoint 2007 saved it", () => {
    const master = { shapes: [shape({ ph: PH.footer, text: text("Master footer") })] };
    const off = { slides: [{ shapes: [shape({ text: text("Body") })] }], footer: { on: false } };
    expect(formatPpt(deckStreams({ ...off, masters: [master] })).text).toBe("# Slide 1\nBody");
    // 2007 and later keep the footer in the master's placeholder, not in the switch.
    expect(formatPpt(deckStreams({ ...off, masters: [{ ...master, ppt12: true }] })).text).toBe(
      "# Slide 1\nBody\n\n# Master\nFooter: Master footer",
    );
  });

  it("follows the slide list's order, not the order slides are stored in", () => {
    const slides = ["First", "Second", "Third"].map((title) => ({ shapes: [shape({ text: text(title) })] }));
    expect(formatPpt(deckStreams({ slides, order: [0, 2, 1] })).text).toBe(
      "# Slide 1\nFirst\n\n# Slide 2\nThird\n\n# Slide 3\nSecond",
    );
  });

  it("puts each slide's speaker notes under it, without the notes page's furniture", () => {
    const notes = (said: string) => [
      shape({ ph: PH.notesImage }),
      shape({ ph: PH.notesBody, text: text(said) }),
      shape({ ph: PH.footer, text: text("Notes footer") }),
      shape({ ph: PH.header, text: text("Notes header") }),
    ];
    const deck = deckStreams({
      slides: [
        { shapes: [shape({ text: text("One") })], notes: notes("Open with the counters") },
        { shapes: [shape({ text: text("Two") })], notes: notes("Close on the ask") },
      ],
      // Paired by the slide id each notes page names, not by position.
      notesOrder: [1, 0],
    });
    expect(formatPpt(deck).text).toBe(
      "# Slide 1\nOne\n--- Speaker notes ---\nOpen with the counters\n\n# Slide 2\nTwo\n--- Speaker notes ---\nClose on the ask",
    );
  });

  it("drops the asterisk a field stands on and keeps one the author typed", () => {
    const deck = deckStreams({
      slides: [
        {
          shapes: [
            shape({ text: text("Slide * of the deck", { fields: [6] }) }),
            shape({ text: text("Updated *", { fields: [8], fieldType: 0x0ff7 }) }),
            shape({ text: text("*", { fields: [0], fieldType: 0x0ff8 }) }),
            shape({ text: text("5 * 3") }),
          ],
        },
      ],
    });
    expect(formatPpt(deck).text).toBe("# Slide 1\nSlide  of the deck\nUpdated\n5 * 3");
  });

  it("writes comments as author and text under their own label", () => {
    const deck = deckStreams({
      slides: [{ shapes: [shape({ text: text("Test Slide") })], comments: [["Administrator", "This is a test comment"]] }],
    });
    expect(formatPpt(deck).text).toBe("# Slide 1\nTest Slide\n--- Comments ---\nAdministrator: This is a test comment");
  });

  it("names a password-protected deck as such, either way it says so", () => {
    const slides = [{ shapes: [shape({ text: text("x") })] }];
    expect(() => formatPpt(deckStreams({ slides, encryptedToken: true }))).toThrow("Password protected");
    expect(() => formatPpt(deckStreams({ slides, cryptSession: true }))).toThrow("Password protected");
  });

  it("declines a PowerPoint 95 deck so the next reader gets a go", () => {
    expect(formatPpt(new Map([["PP40", new Uint8Array(64)]]))).toEqual(UNAVAILABLE);
    const short = deckStreams({ slides: [] });
    short.set("Current User", short.get("Current User")!.subarray(0, 16));
    expect(formatPpt(short)).toEqual(UNAVAILABLE);
  });

  it("reads the 97 copy a PowerPoint 95 deck saved in dual format carries", () => {
    const copy = deckStreams({ slides: [{ shapes: [shape({ text: text("From the 97 copy") })] }] });
    const streams = new Map([
      ["PowerPoint Document", new Uint8Array(64)],
      ["Current User", new Uint8Array(28)],
      ...[...copy].map(([name, bytes]) => [`PP97_DUALSTORAGE/${name}`, bytes] as [string, Uint8Array]),
    ]);
    expect(formatPpt(streams).text).toBe("# Slide 1\nFrom the 97 copy");
  });

  it("decodes 8-bit text as Latin-1 and places fields by UTF-16 unit, past a surrogate pair", () => {
    const deck = deckStreams({
      slides: [
        {
          shapes: [
            // 0x93 is U+0093 here, not the curly quote Windows-1252 would make it.
            shape({ text: text("Caf\u00e9 \u00a9 \u0093", { bytes: true }) }),
            shape({ text: text("\u{20B9F} page *", { fields: [8] }) }),
          ],
        },
      ],
    });
    expect(formatPpt(deck).text).toBe("# Slide 1\nCaf\u00e9 \u00a9 \u0093\n\u{20B9F} page");
  });

  it("writes a clicked hyperlink as [text](address), and not a slide jump, a hover link or one that is its text", () => {
    const body = "See our docs\rwww.x.example\rSlide two\rHover";
    const deck = deckStreams({
      slides: [
        {
          shapes: [
            shape({
              text: [
                ...text(body),
                ...textLink(1, 4, 12),
                ...textLink(2, 13, 27),
                ...textLink(3, 27, 36),
                ...textLink(1, 37, 43, { mouseOver: true }),
              ],
            }),
            // A range ending past the last paragraph, on the mark it has none of.
            shape({ text: [...text("Last"), ...textLink(1, 0, 5)] }),
          ],
        },
      ],
      hyperlinks: [
        [1, "https://x.example/docs", "part"],
        [2, "http://www.x.example/"],
        [3, undefined, "257,2,Slide 2"],
      ],
    });
    expect(formatPpt(deck).text).toBe(
      "# Slide 1\nSee [our docs](https://x.example/docs#part)\nwww.x.example\nSlide two\nHover\n[Last](https://x.example/docs#part)",
    );
  });

  it("reads the newest save of a slide, not the one an incremental save left behind", () => {
    // Persist ids: 1 the document, 2 the master, 3 the first slide.
    const saved = deckStreams({ slides: [{ shapes: [shape({ text: text("Old wording") })] }] });
    const resaved = amend(saved, 3, slideContainer([shape({ text: text("New wording") })]));
    expect(formatPpt(resaved).text).toBe("# Slide 1\nNew wording");
  });

  it("declines a deck whose shapes repeat one body into more text than the deck holds", () => {
    // Fifty bytes a shape would otherwise render the whole 10 KB body again.
    const shapes = Array.from({ length: 200 }, () => shape({ outline: 0 }));
    const deck = deckStreams({ slides: [{ outline: text("A".repeat(10_000), { bytes: true }), shapes }] });
    expect(formatPpt(deck)).toEqual(UNAVAILABLE);
  });

  it("reports a deck with slides but no text as empty, never as its markers", () => {
    expect(formatPpt(deckStreams({ slides: [{ shapes: [] }, { shapes: [shape({ text: text("*", { fields: [0] }) })] }] }))).toEqual({
      text: "",
    });
  });

  describe("on hostile input", () => {
    const one = () => deckStreams({ slides: [{ shapes: [shape({ text: text("Body") })] }] });

    it("declines a truncated stream", () => {
      const deck = one();
      const doc = deck.get("PowerPoint Document")!;
      deck.set("PowerPoint Document", doc.subarray(0, doc.length >> 1));
      expect(formatPpt(deck)).toEqual(UNAVAILABLE);
    });

    it("ends an edit chain that points back at itself", () => {
      expect(formatPpt(deckStreams({ slides: [{ shapes: [shape({ text: text("Body") })] }], selfLoop: true })).text).toBe(
        "# Slide 1\nBody",
      );
    });

    it("declines groups nested past any real deck instead of recursing", () => {
      let nested = shape({ text: text("deep") });
      for (let depth = 0; depth < 200; depth++) nested = group([nested]);
      expect(formatPpt(deckStreams({ slides: [{ shapes: [nested] }] }))).toEqual(UNAVAILABLE);
    });

    it("never throws anything but the lock on a damaged stream", () => {
      const doc = one().get("PowerPoint Document")!;
      fc.assert(
        fc.property(
          fc.array(fc.tuple(fc.nat(doc.length - 1), fc.integer({ min: 0, max: 255 })), { maxLength: 16 }),
          fc.nat(doc.length),
          (flips, keep) => {
            const damaged = doc.slice(0, keep);
            for (const [at, value] of flips) if (at < damaged.length) damaged[at] = value;
            const deck = one();
            deck.set("PowerPoint Document", damaged);
            try {
              expect(typeof formatPpt(deck).text).toBe("string");
            } catch (error) {
              expect(String(error)).toMatch(/Password protected/);
            }
          },
        ),
        { numRuns: 300 },
      );
    });
  });
});
