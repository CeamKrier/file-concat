import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "@fileconcat/core";

/**
 * Recognition, driven entirely through stubs.
 *
 * Routing, parsing and the recogniser itself are all replaced, because none of
 * them is what these tests are about: what is being pinned down is who owns a
 * document's standing after a pass, which is the part that decides whether a
 * second language can quietly delete the first one's text.
 */
/** Extension → the format the real router would report for an image's bytes. */
const IMAGE_FORMATS: Record<string, string> = { png: "png", jpg: "jpeg", webp: "webp" };

vi.mock("~/lib/prepare-batch", () => ({
  prepareBatch: (incoming: { file: File; path?: string }[]) => ({
    files: incoming.map((item) => {
      const path = item.path ?? item.file.name;
      const extension = path.split(".").pop() ?? "";
      return {
        item,
        path,
        // Format off the extension. The real router reads bytes and never a
        // name; this stub only has to hand the hook the same shape, and the
        // format is what decides whether a document could be a scan — or, for
        // an image, whether recognition can be offered over it at all.
        route: IMAGE_FORMATS[extension]
          ? { kind: "binary", format: IMAGE_FORMATS[extension] }
          : { kind: "extract", parserId: "office", format: extension },
      };
    }),
    expandedCount: 0,
    unsupported: [],
  }),
}));

// Every document opens with no text, which is what a scan does.
vi.mock("~/lib/parsers", () => ({
  parsers: { extract: async () => ({ text: "" }) },
}));

/** path → language code → what recognition reads. Absent means unreadable. */
const READINGS = new Map<string, Record<string, string>>();
/** Every (path, language) pair recognition was actually asked for. */
let attempts: { path: string; language: string }[] = [];
/** Fires as each document finishes, which is where a mid-pass stop can happen. */
let onDocumentRead: ((path: string) => void) | null = null;

vi.mock("~/lib/ocr", () => ({
  readWithOcr: async (bytes: Uint8Array, language: string) => {
    const path = new TextDecoder().decode(bytes);
    attempts.push({ path, language });
    onDocumentRead?.(path);
    return { text: READINGS.get(path)?.[language] ?? "" };
  },
  // An image's bytes are a real PNG header, so this one keys on the name.
  recogniseImageWithOcr: async (file: File, language: string) => {
    attempts.push({ path: file.name, language });
    onDocumentRead?.(file.name);
    return { text: READINGS.get(file.name)?.[language] ?? "", confidence: 90 };
  },
}));

/** counter name → the rows it was last written with. Only non-empty writes. */
type Row = { n: number; b: number };
const TALLIES = new Map<string, Map<string, Row>>();

vi.mock("~/lib/metrics", () => ({
  // Faithful enough to assert quantities on, which the old no-op stub was not.
  addToTally: (tally: Map<string, Row>, key: string, bytes = 0) => {
    const row = tally.get(key) ?? { n: 0, b: 0 };
    tally.set(key, { n: row.n + 1, b: row.b + bytes });
  },
  startRun: () => {},
  track: () => {},
  trackAmount: () => {},
  trackTally: (name: string, tally: Map<string, Row>) => {
    if (tally.size > 0) TALLIES.set(name, new Map(tally));
  },
}));

vi.mock("~/lib/clarity-tags", () => ({ tagDrop: () => {}, tagSource: () => {} }));

import { useFileIngestion } from "~/hooks/use-file-ingestion";

/** A file whose bytes are its own path, so the stubbed recogniser can key on it. */
function scan(path: string): { file: File; path: string } {
  return { file: new File([path], path.split("/").pop() ?? path), path };
}

/** An image, with bytes the core classifier really does call binary — the stub
 * router says `binary`, but `validateFile` is the genuine article here. */
function image(path: string): { file: File; path: string } {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(64).fill(7)]);
  return { file: new File([png], path.split("/").pop() ?? path), path };
}

const originalLanguages = Object.getOwnPropertyDescriptor(navigator, "languages");

beforeEach(() => {
  READINGS.clear();
  TALLIES.clear();
  attempts = [];
  onDocumentRead = null;
  Object.defineProperty(navigator, "languages", { value: ["en-US"], configurable: true });
});

afterEach(() => {
  if (originalLanguages) Object.defineProperty(navigator, "languages", originalLanguages);
});

