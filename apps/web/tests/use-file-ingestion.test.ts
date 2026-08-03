import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { DEFAULT_CONFIG } from "@fileconcat/core";
import { useFileIngestion } from "~/hooks/use-file-ingestion";

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
});
