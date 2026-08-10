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
vi.mock("~/lib/prepare-batch", () => ({
  prepareBatch: (incoming: { file: File; path?: string }[]) => ({
    files: incoming.map((item) => ({
      item,
      path: item.path ?? item.file.name,
      route: { kind: "extract", parserId: "office", format: "pdf" },
    })),
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
}));

vi.mock("~/lib/metrics", () => ({
  addToTally: (tally: Map<string, unknown>, key: string) => tally.set(key, {}),
  startRun: () => {},
  track: () => {},
  trackAmount: () => {},
  trackTally: () => {},
}));

vi.mock("~/lib/clarity-tags", () => ({ tagDrop: () => {}, tagSource: () => {} }));

import { useFileIngestion } from "~/hooks/use-file-ingestion";

/** A file whose bytes are its own path, so the stubbed recogniser can key on it. */
function scan(path: string): { file: File; path: string } {
  return { file: new File([path], path.split("/").pop() ?? path), path };
}

const originalLanguages = Object.getOwnPropertyDescriptor(navigator, "languages");

beforeEach(() => {
  READINGS.clear();
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
    expect(result.current.entries).toEqual([{ path: "a.pdf", content: "Merve Çakır" }]);
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
