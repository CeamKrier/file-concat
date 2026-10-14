import { describe, expect, it } from "vitest";

import { CONVERT_FORMATS, SAMPLES, readsAndLoses } from "~/components/convert/convert-formats";

describe("the /convert pages", () => {
  it("name only READ_FORMATS entries and each have a captured sample", () => {
    for (const format of CONVERT_FORMATS) {
      expect(() => readsAndLoses(format)).not.toThrow();
      const sample = SAMPLES.samples[format.key];
      expect(sample.excerpt).toContain(`<file path="${sample.file}"`);
    }
  });

  it("have unique slugs", () => {
    expect(new Set(CONVERT_FORMATS.map((f) => f.slug)).size).toBe(CONVERT_FORMATS.length);
  });
});
