import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@fileconcat/core";
import { useFileIngestion } from "~/hooks/use-file-ingestion";

const text = (body: string, path: string) => ({ file: new File([body], path), path });

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
      await result.current.ingestBatch([text("# Talk\n", "youtube/talk.md")], { append: true });
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
        append: true,
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
        append: true,
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
      await result.current.ingestBatch([text("# Talk\n", "youtube/talk.md")], { append: true });
    });

    // The image is still in the bundle and still offerable to recognition; an
    // append must not quietly drop what the last one found.
    expect(result.current.entries.map((e) => e.path)).toContain("shots/a.png");
    expect(result.current.scannedDocuments.length).toBe(scannedBefore);
  });
});
