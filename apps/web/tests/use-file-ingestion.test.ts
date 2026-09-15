import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import * as XLSX from "xlsx";
import { DEFAULT_CONFIG } from "@fileconcat/core";
import { useFileIngestion } from "~/hooks/use-file-ingestion";

/** counter name -> the keys it was written with. Everything else stays real. */
const TALLIES: Record<string, string[]> = {};
vi.mock("~/lib/metrics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/metrics")>()),
  trackTally: (name: string, tally: Map<string, unknown>) => {
    if (tally.size > 0) TALLIES[name] = [...tally.keys()];
  },
}));

/** Build a UTF-16LE (BOM) File — the encoding that a naive UTF-8 read mojibakes. */
function utf16leFile(source: string, name: string): File {
  const body = Buffer.from(source, "utf16le");
  const bytes = new Uint8Array(body.length + 2);
  bytes.set([0xff, 0xfe]);
  bytes.set(body, 2);
  return new File([bytes], name);
}

describe("useFileIngestion", () => {
  it("decodes a UTF-16 source file as text, includes it, and flags classification", async () => {
    const source = "public class Foo {}\n";
    const file = utf16leFile(source, "Foo.java");

    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([{ file, path: "Foo.java" }]);
    });

    const entry = result.current.entries.find((e) => e.path === "Foo.java");
    expect(entry?.content).toBe(source);
    expect(result.current.validations["Foo.java"].included).toBe(true);
    expect(result.current.validations["Foo.java"].classification).toBe("text");
  });

  it("unpacks an archive and routes each entry on its own bytes", async () => {
    const zip = zipSync({
      "src/main.ts": strToU8(`export const answer = 42;\n`),
      "notes.md": strToU8(`# Notes\n`),
    });
    // Named `.bin`, not `.zip`: the route comes from the leading bytes, so the
    // filename cannot decide whether this is opened (ADR-0011).
    const file = new File([zip], "bundle.bin");

    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([{ file, path: "bundle.bin" }]);
    });

    expect(result.current.expandedArchive).toBe(true);
    // The folder keeps the whole filename: there is no archive suffix to strip
    // off a name the router did not trust in the first place.
    const paths = result.current.entries.map((e) => e.path).sort();
    expect(paths).toEqual(["bundle.bin/notes.md", "bundle.bin/src/main.ts"]);
    expect(result.current.entries.find((e) => e.path === "bundle.bin/src/main.ts")?.content).toBe(
      "export const answer = 42;\n",
    );
    // The archive itself is replaced by its contents, not listed alongside them.
    expect(result.current.validations["bundle.bin"]).toBeUndefined();
  });

  it("counts a file whose bytes refuse to be read, where nothing used to", async () => {
    // `File.slice()` still returns a plain Blob, so the router and the
    // validator both sniff this file fine and only the full read fails. That
    // is the shape of a file that moved, or a path that blinked.
    const unreadable = new File(["placeholder"], "broken.ts");
    Object.defineProperty(unreadable, "arrayBuffer", {
      value: () => Promise.reject(new Error("simulated read failure")),
    });

    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([{ file: unreadable, path: "src/broken.ts" }]);
    });

    expect(result.current.failedFiles.map((f) => f.path)).toEqual(["src/broken.ts"]);
    expect(TALLIES.read_failed).toEqual(["ts"]);
    // Not the other failure tally: this file was never read well enough to be
    // called binary.
    expect(TALLIES.unreadable_ext).toBeUndefined();
  });

  it("prunes node_modules and .git from a picked folder, as the drag walk already does", async () => {
    // The picker hands over every file the browser enumerated, so the prune
    // has to happen on the list; before this it did not, and a picked project
    // folder read all of node_modules before the filter rail hid it.
    const pick = (path: string, content: string): File => {
      const file = new File([content], path.split("/").pop()!);
      Object.defineProperty(file, "webkitRelativePath", { value: path });
      return file;
    };
    const files = [
      pick("proj/src/index.ts", "export {};\n"),
      pick("proj/node_modules/dep/index.js", "module.exports = 1;\n"),
      pick("proj/.git/HEAD", "ref: refs/heads/main\n"),
    ];
    const target = { files, value: "" } as unknown as HTMLInputElement;

    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.handleFileInput({ target } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.entries.map((e) => e.path)).toEqual(["proj/src/index.ts"]);
  });

  it("reads a 97-2003 workbook and includes its sheets", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["Line", "Amount"],
        ["Travel", 1200],
      ]),
      "Budget",
    );
    const xls = new Uint8Array(XLSX.write(workbook, { bookType: "xls", type: "array" }));
    const file = new File([xls], "Part-B-BUDGETS.xls");

    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([{ file, path: "forms/Part-B-BUDGETS.xls" }]);
    });

    const v = result.current.validations["forms/Part-B-BUDGETS.xls"];
    expect(v.included).toBe(true);
    expect(v.extracted).toBe(true);
    const entry = result.current.entries.find((e) => e.path === "forms/Part-B-BUDGETS.xls");
    expect(entry?.content).toContain("# Sheet: Budget");
    expect(entry?.content).toMatch(/Travel\D+1200/);
    // It left the demand counter: this is a format that reads now.
    expect(TALLIES.unreadable_ext).toBeUndefined();
  });

  it("says what a 97-2003 PowerPoint file is and how to get it read, instead of calling it binary", async () => {
    // The same signature as the workbook above, a different directory inside.
    // The reader declines it, and the file takes the unreadable path under its
    // own extension, so the counter that decides which reader comes next
    // still sees it.
    const container = XLSX.CFB.utils.cfb_new();
    XLSX.CFB.utils.cfb_add(container, "/PowerPoint Document", new Uint8Array(64));
    const deck = new Uint8Array(XLSX.CFB.write(container, { type: "array" }));
    const file = new File([deck], "pitch.ppt");

    const { result } = renderHook(() => useFileIngestion(DEFAULT_CONFIG));
    await act(async () => {
      await result.current.ingestBatch([{ file, path: "pitch.ppt" }]);
    });

    const v = result.current.validations["pitch.ppt"];
    expect(v.included).toBe(false);
    expect(v.classification).toBe("binary");
    expect(v.reason).toBe("PowerPoint 97-2003 file. Save it as .pptx and it will be read.");
    expect(TALLIES.unreadable_ext).toEqual(["ppt"]);
    expect(TALLIES.extract_failed).toBeUndefined();
  });
});
