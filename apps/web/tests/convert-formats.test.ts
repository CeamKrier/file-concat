import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CONVERT_FORMATS, SAMPLES, readsAndLoses } from "~/components/convert/convert-formats";
import { CONVERT_LINKS } from "~/components/convert/convert-links";

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

  // The footer and /docs/formats link from CONVERT_LINKS, so a new page added
  // only to CONVERT_FORMATS would be reachable from nowhere but its siblings.
  it("are all linked from the footer, the formats list and the sitemap", () => {
    expect(CONVERT_LINKS).toEqual(CONVERT_FORMATS.map(({ slug, label, formats }) => ({ slug, label, formats })));
    const sitemap = readFileSync(join(__dirname, "..", "scripts", "generate-sitemap.ts"), "utf8");
    for (const { slug } of CONVERT_FORMATS) expect(sitemap).toContain(`url: "/convert/${slug}"`);
  });
});
