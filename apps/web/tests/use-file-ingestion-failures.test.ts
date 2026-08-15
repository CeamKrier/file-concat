import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "@fileconcat/core";

/**
 * What a drop records and says when a reader **throws**, as opposed to opening
 * a document and finding nothing in it. The two used to be one number and one
 * sentence, which cost twice: nobody could tell how much of `extract_failed`
 * recognition could ever help, and someone holding a locked file was told the
 * same dead end as someone holding a corrupt one.
 *
 * Routing and parsing are stubbed. Neither is what is under test here, and a
 * genuinely encrypted PDF cannot be hand-built as a fixture — the wording the
 * throw carries is pinned in core's own suite, against the real library.
 */
vi.mock("~/lib/prepare-batch", () => ({
  prepareBatch: (incoming: { file: File; path?: string }[]) => ({
    files: incoming.map((item) => {
      const path = item.path ?? item.file.name;
      return {
        item,
        path,
        route: { kind: "extract", parserId: "office", format: path.split(".").pop() },
      };
    }),
    expandedCount: 0,
    unsupported: [],
  }),
}));

/** A file's own name decides how its extraction fails, so one drop can hold both. */
vi.mock("~/lib/parsers", () => ({
  parsers: {
    extract: async (_id: string, bytes: Uint8Array) => {
      const path = new TextDecoder().decode(bytes);
      if (path.includes("locked")) throw new Error("[OfficeParser]: No password given");
      if (path.includes("broken")) throw new Error("[OfficeParser]: File is corrupted");
      // A partial success: text came out, and the reader said what did not.
      if (path.includes("partial")) {
        return { text: "prose", notes: [{ kind: "pages-skipped", count: 3 }] };
      }
      if (path.includes("cdn")) {
        return { text: "prose", notes: [{ kind: "cdn-fallback", count: 1 }] };
      }
      return { text: "" };
    },
  },
}));

vi.mock("~/lib/ocr", () => ({ readWithOcr: async () => ({ text: "" }) }));

/** counter name → the values it was written with. */
let tallies: Record<string, string[]>;

vi.mock("~/lib/metrics", () => ({
  addToTally: (tally: Map<string, unknown>, key: string) => tally.set(key, {}),
  startRun: () => {},
  track: () => {},
  trackAmount: () => {},
  trackTally: (name: string, tally: Map<string, unknown>) => {
    if (tally.size > 0) tallies[name] = [...tally.keys()];
  },
}));

vi.mock("~/lib/clarity-tags", () => ({ tagDrop: () => {}, tagSource: () => {} }));

import { useFileIngestion } from "~/hooks/use-file-ingestion";
import { emptyReasonSlug } from "~/components/app/empty-kind";

/** A file whose bytes are its own path, so the stubbed reader can key on it. */
function doc(path: string): { file: File; path: string } {
  return { file: new File([path], path.split("/").pop() ?? path), path };
}

beforeEach(() => {
  tallies = {};
});

describe("a document the reader could not open", () => {
  it("says a locked file is locked, which is the one failure a reader can act on", async () => {
    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([doc("locked.pdf")]);
    });

    expect(result.current.validations["locked.pdf"].reason).toBe("Password protected");
    expect(emptyReasonSlug(result.current.validations["locked.pdf"].reason)).toBe("encrypted");
  });

  it("leaves every other failure on the wording it had", async () => {
    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([doc("broken.pdf")]);
    });

    expect(result.current.validations["broken.pdf"].reason).toBe("Couldn't extract text");
  });

  it("never offers a locked document to recognition", async () => {
    // It was never opened, so there is nothing for a recogniser to read, and
    // queueing it would spend seconds a page to arrive back where it started.
    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([doc("locked.pdf")]);
    });

    expect(result.current.unreadDocuments).toHaveLength(0);
  });
});

/**
 * A document that opened, produced text, and lost part of itself on the way.
 * The reader has always said so (ADR-0008) and nothing read it: both platforms
 * destructured `{ text }` and dropped `notes` on the floor, so a PDF missing
 * three pages reached the bundle looking exactly like one missing none.
 */
describe("a document the reader only partly read", () => {
  it("keeps what was lost on the file, beside the text that did arrive", async () => {
    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([doc("partial.pdf")]);
    });

    const record = result.current.validations["partial.pdf"];
    expect(record.included).toBe(true);
    expect(record.notes).toEqual(["pages-skipped"]);
  });

  it("counts every note kind, including the one nobody is shown", async () => {
    // `cdn-fallback` means the self-hosted pdf.js worker did not load and the
    // library fetched one from a CDN. There is nothing a reader of the bundle
    // can do about it, so it reaches the counters and no further.
    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([doc("partial.pdf"), doc("cdn.pdf")]);
    });

    expect(tallies.extract_note?.sort()).toEqual(["cdn-fallback", "pages-skipped"]);
    expect(result.current.validations["cdn.pdf"].notes).toEqual(["cdn-fallback"]);
  });

  it("writes nothing when a document came through whole", async () => {
    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([doc("scan.pdf")]);
    });

    expect(tallies.extract_note).toBeUndefined();
    expect(result.current.validations["scan.pdf"].notes).toBeUndefined();
  });
});

describe("the counters behind the OCR business case", () => {
  it("records a throw under both the whole and its cause", async () => {
    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([doc("locked.pdf"), doc("broken.pdf"), doc("scan.pdf")]);
    });

    // `extract_failed` still counts every file no reader could read, so its
    // history stays comparable; `extract_error` is the strict subset that threw.
    expect(tallies.extract_failed).toEqual(["pdf"]);
    expect(tallies.extract_error?.sort()).toEqual(["encrypted", "error"]);
  });

  it("writes no cause row for a drop whose documents all opened empty", async () => {
    // The scan population, which is the half recognition can rescue: present in
    // `extract_failed`, absent here, so the difference between them is it.
    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([doc("scan.pdf")]);
    });

    expect(tallies.extract_failed).toEqual(["pdf"]);
    expect(tallies.extract_error).toBeUndefined();
  });
});
