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

  it("keeps a figure's image, with its alt text, above its caption", () => {
    const { text } = readHtml(`<html><body><ul><li>Milk</li></ul><figure><img src="https://cdn.example.org/f.png" alt="QZALT"><figcaption>QZCAP</figcaption></figure></body></html>`);
    expect(text).toContain("![QZALT](https://cdn.example.org/f.png)\n\n_QZCAP_");
  });

  it("writes a form's controls as what they draw, in the article and in the whole body", () => {
    const form =
      '<form><label>Name</label> <input value="Ada"> <input type="password" value="QZSECRET"> <input type="hidden" value="QZTOKEN">' +
      "<select><option>QZUNSEEN</option><option selected>Second</option></select>" +
      // A list box draws its rows, so they stay as they are.
      "<select multiple><option>Listed</option></select><textarea>Notes here</textarea><button>QZSEND</button></form>";
    for (const body of [`<article><h1>A post</h1><p>${prose}</p>${form}<p>${prose}</p></article>`, form]) {
      const { text } = extractHtml(page(body));
      expect(text).toMatch(/Name Ada\s+Second\s+Listed\s+Notes here/);
      for (const word of ["QZSECRET", "QZTOKEN", "QZUNSEEN", "QZSEND"]) expect(text).not.toContain(word);
    }
  });

  it("writes a details summary apart from its body, an inline frame's document, and a fenced block's language", () => {
    const { text } = extractHtml(
      page(
        `<article><h1>A post</h1><p>${prose}</p><details><summary>Show more</summary>Hidden body</details>` +
          `<iframe srcdoc="&lt;p&gt;Framed text&lt;/p&gt;"></iframe><pre><code class="language-python">print(1)</code></pre><p>${prose}</p></article>`,
      ),
    );
    expect(text).toContain("Show more\n\nHidden body");
    expect(text).toContain("Framed text");
    expect(text).toContain("```python\nprint(1)\n```");
  });

  it("resolves a picture's relative address against the page it was saved from", () => {
    const { text } = extractHtml(page('<ul><li>Milk</li></ul><img src="pic.png" alt="A cat">'));
    expect(text).toContain("![A cat](https://example.com/blog/pic.png)");
    expect(extractHtml(page('<ul><li>Milk</li></ul><img src="data:image/png;base64,QZBLOB" alt="A dog">')).text).toMatch(/A dog$/);
    expect(readHtml('<html><body><p>Milk</p><img src="pic.png" alt="A cat"></body></html>').text).toContain("![A cat](pic.png)");
    expect(readHtml(`<html><body><p>Milk</p><img src="pic.png" alt="A cat" title='Our "Tom"\n cat'></body></html>`).text).toContain('![A cat](pic.png "Our \\"Tom\\" cat")');
    const unsaved = readHtml(`<html><body><article><p>${prose}</p><img src="img/cat.png" alt="A cat"><img src="data:image/png;base64,QZBLOB" alt="A dog"></article></body></html>`);
    expect(unsaved.reader).toBe("readability");
    expect(unsaved.text).toContain("![A cat](img/cat.png)");
    expect(unsaved.text).not.toContain("QZBLOB");
  });

  it("moves React's streamed segments into place before reading", () => {
    const { text } = extractHtml(
      page(
        `<main><!--$?--><template id="B:0"></template><p>Loading the post</p><!--/$--></main>` +
          `<div hidden id="S:0"><article><h1>A post</h1><p>${prose}</p><template id="P:1"></template></article></div><div hidden id="S:1"><p>Late paragraph</p></div>` +
          `<div hidden id="S:2"><p><template id="P:2"></template></p></div>` +
          `<script>$RC("B:0","S:0")</script><script>$RS("S:1","P:1")</script><script>$RS("S:2","P:2")</script>`,
      ),
    );
    expect(text).toContain(prose.trim());
    expect(text).not.toContain("Loading the post");
    expect(text).toContain("Late paragraph");
  });

  it("measures the article by its text, not its Markdown, against the floor", () => {
    const link = `https://shop.example.net/${"category/".repeat(40)}item`;
    const { text, reader } = extractHtml(
      page(`<div><h2>Widget 3000</h2><span>In stock</span></div><article><p>Buy it${"\n".repeat(400)}<a href="${link}">here</a>.</p></article>`),
    );
    expect(reader).toBe("turndown");
    expect(text).toContain("Widget 3000");
  });

  it("drops hidden elements from any root it is handed, as the ebook reader does", () => {
    const doc = new DOMParser().parseFromString(`<body><p>Kept</p><p style="display: None">Gone</p></body>`, "text/html");
    expect(dropHidden(doc.body)).toBe(1);
    expect(doc.body.textContent).toBe("Kept");
  });
});
