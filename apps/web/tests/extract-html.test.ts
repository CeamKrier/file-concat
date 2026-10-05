import { describe, expect, it } from "vitest";
import { extractHtml } from "~/lib/extract-html-client";

const prose = "Saved pages carry the article and everything around it. ".repeat(12);
const page = (body: string, head = "") =>
  new TextEncoder().encode(
    `<!DOCTYPE html>\n<!-- saved from url=(0031)https://example.com/blog/a-post -->\n<html><head>${head}<title>A post | Example</title></head><body>${body}</body></html>`,
  );

describe("extractHtml", () => {
  it("writes the article as Markdown and drops the page chrome", () => {
    const { text, reader } = extractHtml(
      page(
        `<nav><a href="/">Home</a><a href="/about">About</a></nav>
         <article><h1>A post</h1><p>${prose}</p>
         <p>See <a href="/blog/other">the other post</a> and <a href="https://mozilla.org/x">Mozilla</a>.</p></article>
         <footer>Copyright Example</footer><script>track()</script>`,
      ),
    );
    expect(reader).toBe("readability");
    expect(text.startsWith("# A post | Example\n\nSaved from https://example.com/blog/a-post\n\n")).toBe(true);
    expect(text).toContain("See the other post and [Mozilla](https://mozilla.org/x).");
    expect(text).not.toContain("Copyright Example");
    expect(text).not.toContain("track()");
  });

  it("writes the whole body when there is no article to find", () => {
    const { text, reader } = extractHtml(page("<ul><li>Milk</li><li>Eggs</li></ul><script>x()</script>"));
    expect(reader).toBe("turndown");
    expect(text).toContain("-   Milk");
    expect(text).not.toContain("x()");
  });

  it("decodes the page in the charset it declares", () => {
    const head = '<meta charset="windows-1254">';
    const ascii = page("<p>__</p>", head);
    // "ş" and "ğ" in windows-1254.
    const bytes = Uint8Array.from([...ascii].flatMap((b, i, all) => (b === 0x5f && all[i + 1] === 0x5f ? [0xfe] : b === 0x5f ? [0xf0] : [b])));
    expect(extractHtml(bytes).text).toContain("şğ");
  });
});