describe("recognition over a drop", () => {
  it("reads scans in the browser's language as the last stage of the drop", async () => {
    Object.defineProperty(navigator, "languages", { value: ["tr-TR"], configurable: true });
    READINGS.set("a.pdf", { tur: "Merve Çakır" });

    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([scan("a.pdf")]);
    });

    expect(attempts).toEqual([{ path: "a.pdf", language: "tur" }]);
    // Flagged, so the bundle can say the characters are a guess (ADR-0017).
    expect(result.current.entries).toEqual([
      { path: "a.pdf", content: "Merve Çakır", recognised: true },
    ]);
    expect(result.current.readLanguage?.code).toBe("tur");
    // Recovered is derived from the two lists, so it can never drift from them.
    expect(result.current.recoveredDocuments).toBe(1);
    expect(result.current.unreadDocuments).toHaveLength(0);
    // Kept whole, recovered or not: a re-read has to be able to go back over a
    // document the first pass "succeeded" on.
    expect(result.current.scannedDocuments.map((d) => d.path)).toEqual(["a.pdf"]);
  });

  it("marks only the documents recognition actually opened", async () => {
    // Neither reads, so both end up unread — but only one was ever tried, and
    // the difference is "the page is blank" versus "we never looked".
    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([scan("a.pdf")]);
    });

    expect(result.current.validations["a.pdf"].recognitionTried).toBe(true);
    expect(result.current.unreadDocuments.map((d) => d.path)).toEqual(["a.pdf"]);
  });
});

describe("images", () => {
  it("offers them without reading them", async () => {
    READINGS.set("shot.png", { eng: "TOTAL 42.00" });

    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([image("shot.png")]);
    });

    // The whole of ADR-0017: an image is a candidate, and nothing happens until
    // someone asks. A reading was available and was deliberately not taken.
    expect(attempts).toEqual([]);
    expect(result.current.scannedDocuments.map((d) => d.path)).toEqual(["shot.png"]);
    expect(result.current.unreadDocuments.map((d) => d.path)).toEqual(["shot.png"]);
    expect(result.current.validations["shot.png"].recognitionTried).toBeUndefined();
  });

  it("reads the document in a mixed drop and leaves the images alone", async () => {
    READINGS.set("a.pdf", { eng: "Statement" });
    READINGS.set("one.png", { eng: "ignored" });
    READINGS.set("two.webp", { eng: "ignored" });

    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([scan("a.pdf"), image("one.png"), image("two.webp")]);
    });

    // A document earned its pass by failing extraction first; the images did not.
    expect(attempts).toEqual([{ path: "a.pdf", language: "eng" }]);
    expect(result.current.entries.find((e) => e.path === "a.pdf")?.content).toBe("Statement");
    expect(result.current.unreadDocuments.map((d) => d.path)).toEqual(["one.png", "two.webp"]);
  });

  it("puts a chosen image's reading into the bundle, marked as a guess", async () => {
    READINGS.set("receipt.png", { deu: "SUMME 42,00" });

    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([image("receipt.png"), image("logo.png")]);
    });
    await act(async () => {
      await result.current.readSelected(["receipt.png"], "de");
    });

    expect(attempts).toEqual([{ path: "receipt.png", language: "deu" }]);
    expect(result.current.entries.find((e) => e.path === "receipt.png")).toEqual({
      path: "receipt.png",
      content: "SUMME 42,00",
      recognised: true,
    });
    // Recognition turns a Binary file into a Text file for this Run, or the
    // curation lock (ADR-0009) would keep it out of the bundle it just joined.
    expect(result.current.validations["receipt.png"].classification).toBe("text");
    // The one nobody chose is untouched, still on offer.
    expect(result.current.unreadDocuments.map((d) => d.path)).toEqual(["logo.png"]);
    expect(result.current.validations["logo.png"].recognitionTried).toBeUndefined();
  });

  it("counts the offer and the take separately, which is the whole measurement", async () => {
    READINGS.set("receipt.png", { eng: "SUMME 42,00" });

    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([image("receipt.png"), image("logo.png")]);
    });

    // Offered at ingest, whether or not anyone ever presses anything. Without
    // this, "never pressed" and "pressed, found nothing" are the same number.
    expect(TALLIES.get("ocr_offered")?.get("png")?.n).toBe(2);
    expect(TALLIES.get("ocr_read")).toBeUndefined();

    await act(async () => {
      await result.current.readSelected(["receipt.png", "logo.png"], "en");
    });

    // Both were opened; only one cleared the floor, and the confidence band is
    // recorded for both — the rejections are what say whether the floor is right.
    expect(TALLIES.get("ocr_read")?.get("png")?.n).toBe(2);
    expect(TALLIES.get("ocr_conf")?.get("90")?.n).toBe(2);
    expect(TALLIES.get("ocr_recovered")?.get("png")?.n).toBe(1);
  });
});

describe("a document that cannot hold a scan", () => {
  it("leaves an empty spreadsheet out of recognition entirely", async () => {
    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([scan("ledger.xlsx")]);
    });

    // A workbook with no cells is empty, not a picture of a page. Recognition
    // there costs a 5 MB language download to read nothing, and standing in the
    // scanned list makes the empty screen say the cells are pictures.
    expect(attempts).toEqual([]);
    expect(result.current.scannedDocuments).toHaveLength(0);
    expect(result.current.unreadDocuments).toHaveLength(0);
    // Still reported, never silently dropped.
    expect(result.current.validations["ledger.xlsx"].included).toBe(false);
  });
});

