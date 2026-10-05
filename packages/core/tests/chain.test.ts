import { describe, expect, it } from "vitest";
import { extractWithFallback, garbageShare, isUsable } from "../src/file-processing/parsers/chain";
import type { ParserLoader } from "../src/file-processing/parsers/types";

const bytes = new Uint8Array();
const says =
  (text: string): ParserLoader =>
  async () => ({ text });
const throws =
  (message: string): ParserLoader =>
  async () => {
    throw new Error(message);
  };
const unavailable: ParserLoader = async () => ({
  text: "",
  notes: [{ kind: "parser-unavailable" }],
});

describe("extractWithFallback", () => {
  it("keeps the primary's usable text and names it", async () => {
    const result = await extractWithFallback(
      { id: "own", read: says("hello") },
      { anydoc: says("other") },
      bytes,
      "docx",
    );
    expect(result).toEqual({ text: "hello", reader: "own" });
  });

  it("falls through on parser-unavailable, blank, no letters, garbage and a throw", async () => {
    const garbage = says("\ufffd".repeat(60) + "abcd".repeat(10));
    for (const read of [unavailable, says("  "), says("- * -"), garbage, throws("broken")]) {
      const result = await extractWithFallback(
        { id: "cfb", read },
        { anydoc: says("deck text") },
        bytes,
        "cfb",
      );
      expect(result).toEqual({ text: "deck text", reader: "anydoc" });
    }
  });

  it("keeps the primary's outcome when no fallback is usable", async () => {
    const empty = await extractWithFallback(
      { id: "cfb", read: unavailable },
      { anydoc: throws("nope") },
      bytes,
      "cfb",
    );
    expect(empty.notes).toEqual([{ kind: "parser-unavailable" }]);
    await expect(
      extractWithFallback(
        { id: "own", read: throws("primary") },
        { anydoc: says("") },
        bytes,
        "docx",
      ),
    ).rejects.toThrow("primary");
  });

  it("never runs a fallback for an unlisted format or a locked file", async () => {
    let ran = false;
    const spy: ParserLoader = async () => ((ran = true), { text: "x" });
    await extractWithFallback({ id: "own", read: says("") }, { anydoc: spy }, bytes, "pdf");
    await expect(
      extractWithFallback(
        { id: "own", read: throws("No password given") },
        { anydoc: spy },
        bytes,
        "docx",
      ),
    ).rejects.toThrow("password");
    expect(ran).toBe(false);
  });
});

describe("garbageShare", () => {
  it("counts U+FFFD, C0 and private use, not tabs or line breaks", () => {
    expect(garbageShare("a\tb\r\nc")).toBe(0);
    expect(garbageShare("ab\ufffd\u0001\ue000")).toBeCloseTo(3 / 5);
    // Short text is not judged on its share: a stray symbol is not a broken layer.
    expect(isUsable({ text: "ab\ufffd\ufffd\ufffd" })).toBe(true);
  });
});
