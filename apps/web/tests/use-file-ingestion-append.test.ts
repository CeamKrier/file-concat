import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "@fileconcat/core";
import { useFileIngestion } from "~/hooks/use-file-ingestion";

const text = (body: string, path: string) => ({ file: new File([body], path), path });

/** Every `append_to` this file's ingests wrote, in order. */
const APPENDS: { value?: string; n?: number }[] = [];

vi.mock("~/lib/metrics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/metrics")>()),
  trackAmount: (name: string, amounts: { value?: string; n?: number }) => {
    if (name === "append_to") APPENDS.push(amounts);
  },
  trackTally: () => {},
  track: () => {},
  startRun: () => {},
}));

beforeEach(() => {
  APPENDS.length = 0;
});

/**
 * A bundle can hold a repo and the discussion about it, in either order. Before
 * append existed every ingest called `setEntries(nextEntries)`, so whichever
 * arrived second erased the first — the thing the extension exists for was not
 * producible at all.
 */
describe("useFileIngestion, appending", () => {
  it("keeps a dropped folder when a clipping arrives after it", async () => {
    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([text("export const a = 1;\n", "src/a.ts")]);
    });
    await act(async () => {
      await result.current.ingestBatch([text("# Talk\n", "youtube/talk.md")], { append: "manual" });
    });

    expect(result.current.entries.map((e) => e.path)).toEqual(["src/a.ts", "youtube/talk.md"]);
    expect(result.current.validations["src/a.ts"].included).toBe(true);
    expect(result.current.validations["youtube/talk.md"].included).toBe(true);
  });

  it("keeps a clipping when a dropped folder arrives after it", async () => {
    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([text("# Talk\n", "youtube/talk.md")]);
    });
    await act(async () => {
      await result.current.ingestBatch([text("export const a = 1;\n", "src/a.ts")], {
        append: "manual",
      });
    });

    expect(result.current.entries.map((e) => e.path)).toEqual(["youtube/talk.md", "src/a.ts"]);
  });

  it("replaces a re-clipped file in place rather than doubling it", async () => {
    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([
        text("# Talk, first read\n", "youtube/talk.md"),
        text("export const a = 1;\n", "src/a.ts"),
      ]);
    });
    await act(async () => {
      await result.current.ingestBatch([text("# Talk, with comments\n", "youtube/talk.md")], {
        append: "manual",
      });
    });

    // One file, the newer read, and still where it was: a re-clip is not a new
    // arrival at the end of the bundle.
    expect(result.current.entries.map((e) => e.path)).toEqual(["youtube/talk.md", "src/a.ts"]);
    expect(result.current.entries[0].content).toBe("# Talk, with comments\n");
  });

  it("still replaces when not appending, which is what starting over means", async () => {
    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([text("export const a = 1;\n", "src/a.ts")]);
    });
    await act(async () => {
      await result.current.ingestBatch([text("# Talk\n", "youtube/talk.md")]);
    });

    expect(result.current.entries.map((e) => e.path)).toEqual(["youtube/talk.md"]);
    expect(result.current.validations["src/a.ts"]).toBeUndefined();
  });

  it("merges what a binary contributes instead of resetting it", async () => {
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "a.png");
    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([{ file: png, path: "shots/a.png" }]);
    });
    const scannedBefore = result.current.scannedDocuments.length;

    await act(async () => {
      await result.current.ingestBatch([text("# Talk\n", "youtube/talk.md")], { append: "manual" });
    });

    // The image is still in the bundle and still offerable to recognition; an
    // append must not quietly drop what the last one found.
    expect(result.current.entries.map((e) => e.path)).toContain("shots/a.png");
    expect(result.current.scannedDocuments.length).toBe(scannedBefore);
  });

  it("clears a stale failure when the same path reads successfully on append", async () => {
    // `File.slice()` returns a plain Blob, so the router's and validator's
    // leading-byte sniffs still succeed on this file — only the full read
    // `readFileAsText` does is broken, which is what actually lands a path in
    // `failedFiles`.
    const unreadable = new File(["placeholder"], "notes/broken.txt");
    Object.defineProperty(unreadable, "arrayBuffer", {
      value: () => Promise.reject(new Error("simulated read failure")),
    });

    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([{ file: unreadable, path: "notes/broken.txt" }]);
    });
    expect(result.current.failedFiles.map((f) => f.path)).toEqual(["notes/broken.txt"]);
    expect(result.current.entries.map((e) => e.path)).not.toContain("notes/broken.txt");

    await act(async () => {
      await result.current.ingestBatch([text("now readable\n", "notes/broken.txt")], {
        append: "manual",
      });
    });

    // The fixed copy read fine this time; the earlier failure record must not
    // survive next to it.
    expect(result.current.failedFiles).toEqual([]);
    expect(result.current.entries.map((e) => e.path)).toEqual(["notes/broken.txt"]);
    expect(result.current.entries[0].content).toBe("now readable\n");
  });

  /**
   * The clipper push and the `Add files` button call the same road, so without
   * a value on the row any rate computed over appends answers for neither, and
   * the only way to tell them apart afterwards is to guess from what arrived.
   */
  it("records which affordance appended, and nothing at all when none did", async () => {
    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([text("export const a = 1;\n", "src/a.ts")]);
    });
    expect(APPENDS).toEqual([]);

    await act(async () => {
      await result.current.ingestBatch([text("# Talk\n", "hn/talk.md")], { append: "clipper" });
    });
    await act(async () => {
      await result.current.ingestBatch([text("b\n", "src/b.ts")], { append: "manual" });
    });

    // `n` is what the bundle already held, so it climbs: one file, then two.
    expect(APPENDS).toEqual([
      { value: "clipper", n: 1 },
      { value: "manual", n: 2 },
    ]);
  });

  /**
   * The way back out of an append. A second push into a tab still holding the
   * first one produces a bundle covering both, which is right for a repo and
   * the discussion about it and wrong for two unrelated batches — and only the
   * paths the push carried can tell the two apart afterwards.
   */
  it("prunes a bundle back to the paths a push carried", async () => {
    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([text("export const a = 1;\n", "src/a.ts")]);
    });
    await act(async () => {
      await result.current.ingestBatch([text("# Talk\n", "youtube/talk.md")], {
        append: "clipper",
      });
    });
    act(() => result.current.keepOnly(["youtube/talk.md"]));

    expect(result.current.entries.map((e) => e.path)).toEqual(["youtube/talk.md"]);
    // The validation goes with the file: it is what the tree and the empty
    // state count from, so a leftover row would keep a dropped file visible.
    expect(result.current.validations["src/a.ts"]).toBeUndefined();
    expect(result.current.validations["youtube/talk.md"]).toBeDefined();
  });
});
