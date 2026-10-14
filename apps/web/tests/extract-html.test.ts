import { describe, expect, it } from "vitest";
import { extractHtml, readHtml } from "~/lib/extract-html-client";
import { dropHidden } from "~/lib/turndown-client";

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

  it("leaves out what the author hid from the whole body and says how much", () => {
    const hidden = `<p hidden>QZATTR</p><span style="display:none">QZNONE</span>
       <div style="visibility: hidden"><p>QZVIS</p><p style="display:none">QZNESTED</p></div><span style="display:none"></span>`;
    // A carousel caption waiting to fade in, and the inline-block gap fix.
    const shown = `<span aria-hidden="true">QZARIA</span><p hidden="until-found">QZFOUND</p>
       <figcaption style="opacity: 0">QZFADE</figcaption><div style="font-size:0"><span style="font-size:14px">QZGAP</span></div>`;
    const { text, notes, reader } = readHtml(`<html><body><ul><li>Milk</li></ul>${hidden}${shown}</body></html>`);
    expect(reader).toBe("turndown");
    for (const word of ["QZATTR", "QZNONE", "QZVIS", "QZNESTED"]) expect(text).not.toContain(word);
    for (const word of ["QZARIA", "QZFOUND", "QZFADE", "QZGAP"]) expect(text).toContain(word);
    // The nested one went with its parent, the empty one held nothing.
    expect(notes).toEqual([{ kind: "hidden-left-out", count: 3 }]);
    // An article Readability picked never held them, so nothing is noted.
    const article = readHtml(`<html><body><article><p>${prose}</p>${hidden}</article></body></html>`);
    expect(article.text).not.toContain("QZNONE");
    expect(article.notes).toBeUndefined();
  });

  it("drops hidden elements from any root it is handed, as the ebook reader does", () => {
    const doc = new DOMParser().parseFromString(`<body><p>Kept</p><p style="display: None">Gone</p></body>`, "text/html");
    expect(dropHidden(doc.body)).toBe(1);
    expect(doc.body.textContent).toBe("Kept");
  });
});
