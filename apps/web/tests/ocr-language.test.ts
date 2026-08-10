import { describe, expect, it } from "vitest";
import { ocrLanguageFor, ocrLanguageName, ocrLanguageOptions } from "~/lib/ocr-language";

/**
 * A scan holds no text, so the language cannot be discovered from the document.
 * The browser's list is the guess, and the cost of guessing wrong is measured:
 * a Turkish page read as English scores 1/8 on words needing Turkish letters,
 * against 6/8 read as Turkish.
 */
describe("ocrLanguageFor", () => {
  it("takes the first tag it has a model for", () => {
    expect(ocrLanguageFor(["tr-TR", "en-US"]).code).toBe("tur");
    expect(ocrLanguageFor(["en-US", "tr"]).code).toBe("eng");
    expect(ocrLanguageFor(["de"]).code).toBe("deu");
  });

  it("skips tags with no model rather than giving up on the list", () => {
    // `mi` (Maori) has no traineddata here; the next tag must still be tried.
    expect(ocrLanguageFor(["mi", "fr-CA"]).code).toBe("fra");
  });

  it("reads Chinese script and region before falling back to simplified", () => {
    expect(ocrLanguageFor(["zh-Hant-TW"]).code).toBe("chi_tra");
    expect(ocrLanguageFor(["zh-TW"]).code).toBe("chi_tra");
    expect(ocrLanguageFor(["zh-CN"]).code).toBe("chi_sim");
    expect(ocrLanguageFor(["zh"]).code).toBe("chi_sim");
  });

  it("falls back to English rather than to a code that would fail", () => {
    // An unresolvable code does not degrade recognition, it throws and the
    // document goes back to unreadable. English is always a valid answer.
    expect(ocrLanguageFor([]).code).toBe("eng");
    expect(ocrLanguageFor(["xx", "qq-ZZ"]).code).toBe("eng");
    expect(ocrLanguageFor(["", "  "]).code).toBe("eng");
  });

  it("keeps the tag it matched, so the choice can be named on screen", () => {
    expect(ocrLanguageFor(["pt-BR"])).toEqual({ code: "por", locale: "pt-BR" });
  });
});

describe("ocrLanguageName", () => {
  it("names the language in English, without the region the model doesn't have", () => {
    expect(ocrLanguageName(ocrLanguageFor(["tr-TR"]))).toBe("Turkish");
    expect(ocrLanguageName(ocrLanguageFor(["de-DE"]))).toBe("German");
    // en-GB and en-US both load `eng`, so the region would describe the reader
    // rather than the reading.
    expect(ocrLanguageName(ocrLanguageFor(["en-GB"]))).toBe("English");
  });

  it("keeps the script, which really does pick a different model", () => {
    expect(ocrLanguageName(ocrLanguageFor(["zh-Hant-TW"]))).toBe("Traditional Chinese");
    expect(ocrLanguageName(ocrLanguageFor(["zh-CN"]))).toBe("Chinese");
  });

  it("falls back to the model code rather than showing a raw tag", () => {
    expect(ocrLanguageName({ code: "eng", locale: "zz" })).toBe("eng");
  });
});

describe("ocrLanguageOptions", () => {
  const options = ocrLanguageOptions();

  it("offers each model exactly once, so the control has no duplicate rows", () => {
    const codes = options.map((o) => o.code);
    expect(new Set(codes).size).toBe(codes.length);
    // nb / nn / no all load `nor`; zh / zh-Hant are two different models.
    expect(codes).toContain("nor");
    expect(codes).toContain("chi_sim");
    expect(codes).toContain("chi_tra");
  });

  it("offers a tag the resolver round-trips, or the control would read blank", () => {
    // The select matches on these values, so every one has to resolve back to
    // the model it claims to name.
    for (const option of options) {
      expect(ocrLanguageFor([option.locale]).code).toBe(option.code);
    }
  });

  it("names a script-chosen model by its script, never by a region", () => {
    // `zh-TW`, `zh-HK` and `zh-Hant` all pick chi_tra; naming it "Chinese
    // (Taiwan)" would describe a place, for a model that reads Traditional
    // Chinese wherever it is written.
    const traditional = options.find((o) => o.code === "chi_tra");
    expect(traditional?.name).toBe("Traditional Chinese");
  });

  it("names every option, sorted, with nothing left as a raw code", () => {
    expect(options.every((o) => /^[A-Z]/.test(o.name))).toBe(true);
    expect(options.map((o) => o.name)).toEqual([...options.map((o) => o.name)].sort());
  });
});
