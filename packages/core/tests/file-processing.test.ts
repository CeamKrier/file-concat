import { describe, expect, it } from "vitest";
import { addLineNumbers } from "../src/file-processing/transform";
import { isBinaryContent, isBinaryFile, validateFile } from "../src/file-processing/validation";

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
});

describe("isBinaryContent", () => {
  it("flags a prefix containing a NUL byte as binary", () => {
    expect(isBinaryContent(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01]))).toBe(true);
  });

  it("treats pure text bytes as non-binary", () => {
    expect(isBinaryContent(new TextEncoder().encode("export const x = 1;\n"))).toBe(false);
  });

  it("treats empty input as non-binary", () => {
    expect(isBinaryContent(new Uint8Array([]))).toBe(false);
  });
});

describe("isBinaryFile", () => {
  it("falls back to the extension allowlist when bytes can't be read", async () => {
    // A bare mock has no slice()/arrayBuffer(), so the read throws and the
    // extension fallback decides.
    await expect(isBinaryFile({ name: "archive.zip", size: 1 } as File)).resolves.toBe(true);
    await expect(isBinaryFile({ name: "note.txt", size: 1 } as File)).resolves.toBe(false);
  });

  it("processes a text file even under a binary-looking extension (content wins)", async () => {
    const file = new File([new TextEncoder().encode('<?xml version="1.0"?><svg/>')], "logo.ai");
    await expect(isBinaryFile(file)).resolves.toBe(false);
  });

  it("skips a file whose bytes are binary despite a text extension (content wins)", async () => {
    const file = new File([new Uint8Array([0x89, 0x50, 0x00, 0x01, 0x02])], "data.txt");
    await expect(isBinaryFile(file)).resolves.toBe(true);
  });
});
