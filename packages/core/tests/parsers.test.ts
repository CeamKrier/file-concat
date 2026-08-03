import { describe, expect, it } from "vitest";
import { strToU8 } from "fflate";
import { createParserRegistry } from "../src/file-processing/parsers/registry";
import { extractOfficeDocument } from "../src/file-processing/parsers/officeparser";
import { minimalDocx } from "./fixtures/containers";

describe("createParserRegistry", () => {
  it("runs the loader a platform registered", async () => {
    const registry = createParserRegistry({
      office: async () => ({ text: "from the loader" }),
    });
    expect(registry.has("office")).toBe(true);
    expect(await registry.extract("office", new Uint8Array())).toEqual({
      text: "from the loader",
    });
  });

  it("answers an unregistered parser with a note, not an exception", async () => {
    // A build without a reader surfaces "couldn't extract text" — the documented
    // behaviour for a format it does not carry, not a crash and not a silent
    // reclassification (ADR-0011, ADR-0012).
    const registry = createParserRegistry({});
    expect(registry.has("epub")).toBe(false);
    expect(await registry.extract("epub", new Uint8Array([1, 2, 3]))).toEqual({
      text: "",
      notes: [{ kind: "parser-unavailable" }],
    });
  });

  it("keeps platforms independent — one map's absence is not another's", async () => {
    const web = createParserRegistry({ office: async () => ({ text: "web" }) });
    const cli = createParserRegistry({});
    expect(web.has("office")).toBe(true);
    expect(cli.has("office")).toBe(false);
  });
});

describe("extractOfficeDocument", () => {
  it("extracts the text from a docx", async () => {
    const { text } = await extractOfficeDocument(minimalDocx("Hello extractable document"));
    expect(text).toContain("Hello extractable document");
  });

  it("returns empty text when the document carries none", async () => {
    const { text } = await extractOfficeDocument(minimalDocx(""));
    expect(text).toBe("");
  });

  it("extracts the prose from an rtf, not its markup", async () => {
    const rtf =
      `{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times New Roman;}}\n` +
      `\\f0\\fs24 Hello from RTF. \\par\n` +
      `Second paragraph with \\b bold\\b0  text.\\par\n}`;
    const { text } = await extractOfficeDocument(strToU8(rtf));
    expect(text).toContain("Hello from RTF.");
    expect(text).toContain("bold");
    expect(text).not.toContain("\\rtf1");
    expect(text).not.toContain("fonttbl");
  });

  it("omits notes entirely when the document parsed cleanly", async () => {
    const result = await extractOfficeDocument(minimalDocx("clean"));
    expect(result.notes).toBeUndefined();
  });
});
