import { describe, expect, it } from "vitest";
import {
  unreadableLabel,
  unreadableReason,
  unreadableReasonText,
} from "../src/file-processing/unreadable-reason";

const cfb = { kind: "binary", format: "cfb" } as const;

describe("unreadableReason", () => {
  it("names a 97-2003 Office file by what it is and says what would make it readable", () => {
    expect(unreadableReason("forms/Part-B-BUDGETS.xls", cfb)).toEqual({
      label: "Excel 97-2003 workbook",
      remedy: "Save it as .xlsx and it will be read.",
    });
    expect(unreadableReason("memo.doc", cfb).label).toBe("Word 97-2003 document");
    expect(unreadableReason("deck.ppt", cfb).label).toBe("PowerPoint 97-2003 file");
    // The one remedy that points at a format this tool already reads.
    expect(unreadableReason("inbox/re-quote.msg", cfb).remedy).toContain(".eml");
  });

  it("reads a compound file under a modern extension as protected or misnamed", () => {
    const reason = unreadableReason("report.docx", cfb);
    expect(reason.label).toBe("Password-protected or 97-2003 Office file");
    expect(reason.remedy).toContain(".docx");
  });

  it("trusts the bytes over the extension", () => {
    // A compound file named .txt is still one; the byte classifier would have
    // called it binary, and this says what kind.
    expect(unreadableReason("notes.txt", cfb).label).toBe("Microsoft 97-2003 Office family file");
  });

  it("explains an archive the browser cannot open, whether the router or the name says so", () => {
    expect(unreadableReason("dump.rar", { kind: "expand", archive: "rar" })).toEqual({
      label: "rar archive the browser can't open",
      remedy: "Unpack it first, or use .zip or .tar, which are opened here.",
    });
    expect(unreadableReason("dump.tar.xz", { kind: "unknown" }).label).toBe(
      ".xz archive the browser can't open",
    );
  });

  it("puts the common binaries in a family and everything else under the generic label", () => {
    expect(unreadableReason("Inter.woff2").label).toBe("Font file");
    expect(unreadableReason("build/main.o").label).toBe("Compiled code or library");
    expect(unreadableReason("cache.sqlite").label).toBe("Database file");
    expect(unreadableReason("weights.safetensors").label).toBe("Data or model file");
    expect(unreadableReason("book.mobi").remedy).toContain("Calibre");
    expect(unreadableReason("draft.pages").remedy).toContain(".docx");
    expect(unreadableReason("mystery.xyz")).toEqual({ label: "Binary file" });
    expect(unreadableReason("no-extension")).toEqual({ label: "Binary file" });
  });

  it("labels a routed image as an image and the ones recognition cannot read by kind", () => {
    expect(unreadableReason("shot.png", { kind: "binary", format: "png" })).toEqual({ label: "Image" });
    expect(unreadableReason("favicon.ico", { kind: "binary", format: "ico" }).label).toBe("Icon file");
    expect(unreadableReason("clip.mov", { kind: "binary", format: "iso-bmff" }).label).toBe(
      "Video, or a HEIC photo",
    );
  });

  it("stores label and remedy as one string and recovers the label from it", () => {
    const text = unreadableReasonText(unreadableReason("budget.xls", cfb));
    expect(text).toBe("Excel 97-2003 workbook. Save it as .xlsx and it will be read.");
    expect(unreadableLabel(text)).toBe("Excel 97-2003 workbook");
    // A remedy-less reason is its own label, and a period inside an extension
    // is not a sentence end.
    expect(unreadableLabel("Font file")).toBe("Font file");
    expect(unreadableLabel(".xz archive the browser can't open. Unpack it first.")).toBe(
      ".xz archive the browser can't open",
    );
  });
});
