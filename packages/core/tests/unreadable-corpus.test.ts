import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { createEncodingGuesser, type EncodingGuesser } from "../src/file-processing/encoding-guess";
import { ROUTER_SNIFF_BYTES, routeBytes } from "../src/file-processing/routing";
import { classifyBytes, decodeAs } from "../src/file-processing/text-classification";
import { buildCorpus, encodeLegacy } from "./fixtures/unreadable-corpus";

let guess: EncodingGuesser;
beforeAll(async () => {
  const wasm = createRequire(import.meta.url).resolve("chardetng-wasm/dist/chardetng_wasm_bg.wasm");
  guess = await createEncodingGuesser(readFileSync(wasm));
});

/** The web's order: route the 8 KiB prefix, sniff it, and only then read the whole file. */
async function read(bytes: Uint8Array) {
  const prefix = bytes.subarray(0, ROUTER_SNIFF_BYTES);
  const route = await routeBytes(prefix);
  if (route.kind !== "unknown") return { verdict: route.kind };
  if (classifyBytes(prefix).classification === "binary") return { verdict: "binary" };
  const full = classifyBytes(bytes, guess);
  return { verdict: full.classification, text: full.text, full };
}

describe("unreadable-files corpus", () => {
  const corpus = buildCorpus();

  it("holds the 45 research cases", () => {
    expect(corpus).toHaveLength(45);
  });

  it.each(corpus.map((c) => [c.name, c] as const))("%s", async (_, c) => {
    const result = await read(c.bytes);
    if (c.expect === "binary") {
      expect(result.verdict).toBe("binary");
    } else {
      expect(result.verdict).not.toBe("binary");
      expect(result.text).toBe(c.text ?? "");
    }
  });

  it("cuts the binary tail off a text file and says where", async () => {
    const c = corpus.find((x) => x.name === "big-text-then-binary")!;
    const { full } = await read(c.bytes);
    expect(full?.stoppedAt).toBe(c.text!.length);
  });

  it("flags every encoding it had to guess, and never drops the file without a guesser", () => {
    for (const c of corpus.filter((x) => /^(txt|css|lua)-.*(shiftjis|gbk|cp125|euckr|latin1)/.test(x.name))) {
      expect(classifyBytes(c.bytes, guess)).toMatchObject({ classification: "ambiguous", guessed: "guess" });
      expect(classifyBytes(c.bytes)).toMatchObject({ classification: "ambiguous", guessed: "fallback", encoding: "windows-1252" });
    }
  });

  it("re-decodes in the encoding the person picks", () => {
    const c = corpus.find((x) => x.name === "txt-cp1251")!;
    expect(decodeAs(c.bytes, "windows-1251")).toBe(c.text);
    expect(decodeAs(c.bytes, "not-an-encoding")).toBeNull();
  });
});

describe("classifyBytes edge cases", () => {
  it("calls a binary-looking first window text when the next 64 KB outvotes it", () => {
    const head = Uint8Array.from({ length: 1000 }, (_, i) => (i % 3 === 0 ? 1 : 0x41));
    const body = new TextEncoder().encode("plain text line\n".repeat(8000));
    const bytes = new Uint8Array(head.length + body.length);
    bytes.set(head);
    bytes.set(body, head.length);
    expect(classifyBytes(bytes).classification).not.toBe("binary");
  });

  it("keeps a head of solid binary binary when printable tables follow it", () => {
    // A shared library's headers and code, then its string tables: the shape
    // that read as text when the rest was judged on its own.
    const head = Uint8Array.from({ length: 8192 }, (_, i) => (i % 4 === 0 ? 1 : 0x41));
    const body = new TextEncoder().encode("symbol_name_table\n".repeat(4000));
    const bytes = new Uint8Array(head.length + body.length);
    bytes.set(head);
    bytes.set(body, head.length);
    expect(classifyBytes(bytes).classification).toBe("binary");
  });

  it("calls binary that starts in the first bytes binary instead of cutting it", () => {
    // A numba index pickle: under the 2% line overall, dense at the start, so
    // the cut used to leave its first byte as the whole text (probe, 2026-10-17).
    const bytes = Uint8Array.from({ length: 5000 }, (_, i) => (i > 0 && i < 364 && i % 4 === 0 ? 1 : 0x61));
    expect(classifyBytes(bytes)).toMatchObject({ classification: "binary", text: "" });
  });

  it("names the control-byte share of a binary verdict", () => {
    const bytes = Uint8Array.from({ length: 4000 }, (_, i) => (i % 10 === 0 ? 2 : 0x61));
    const result = classifyBytes(bytes);
    expect(result.classification).toBe("binary");
    expect(result.controlShare).toBeCloseTo(0.1, 2);
  });

  it("reads a charset the file declares and ignores one TextDecoder does not know", () => {
    const declared = encodeLegacy('<?xml version="1.0" encoding="windows-1251"?><p>Привет</p>', "windows-1251");
    expect(classifyBytes(declared)).toMatchObject({ classification: "text", encoding: "windows-1251" });
    const bogus = encodeLegacy('<?xml version="1.0" encoding="x-nonsense"?><p>café</p>', "windows-1252");
    expect(classifyBytes(bogus)).toMatchObject({ classification: "ambiguous", guessed: "fallback" });
  });

  it("treats a guesser that throws as no guess", () => {
    const bytes = encodeLegacy("café au lait\n", "windows-1252");
    const result = classifyBytes(bytes, () => {
      throw new Error("boom");
    });
    expect(result).toMatchObject({ classification: "ambiguous", guessed: "fallback" });
  });
});
