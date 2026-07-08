import { describe, expect, it } from "vitest";
import { addLineNumbers } from "../src/file-processing/transform";
import { validateFile } from "../src/file-processing/validation";
import { classifyBytes, readFileAsText } from "../src/file-processing/text-classification";

describe("classifyBytes", () => {
  it("decodes UTF-16LE (with BOM) source as text, not binary", () => {
    const source = "export const x = 1;\n";
    const body = Buffer.from(source, "utf16le");
    const bytes = new Uint8Array(body.length + 2);
    bytes.set([0xff, 0xfe]);
    bytes.set(body, 2);
    const result = classifyBytes(bytes);
    expect(result.classification).toBe("text");
    expect(result.encoding).toBe("utf-16le");
    expect(result.text).toBe(source);
  });

  it("decodes UTF-16BE (with BOM) source as text", () => {
    const source = "class A {}\n";
    const body = Buffer.from(source, "utf16le").swap16();
    const bytes = new Uint8Array(body.length + 2);
    bytes.set([0xfe, 0xff]);
    bytes.set(body, 2);
    const result = classifyBytes(bytes);
    expect(result.classification).toBe("text");
    expect(result.encoding).toBe("utf-16be");
    expect(result.text).toBe(source);
  });

  it("strips the BOM from UTF-8 (with BOM) text", () => {
    const source = "hello = 1\n";
    const body = Buffer.from(source, "utf-8");
    const bytes = new Uint8Array(body.length + 3);
    bytes.set([0xef, 0xbb, 0xbf]);
    bytes.set(body, 3);
    const result = classifyBytes(bytes);
    expect(result.classification).toBe("text");
    expect(result.encoding).toBe("utf-8");
    expect(result.text).toBe(source);
  });

  it("flags real binary content (PNG header: NUL- and control-heavy) as binary", () => {
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x08, 0x06, 0x00, 0x00, 0x00, 0x5c, 0x72, 0xa8,
    ]);
    const result = classifyBytes(bytes);
    expect(result.classification).toBe("binary");
    expect(result.text).toBe("");
  });

  it("decodes BOM-less UTF-16LE (alternating NUL bytes) as text", () => {
    const source = "const answer = 42;\n";
    const bytes = new Uint8Array(Buffer.from(source, "utf16le"));
    const result = classifyBytes(bytes);
    expect(result.classification).toBe("text");
    expect(result.encoding).toBe("utf-16le");
    expect(result.text).toBe(source);
  });

  it("flags partly-garbled text (middle band) as ambiguous, still decoded", () => {
    const ascii = "function totals() { return sum; } // ".repeat(3);
    const control = "\x01\x02\x03\x04\x05\x06\x07\x08\x0e\x0f\x10\x11\x12\x13";
    const source = ascii + control;
    const result = classifyBytes(new TextEncoder().encode(source));
    expect(result.classification).toBe("ambiguous");
    expect(result.text).toContain("function totals");
  });

  it("treats empty input as text", () => {
    const result = classifyBytes(new Uint8Array([]));
    expect(result.classification).toBe("text");
    expect(result.text).toBe("");
  });

  it("keeps text carrying a single stray NUL (the old any-NUL rule would drop it)", () => {
    const source = "a".repeat(200) + "\0" + "b".repeat(50);
    const result = classifyBytes(new TextEncoder().encode(source));
    expect(result.classification).toBe("text");
  });

  it("flags a PNG with a text-heavy metadata header (AI Content Credentials) as binary", () => {
    // ChatGPT/DALL-E PNGs prepend a large mostly-ASCII caBX (C2PA) chunk before
    // the compressed IDAT, so an 8 KB content sniff reads only that text and
    // never reaches the image data. The PNG signature is the ground truth.
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const caBX = new TextEncoder().encode("caBXjumbf c2pa urn:uuid:1234-5678 ".repeat(500));
    const bytes = new Uint8Array(signature.length + caBX.length);
    bytes.set(signature);
    bytes.set(caBX, signature.length);
    const result = classifyBytes(bytes);
    expect(result.classification).toBe("binary");
    expect(result.text).toBe("");
  });

  it("flags a JPEG with a large text XMP header as binary", () => {
    const signature = [0xff, 0xd8, 0xff, 0xe1];
    const xmp = new TextEncoder().encode('<x:xmpmeta xmlns:x="adobe:ns:meta/"> '.repeat(500));
    const bytes = new Uint8Array(signature.length + xmp.length);
    bytes.set(signature);
    bytes.set(xmp, signature.length);
    expect(classifyBytes(bytes).classification).toBe("binary");
  });

  it("flags GIF and RIFF/WEBP signatures as binary", () => {
    const gif = new TextEncoder().encode("GIF89a" + " ".repeat(100));
    expect(classifyBytes(gif).classification).toBe("binary");
    const webp = new Uint8Array(64);
    webp.set(new TextEncoder().encode("RIFF"), 0);
    webp.set(new TextEncoder().encode("WEBP"), 8);
    expect(classifyBytes(webp).classification).toBe("binary");
  });

  it("does not mistake plain text that merely starts with letters for a signature", () => {
    // "RIFF" without the WEBP/WAVE/AVI body tag, and "GIF" not followed by 87a/89a,
    // are ordinary words, not container magic.
    expect(classifyBytes(new TextEncoder().encode("GIFT ideas for the team\n")).classification).toBe(
      "text",
    );
    expect(
      classifyBytes(new TextEncoder().encode("RIFFRAFF is a word, not a container\n"))
        .classification,
    ).toBe("text");
  });
});

