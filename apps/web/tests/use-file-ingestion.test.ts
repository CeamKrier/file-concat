import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
