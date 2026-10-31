import { describe, expect, it, vi } from "vitest";
import { clearsRecognitionFloor, MIN_ALNUM, MIN_CONFIDENCE } from "~/lib/ocr";

/**
 * The floor, not the engine. Tesseract answers every picture, so what decides
 * whether an image joins the bundle is this predicate — and it is the one part
 * of recognition that can be checked without a worker (ADR-0017).
 */
describe("clearsRecognitionFloor", () => {
  it("accepts a confident reading with real words in it", () => {
    expect(clearsRecognitionFloor({ text: "TOTAL 42.00 EUR", confidence: 91 })).toBe(true);
  });

  it("rejects a reading tesseract is not confident about", () => {
    expect(
      clearsRecognitionFloor({ text: "TOTAL 42.00 EUR", confidence: MIN_CONFIDENCE - 1 }),
    ).toBe(false);
  });

  it("rejects the short junk a logo or a photograph of carpet returns", () => {
    expect(clearsRecognitionFloor({ text: "a|~ .", confidence: 96 })).toBe(false);
  });

  it("counts letters and digits in any script, not just ASCII", () => {
    expect(clearsRecognitionFloor({ text: "Müdürlüğü", confidence: 80 })).toBe(true);
    expect(clearsRecognitionFloor({ text: "x".repeat(MIN_ALNUM - 1), confidence: 99 })).toBe(
      false,
    );
  });
});

describe("recogniseImageWithOcr", () => {
  it("hands back a reading under the confidence floor as a guess, never as text", async () => {
    vi.doMock("~/lib/extract-document-client", () => ({
      recogniseImage: async () => ({ text: "Setlings > Acconut", confidence: 31 }),
    }));
    const { recogniseImageWithOcr } = await import("~/lib/ocr");
    const reading = await recogniseImageWithOcr(new File([], "shot.png"), "eng");
    expect(reading).toEqual({ text: "", confidence: 31, guess: "Setlings > Acconut" });
    vi.doUnmock("~/lib/extract-document-client");
  });

  it("offers no guess when there is too little writing to show", async () => {
    vi.resetModules();
    vi.doMock("~/lib/extract-document-client", () => ({
      recogniseImage: async () => ({ text: "a|~ .", confidence: 31 }),
    }));
    const { recogniseImageWithOcr } = await import("~/lib/ocr");
    const reading = await recogniseImageWithOcr(new File([], "logo.png"), "eng");
    expect(reading).toEqual({ text: "", confidence: 31 });
    vi.doUnmock("~/lib/extract-document-client");
  });
});
