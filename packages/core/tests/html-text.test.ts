import { describe, expect, it } from "vitest";
import { formatEmail } from "../src/file-processing/parsers/email";
import { flattenHtml } from "../src/file-processing/parsers/html-text";

describe("flattenHtml", () => {
  it("reads tags as a browser's tokenizer does", () => {
    // A `<` that opens no tag is text; a custom element is not the paragraph its name starts with.
    expect(flattenHtml("<td>P1</td><td>a < 24 hours</td>")).toBe("P1 | a < 24 hours");
    expect(flattenHtml("One<p-panel>Two</p-panel><P class=x>Three")).toBe("OneTwo\nThree");
    // An unclosed script or comment runs to the end; a declaration goes.
    expect(flattenHtml("<!DOCTYPE html>Kept<SCRIPT>var a = 1 < 2;</script >After<style>x")).toBe("KeptAfter");
    expect(flattenHtml("Kept<!-- never closed <p>Lost")).toBe("Kept");
  });

  it("flattens crafted markup in one pass", () => {
    for (const unit of ["<a ", "<!--", "<script ", "<script>", "<p ", "<blockquote ", "</script"]) {
      const started = performance.now();
      flattenHtml(unit.repeat(40_000));
      formatEmail({ attachments: [], html: unit.repeat(40_000) });
      expect(performance.now() - started, unit).toBeLessThan(1000);
    }
  });
});
