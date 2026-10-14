import { describe, expect, it } from "vitest";
import { extractHtml, readHtml } from "~/lib/extract-html-client";

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

  it("leaves the page chrome out of the whole body too", () => {
    const { text, reader } = extractHtml(
      page(
        `<header><a href="/">Example</a></header><nav>Home About</nav>
         <div class="cookie-banner">We use cookies. Accept all</div>
         <div role="dialog">Subscribe now</div>
         <main><header><h1>Opening hours</h1></header><p>Monday to Friday, 9 to 5.</p>
         <p id="policy" class="cookie-policy">Our cookie policy changed in May.</p></main>
         <aside>Related posts</aside><footer>Copyright Example</footer>`,
      ),
    );
    expect(reader).toBe("turndown");
    expect(text).toContain("Opening hours");
    expect(text).toContain("Monday to Friday, 9 to 5.");
    // A page about cookies carries the word on its content; only an element
    // whose first id or class names it is a banner (trafilatura's rule).
    expect(text).toContain("Our cookie policy changed in May.");
    for (const chrome of ["Home About", "Accept all", "Subscribe now", "Related posts", "Copyright Example"]) {
      expect(text).not.toContain(chrome);
    }
  });

  it("keeps a page that is nothing but chrome", () => {
    expect(extractHtml(page("<footer>Contact: 555 0100</footer>")).text).toContain("Contact: 555 0100");
  });

  it("decodes the page in the charset it declares", () => {
    const head = '<meta charset="windows-1254">';
    const ascii = page("<p>__</p>", head);
    // "ş" and "ğ" in windows-1254.
    const bytes = Uint8Array.from([...ascii].flatMap((b, i, all) => (b === 0x5f && all[i + 1] === 0x5f ? [0xfe] : b === 0x5f ? [0xf0] : [b])));
    expect(extractHtml(bytes).text).toContain("şğ");
  });

  it("reads a fetched live page against the address it came from", () => {
    const { text, reader } = readHtml(
      `<html><head><title>Live</title></head><body><nav>Menu</nav><article><p>${prose}</p>
       <p><a href="/next">Next</a> and <a href="https://mozilla.org/x">Mozilla</a>.</p></article></body></html>`,
      "https://example.com/blog/live",
    );
    expect(reader).toBe("readability");
    expect(text.startsWith("# Live\n\nFetched from https://example.com/blog/live\n\n")).toBe(true);
    expect(text).toContain("Next and [Mozilla](https://mozilla.org/x).");
    expect(text).not.toContain("Menu");
  });
});
