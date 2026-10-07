import { describe, expect, it } from "vitest";
import { extractMobi } from "~/lib/extract-ebook-client";

describe("extractMobi", () => {
  it("refuses a DRM-protected book instead of decoding it to noise", async () => {
    // PalmDB header, one record at byte 86, PalmDOC encryption 2 (Mobipocket).
    const bytes = new Uint8Array(120);
    const view = new DataView(bytes.buffer);
    bytes.set(new TextEncoder().encode("BOOKMOBI"), 60);
    view.setUint16(76, 1);
    view.setUint32(78, 86);
    view.setUint16(86 + 12, 2);
    await expect(extractMobi(bytes)).rejects.toThrow("DRM");
  });
});
