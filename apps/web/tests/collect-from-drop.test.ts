import { describe, expect, it } from "vitest";

import { collectFromDataTransfer } from "~/lib/collect-from-drop";

/** Minimal FileSystemEntry stand-ins: jsdom ships no DataTransfer walker. */
function fileEntry(name: string) {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file: (ok: (f: File) => void) => ok(new File(["x"], name)),
  } as unknown as FileSystemEntry;
}

function dirEntry(name: string, children: FileSystemEntry[]) {
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => {
      let sent = false;
      return {
        readEntries: (ok: (e: FileSystemEntry[]) => void) => {
          ok(sent ? [] : children);
          sent = true;
        },
      };
    },
  } as unknown as FileSystemEntry;
}

function items(entry: FileSystemEntry) {
  return [{ webkitGetAsEntry: () => entry }] as unknown as DataTransferItemList;
}

describe("collectFromDataTransfer", () => {
  it("reports a rising count while it walks, so a slow drop is never silent", async () => {
    const files = Array.from({ length: 5 }, (_, i) => fileEntry(`f${i}.ts`));
    const seen: number[] = [];

    const { collected } = await collectFromDataTransfer(items(dirEntry("src", files)), {
      onProgress: (found) => seen.push(found),
    });

    expect(collected).toHaveLength(5);
    expect(seen).toEqual([1, 2, 3, 4, 5]);
  });

  it("asks skipDir about what sits inside a drop, never about the folder dropped", async () => {
    // Someone who drops `dist` itself chose it; the `dist` nested inside a
    // project is the one nobody wants read.
    const root = dirEntry("dist", [fileEntry("app.js"), dirEntry("dist", [fileEntry("inner.js")])]);
    const { collected } = await collectFromDataTransfer(items(root), { skipDir: (name) => name === "dist" });

    expect(collected.map((f) => f.path)).toEqual(["dist/app.js"]);
  });

  it("marks a file dropped by itself as explicit, and nothing found inside a dropped folder", async () => {
    // A file someone dragged in by name was chosen; the filter rail's default
    // noise rules are for what a folder brings along (ripgrep's rule).
    const dropped = [
      { webkitGetAsEntry: () => fileEntry("debug.log") },
      { webkitGetAsEntry: () => dirEntry("logs", [fileEntry("app.log")]) },
    ] as unknown as DataTransferItemList;
    const { collected } = await collectFromDataTransfer(dropped);

    expect(collected).toEqual([
      expect.objectContaining({ path: "debug.log", explicit: true }),
      expect.not.objectContaining({ explicit: true }),
    ]);
    expect(collected[1].path).toBe("logs/app.log");
  });
});
