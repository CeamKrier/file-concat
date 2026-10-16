/**
 * Which rows of the coverage map's "## 1. Saved HTML page" table
 * (results/web-text.md) a real .html file holds. Parsed with jsdom, the DOM
 * the coverage run itself used, so nesting rows (an `img` inside `figure`, a
 * closed `details`, a `header` outside `article`) are read from the tree, not
 * guessed from markup. Scripts are not run.
 *
 * "Holds" means the construct is in the markup with content where content is
 * the point (an empty `figcaption` is not a caption). Whether the page would
 * show it is the row's verdict, not the detector's business.
 */

import { createRequire } from "node:module";

const { JSDOM, VirtualConsole } = createRequire(new URL("../../../../../apps/web/package.json", import.meta.url))("jsdom");

const text = (el) => (el?.textContent ?? "").trim() !== "";
const any = (d, sel, test = text) => [...d.querySelectorAll(sel)].some(test);
const alt = (img) => (img.getAttribute("alt") ?? "").trim() !== "";
const absolute = /^[a-z][a-z0-9+.-]*:/i;
const host = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
};

const ROWS = {
  H1: (c) => text(c.d.querySelector("title")),
  H2: (c) => any(c.d, "meta[name=description i]", (m) => (m.getAttribute("content") ?? "").trim() !== ""),
  H3: (c) => !!c.saved,
  H4: (c) => any(c.d, "body h1"),
  H5: (c) => any(c.d, "body h2, body h3, body h4, body h5, body h6"),
  H6: (c) => any(c.d, "p"),
  H7: (c) => any(c.d, "ul > li, ol > li"),
  H8: (c) => any(c.d, "dl dt") && any(c.d, "dl dd"),
  H9: (c) => any(c.d, "table > caption"),
  H10: (c) => any(c.d, "table th"),
  // Body cells in rows; the probe's colspan is one shape of the same table.
  H11: (c) => any(c.d, "table td"),
  H12: (c) => any(c.d, "figcaption"),
  H13: (c) => any(c.d, "figure img", alt),
  H14: (c) => any(c.d, "img", (i) => alt(i) && !i.closest("figure")),
  H15: (c) => any(c.d, "img[src]", (i) => { const s = i.getAttribute("src").trim(); return s !== "" && !absolute.test(s) && !s.startsWith("//"); }),
  H16: (c) => any(c.d, "abbr[title]", (a) => a.getAttribute("title").trim() !== ""),
  H17: (c) => any(c.d, "time[datetime]"),
  H18: (c) => any(c.d, "code", (e) => text(e) && !e.closest("pre")),
  H19: (c) => c.links.some((h) => (!absolute.test(h) && !h.startsWith("//") && !h.startsWith("#")) || (!!c.origin && /^https?:/i.test(h) && host(h) === c.origin)),
  H20: (c) => c.links.some((h) => h.startsWith("//")),
  // Cross-origin against the saved-from or canonical address; any absolute
  // http(s) link when the page names neither.
  H21: (c) => c.links.some((h) => /^https?:/i.test(h) && (!c.origin || host(h) !== c.origin)),
  H22: (c) => c.comments > 0,
  H23: (c) => any(c.d, "details:not([open]) > summary"),
  H24: (c) => any(c.d, "details:not([open])", (d) => [...d.childNodes].some((n) => n.nodeName !== "SUMMARY" && text(n))),
  H25: (c) => any(c.d, "template", (t) => text(t.content)),
  H26: (c) => any(c.d, "noscript"),
  H27: (c) => any(c.d, "script, style"),
  H28: (c) => any(c.d, "body [hidden]"),
  H29: (c) => any(c.d, "body [aria-hidden=true i]"),
  H30: (c) => any(c.d, "label"),
  H31: (c) => any(c.d, "input[value]", (i) => /^(|text|search|email|url|tel|number)$/i.test(i.getAttribute("type") ?? "") && i.getAttribute("value").trim() !== ""),
  H32: (c) => any(c.d, "input[placeholder][value]", (i) => i.getAttribute("value").trim() !== ""),
  H33: (c) => any(c.d, "input[type=hidden i]", () => true),
  H34: (c) => any(c.d, "button") || any(c.d, "input[type=submit i][value], input[type=button i][value], input[type=reset i][value]", () => true),
  H35: (c) => any(c.d, "select option"),
  H36: (c) => any(c.d, "select", (s) => s.querySelectorAll("option").length > 1),
  H37: (c) => any(c.d, "textarea"),
  H38: (c) => any(c.d, "iframe[srcdoc]", (f) => f.getAttribute("srcdoc").trim() !== ""),
  H39: (c) => any(c.d, "iframe"),
  H40: (c) => any(c.d, "ruby rt"),
  H41: (c) => any(c.d, "svg text"),
  H42: (c) => any(c.d, "svg title, svg desc"),
  H43: (c) => any(c.d, "math mtext"),
  H44: (c) => any(c.d, "math annotation, math annotation-xml"),
  H45: (c) => any(c.d, "pre code"),
  H46: (c) => any(c.d, "code[class*=language-], code[class*=lang-], pre[class*=language-], pre[class*=lang-]", () => true),
  H47: (c) => any(c.d, "blockquote"),
  // The reader's rule (extract-html-client.ts withoutChrome): the first of
  // id/class names a cookie banner, or the class says consent.
  H48: (c) => any(c.d, "body [id], body [class]", (e) => {
    const first = [...e.attributes].find((a) => a.name === "id" || a.name === "class");
    return text(e) && (/cookie/i.test(first?.value ?? "") || /consent/i.test(e.getAttribute("class") ?? ""));
  }),
  H49: (c) => any(c.d, "header", (h) => text(h) && !h.parentElement?.closest("article, main")),
  H50: (c) => any(c.d, "nav, [role=navigation]"),
  H51: (c) => any(c.d, "[role=dialog], [role=alertdialog], [aria-modal=true]"),
  H52: (c) => any(c.d, "aside, [role=complementary]"),
  H53: (c) => any(c.d, "footer, [role=contentinfo]"),
};

export const UNDETECTABLE = {
  H54: "drawn order comes from CSS layout (flex/grid `order`, positioning); a DOM parse cannot tell it from source order",
};

export default async function detect(bytes) {
  try {
    const html = new TextDecoder().decode(bytes);
    // No row reads CSS, and jsdom's CSS parser throws on some stylesheets
    // (preprocessor leftovers such as `calc(($a - $b) / 16)`): a stylesheet
    // keeps only whether it was empty, for H27.
    const markup = html
      .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, open, css, close) => open + (css.trim() ? "css" : "") + close)
      .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, "");
    const d = new JSDOM(markup, { virtualConsole: new VirtualConsole() }).window.document;
    const saved = /<!--\s*saved from url=\(\d+\)(\S+?)\s*-->/i.exec(html)?.[1];
    const canonical = d.querySelector("link[rel=canonical i]")?.getAttribute("href");
    const origin = host(saved ?? canonical ?? "");
    // Every comment except the saved-from one, which is row H3.
    const comments = (html.match(/<!--[\s\S]*?-->/g) ?? []).filter((m) => !/^<!--\s*saved from url=/i.test(m)).length;
    const links = [...d.querySelectorAll("a[href]")].map((a) => a.getAttribute("href").trim()).filter((h) => h && !/^(javascript|mailto|tel|data):/i.test(h));
    const ctx = { d, saved, origin, comments, links };
    return Object.keys(ROWS).filter((row) => ROWS[row](ctx));
  } catch {
    return [];
  }
}