describe("readFileAsText", () => {
  it("reads a File's bytes, then classifies and decodes them", async () => {
    const source = "let x = 1\n";
    const body = Buffer.from(source, "utf16le");
    const bytes = new Uint8Array(body.length + 2);
    bytes.set([0xff, 0xfe]);
    bytes.set(body, 2);
    const file = new File([bytes], "x.ts");
    const result = await readFileAsText(file);
    expect(result.classification).toBe("text");
    expect(result.encoding).toBe("utf-16le");
    expect(result.text).toBe(source);
  });
});

describe("addLineNumbers", () => {
  it("normalizes CRLF and CR", () => {
    const input = "a\r\nb\rc";

    expect(addLineNumbers(input)).toBe("   1 | a\n   2 | b\n   3 | c");
  });

  it("drops the trailing empty line a final newline would produce", () => {
    expect(addLineNumbers("a\nb\n")).toBe("   1 | a\n   2 | b");
  });
});

describe("validateFile", () => {
  it("rejects files over size limit", async () => {
    const file = { name: "big.txt", size: 2 * 1024 * 1024 } as File;
    const result = await validateFile(file, {
      maxFileSizeMB: 1,
      excludeHiddenFiles: false,
      excludeBinaryFiles: false,
    });

    expect(result.isValid).toBe(false);
    expect(result.reason).toContain("1MB");
  });

  it("rejects hidden files when configured", async () => {
    const file = { name: ".env", size: 100 } as File;
    const result = await validateFile(file, {
      maxFileSizeMB: 10,
      excludeHiddenFiles: true,
      excludeBinaryFiles: false,
    });

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe("Hidden file");
  });

  it("rejects binary files when configured", async () => {
    const file = { name: "photo.jpg", size: 100 } as File;
    const result = await validateFile(file, {
      maxFileSizeMB: 10,
      excludeHiddenFiles: false,
      excludeBinaryFiles: true,
    });

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe("Binary file");
  });

  it("rejects a file whose content is binary regardless of a text extension", async () => {
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x08, 0x06, 0x00, 0x00, 0x00, 0x5c, 0x72, 0xa8,
    ]);
    const file = new File([bytes], "mystery.txt");
    const result = await validateFile(file, {
      maxFileSizeMB: 10,
      excludeHiddenFiles: false,
      excludeBinaryFiles: true,
    });

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe("Binary file");
    expect(result.classification).toBe("binary");
  });

  it("keeps an ambiguous-content file valid but flags its classification", async () => {
    const ascii = "function totals() { return sum; } // ".repeat(3);
    const control = "\x01\x02\x03\x04\x05\x06\x07\x08\x0e\x0f\x10\x11\x12\x13";
    const file = new File([new TextEncoder().encode(ascii + control)], "app.log");
    const result = await validateFile(file, {
      maxFileSizeMB: 10,
      excludeHiddenFiles: false,
      excludeBinaryFiles: true,
    });

    expect(result.isValid).toBe(true);
    expect(result.classification).toBe("ambiguous");
  });

  it("keeps a text file that wears a binary-looking extension (content wins)", async () => {
    const file = new File([new TextEncoder().encode('<?xml version="1.0"?><svg/>')], "logo.ai");
    const result = await validateFile(file, {
      maxFileSizeMB: 10,
      excludeHiddenFiles: false,
      excludeBinaryFiles: true,
    });

    expect(result.isValid).toBe(true);
    expect(result.classification).toBe("text");
  });
});