describe("a scoped re-read", () => {
  it("leaves documents outside the scope exactly as they were", async () => {
    READINGS.set("en.pdf", { eng: "Statement page 1" });
    READINGS.set("ar.pdf", { ara: "بيان" });

    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([scan("en.pdf"), scan("ar.pdf")]);
    });
    // First pass: English reads, Arabic does not.
    expect(result.current.entries.map((e) => e.path)).toEqual(["en.pdf"]);
    expect(result.current.unreadDocuments.map((d) => d.path)).toEqual(["ar.pdf"]);

    attempts = [];
    await act(async () => {
      await result.current.readSelected(["ar.pdf"], "ar");
    });

    // Only the chosen document is re-read: the whole point of the scope is that
    // a mixed-language drop costs one pass per language, not one per file.
    expect(attempts).toEqual([{ path: "ar.pdf", language: "ara" }]);
    // And the English reading survives a pass it was not part of. Replacing the
    // unread list instead of merging it is what used to lose this.
    expect(result.current.entries.map((e) => e.path).sort()).toEqual(["ar.pdf", "en.pdf"]);
    expect(result.current.entries.find((e) => e.path === "en.pdf")?.content).toBe(
      "Statement page 1",
    );
    expect(result.current.unreadDocuments).toHaveLength(0);
    expect(result.current.recoveredDocuments).toBe(2);
    // Each document remembers the language it was actually read in. The last
    // pass's language describes one of these two, so a summary that named it
    // for both would be telling the user something untrue about the other.
    expect(result.current.readLanguage?.code).toBe("ara");
    expect(result.current.readLanguages["en.pdf"].code).toBe("eng");
    expect(result.current.readLanguages["ar.pdf"].code).toBe("ara");
  });

  it("takes a document back out when the new language reads it worse", async () => {
    READINGS.set("tr.pdf", { eng: "Merve Gakir" });

    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([scan("tr.pdf")]);
    });
    expect(result.current.entries).toHaveLength(1);

    await act(async () => {
      await result.current.readSelected(["tr.pdf"], "tr");
    });

    // Turkish reads nothing here, so the English text does not linger: a pass is
    // authoritative for what it was given, or a second language would leave the
    // first one's output behind under a label claiming otherwise.
    expect(result.current.entries).toHaveLength(0);
    expect(result.current.unreadDocuments.map((d) => d.path)).toEqual(["tr.pdf"]);
    expect(result.current.recoveredDocuments).toBe(0);
  });

  it("ignores paths that were never scanned in this Run", async () => {
    READINGS.set("a.pdf", { eng: "text" });

    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([scan("a.pdf")]);
    });

    attempts = [];
    await act(async () => {
      await result.current.readSelected(["nowhere.pdf"], "de");
    });

    expect(attempts).toEqual([]);
    expect(result.current.entries.map((e) => e.path)).toEqual(["a.pdf"]);
  });
});

describe("stopping a pass", () => {
  it("keeps the untouched tail's earlier text instead of failing it", async () => {
    READINGS.set("a.pdf", { eng: "first", deu: "erste" });
    READINGS.set("b.pdf", { eng: "second" });
    READINGS.set("c.pdf", { eng: "third" });

    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([scan("a.pdf"), scan("b.pdf"), scan("c.pdf")]);
    });
    expect(result.current.entries).toHaveLength(3);

    // Re-read all three as German, stopping the moment the first one lands. The
    // stop is checked between documents, so b and c are never opened.
    attempts = [];
    await act(async () => {
      onDocumentRead = (path) => {
        if (path === "a.pdf") result.current.stopReading();
      };
      await result.current.readSelected(["a.pdf", "b.pdf", "c.pdf"], "de");
    });

    expect(result.current.stoppedReading).toBe(true);
    expect(attempts).toEqual([{ path: "a.pdf", language: "deu" }]);
    // German won on the one document it reached; the other two keep their
    // English text. Treating the untouched tail as failed is what used to throw
    // away two good readings on one press of Stop, and German reads neither.
    expect(result.current.entries.find((e) => e.path === "a.pdf")?.content).toBe("erste");
    expect(result.current.entries.find((e) => e.path === "b.pdf")?.content).toBe("second");
    expect(result.current.entries.find((e) => e.path === "c.pdf")?.content).toBe("third");
    expect(result.current.unreadDocuments).toHaveLength(0);
    expect(result.current.recoveredDocuments).toBe(3);
  });
});
