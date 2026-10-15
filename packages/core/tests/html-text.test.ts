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

  it("writes an image as its alt text where it sits", () => {
    expect(flattenHtml(`<p>Logo<img src="cid:a" alt="Acme &amp; Co">here <img alt=Bare> <img alt="image1.png"><img src="x.gif"></p>`).trim()).toBe(
      "Logo [Image: Acme & Co] here [Image: Bare]",
    );
    expect(flattenHtml(`<p>A<img hidden alt="Secret"><img style="display: none" alt="Secret">B</p>`).trim()).toBe("AB");
  });

  it("writes a link as [text](address), once, and only to somewhere outside the message", () => {
    expect(flattenHtml(`<p>See <a href="https://x.example/a?b=1&amp;c=2">our <b>docs</b></a>.</p>`).trim()).toBe("See [our docs](https://x.example/a?b=1&c=2) .");
    expect(flattenHtml(`<a href="mailto:ab@x.example">ab@x.example</a> <a href="https://x.example/">https://x.example/</a>`).trim()).toBe(
      "ab@x.example https://x.example/",
    );
    expect(flattenHtml(`<a href="#top">Top</a> <a href="javascript:go()">Go</a> <a href="cid:1">Pic</a> <a href="https://x.example/"></a>`).trim()).toBe("Top Go Pic");
  });

  it("flattens crafted markup in one pass", () => {
    for (const unit of ["<a ", "<!--", "<script ", "<script>", "<p ", "<blockquote ", "</script"]) {
      const html = unit.repeat(40_000);
      const started = performance.now();
      flattenHtml(html);
      formatEmail({ attachments: [], html });
      expect(performance.now() - started, unit).toBeLessThan(1000);
    }
  });
});
