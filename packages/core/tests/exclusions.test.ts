import { describe, expect, it } from "vitest";
import { summarizeExclusions } from "../src/file-processing/exclusions";

describe("summarizeExclusions", () => {
  it("buckets a size-exceeded file into oversize by path", () => {
    const result = summarizeExclusions([
      { path: "data/dump.sql", reason: "File size exceeds 5MB limit", included: false },
    ]);
    expect(result.oversize).toEqual(["data/dump.sql"]);
  });

  it("buckets both extraction-failure reasons into unextractable", () => {
    const result = summarizeExclusions([
      { path: "scans/a.pdf", reason: "No extractable text", included: false },
      { path: "scans/b.pdf", reason: "Couldn't extract text", included: false },
    ]);
    expect(result.unextractable).toEqual(["scans/a.pdf", "scans/b.pdf"]);
  });

  it("buckets a binary file into binary", () => {
    const result = summarizeExclusions([
      { path: "logo.png", reason: "Binary file", included: false },
    ]);
    expect(result.binary).toEqual(["logo.png"]);
  });

  it("groups binary files whose kind is named, and keeps the nameless ones as binary", () => {
    const result = summarizeExclusions([
      {
        path: "budget.xls",
        reason: "Excel 97-2003 workbook. Save it as .xlsx and it will be read.",
        included: false,
        classification: "binary",
      },
      {
        path: "old/q1.xls",
        reason: "Excel 97-2003 workbook. Save it as .xlsx and it will be read.",
        included: false,
        classification: "binary",
      },
      { path: "mail.msg", reason: "Outlook message. Save it as .eml and it will be read.", included: false, classification: "binary" },
      { path: "logo.png", reason: "Image", included: false, classification: "binary" },
      { path: "blob.dat", reason: "Binary file", included: false, classification: "binary" },
    ]);
    // The label is the reason's first sentence; the remedy stays on screen.
    expect(result.unsupported).toEqual([
      { label: "Excel 97-2003 workbook", paths: ["budget.xls", "old/q1.xls"] },
      { label: "Outlook message", paths: ["mail.msg"] },
    ]);
    expect(result.binary).toEqual(["logo.png", "blob.dat"]);
  });

  it("still buckets on the reason's wording when no classification is given", () => {
    const result = summarizeExclusions([
      { path: "font.ttf", reason: "Font file", included: false, classification: "binary" },
      { path: "legacy.bin", reason: "Binary file", included: false },
    ]);
    expect(result.unsupported).toEqual([{ label: "Font file", paths: ["font.ttf"] }]);
    expect(result.binary).toEqual(["legacy.bin"]);
  });

  it("ignores noise, hidden, gitignore, pattern and manual exclusions", () => {
    const result = summarizeExclusions([
      { path: "a", reason: "Matched .gitignore", included: false },
      { path: "b", reason: "Outside include patterns", included: false },
      { path: "c", reason: "Matched ignore patterns", included: false },
      { path: "d", reason: "Hidden file", included: false },
      { path: "e", reason: "Excluded manually", included: false },
      { path: "f", reason: "Excluded", included: false },
    ]);
    expect(result).toEqual({});
  });

  it("ignores included files even when they carry a reason", () => {
    const result = summarizeExclusions([
      { path: "keep.png", reason: "Binary file", included: true },
    ]);
    expect(result).toEqual({});
  });

  it("returns an empty object when nothing qualifies", () => {
    expect(summarizeExclusions([])).toEqual({});
  });
});
