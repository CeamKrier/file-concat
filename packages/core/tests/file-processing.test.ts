import { describe, expect, it } from "vitest";
import {
  addLineNumbers,
  processFileContent,
  removeEmptyLines,
} from "../src/file-processing/transform";
import { isBinaryFile, validateFile } from "../src/file-processing/validation";

describe("removeEmptyLines", () => {
  it("removes blank lines", () => {
    const input = "a\n\n\n b\n";

    expect(removeEmptyLines(input)).toBe("a\n b\n");
  });
});

describe("addLineNumbers", () => {
  it("normalizes CRLF and CR", () => {
    const input = "a\r\nb\rc";

    expect(addLineNumbers(input)).toBe("   1 | a\n   2 | b\n   3 | c");
  });
});

describe("processFileContent", () => {
  it("applies requested transforms", () => {
    const input = "a\n\n b\n";
    const output = processFileContent(input, "text", {
      removeEmptyLines: true,
      showLineNumbers: true,
    });

    expect(output).toBe("   1 | a\n   2 |  b");
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

describe("isBinaryFile", () => {
  it("detects binary extensions", async () => {
    const file = { name: "archive.zip", size: 1 } as File;

    await expect(isBinaryFile(file)).resolves.toBe(true);
  });

  it("treats unknown extensions as non-binary", async () => {
    const file = { name: "note.txt", size: 1 } as File;

    await expect(isBinaryFile(file)).resolves.toBe(false);
  });
});
