import { Readability } from "@mozilla/readability";
import { savedPageUrl, type ExtractionResult } from "@fileconcat/core";
import { drawnControls, dropHidden, turndown, withStreamedSegments } from "./turndown-client";

/**
 * Client-only reading of a page a browser saved (extraction router, step R5).
 * Reached solely through the guarded dynamic import in ./parsers, which keeps
 * Readability and Turndown out of the Cloudflare SSR worker bundle.
 *
 * Readability picks the article out of the page and Turndown writes it as
 * Markdown, the pair the clipper uses on a live page (`apps/extension/src/
 * article.ts`) and the extraction eval scored on saved ones.
 */

/**
 * Below this much text the article is a claim the page does not support, and
 * the whole body is written instead. The clipper's floor. Counted on the
 * article's text with its white space collapsed, as Readability's own
 * `charThreshold` is, not its Markdown:
 * a table's pipes and a link's address lifted a too-small article past it on
 * real pages (a shop page that lost its product name). A ratio against
 * the full page (Jina keeps Readability at 30% or more) was measured on 180
 * pages of the Article Extraction Benchmark and would have thrown away a good
 * article on 106 of them: a page's chrome routinely outweighs its prose.
 */
const MIN_CHARS = 400;

/** The base a page with no known address is read against; nothing is fetched from it. */
const PLACEHOLDER = "https://localhost/";

/**
 * Page chrome by tag and role: what Readability's own candidate filter skips,
 * and what trafilatura drops outright. A `header` inside `article` or `main` is
 * the content's own heading and stays.
 */
const CHROME =
  "nav, aside, footer, [role=navigation], [role=banner], [role=contentinfo], [role=complementary], [role=dialog], [role=alertdialog], [aria-modal=true]";

/**
 * The body without its chrome, for when no article was found and the whole
 * body is written. A cookie banner is matched as trafilatura matches it: on
 * the first of `id` and `class` the element carries, because a page about
 * cookies carries the word on its content too.
 */
function withoutChrome(body: HTMLElement): HTMLElement {
  const copy = body.cloneNode(true) as HTMLElement;
  for (const element of copy.querySelectorAll(CHROME)) element.remove();
  for (const element of copy.querySelectorAll("header")) {
    if (!element.parentElement?.closest("article, main")) element.remove();
  }
  for (const element of copy.querySelectorAll("[id], [class]")) {
    const first = [...element.attributes].find((attribute) => attribute.name === "id" || attribute.name === "class");
    if (/cookie/i.test(first?.value ?? "") || /consent/i.test(element.getAttribute("class") ?? "")) element.remove();
  }
  return copy;
}

/**
 * A saved page keeps the encoding it was served in and says so in a `<meta>`;
 * a Turkish news site saved as windows-1254 reads as mojibake through UTF-8.
 */
function decode(bytes: Uint8Array): string {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
  const label = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1];
  try {
    return new TextDecoder(label ?? "utf-8").decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

export function extractHtml(bytes: Uint8Array): ExtractionResult {
  return readHtml(decode(bytes));
}

/**
 * The same reading on markup that is already text: a live page the url import
 * fetched, which `fetch` decoded by the charset its server sent. `fetchedFrom`
 * is that page's address, for links and the source line.
 */
export function readHtml(html: string, fetchedFrom?: string): ExtractionResult {
  const saved = savedPageUrl(html);
  const url = saved ?? fetchedFrom ?? PLACEHOLDER;
  const doc = new DOMParser().parseFromString(html, "text/html");
  // Readability resolves relative links against the document's base, which
  // for a parsed string is this site, not the page that was saved.
  if (!doc.querySelector("base[href]")) {
    const base = doc.createElement("base");
    base.href = url;
    doc.head.insertBefore(base, doc.head.firstChild);
  }
  withStreamedSegments(doc);
  if (doc.body) drawnControls(doc.body);
  const service = turndown(url);
  // A picture's address against the page it was saved from; the reader
  // only resolves the copy it keeps. A page with no known address keeps the
  // path it wrote, which the reader resolved against the placeholder.
  service.addRule("image", {
    filter: "img",
    replacement: (_content, node) => {
      const alt = ((node as HTMLElement).getAttribute("alt") ?? "").replace(/\s+/g, " ").trim();
      // As the link rule does: only a web address is written. A `data:`
      // picture is its whole file in base64, billed by the token.
      const raw = (node as HTMLElement).getAttribute("src")?.trim();
      if (!raw) return alt;
      try {
        const src = new URL(raw, url);
        if (!/^https?:$/.test(src.protocol)) return alt;
        const href = url === PLACEHOLDER && src.href.startsWith(PLACEHOLDER) ? src.href.slice(PLACEHOLDER.length) : src.href;
        // The hover title, as Turndown's own image rule writes it.
        const title = ((node as HTMLElement).getAttribute("title") ?? "").replace(/\s+/g, " ").trim().replace(/"/g, '\\"');
        return `![${alt}](${href}${title ? ` "${title}"` : ""})`;
      } catch {
        return alt;
      }
    },
  });
  const title = doc.title.trim();

  // Readability keeps no class but those named; a code block's language is one.
  const languages = Array.from(doc.querySelectorAll("code[class*='language-']"), (code) =>
    Array.from(code.classList).filter((name) => name.startsWith("language-")),
  );
  const article = new Readability(doc.cloneNode(true) as Document, { classesToPreserve: Array.from(new Set(([] as string[]).concat(...languages))) }).parse();
  let body = article?.content ? service.turndown(article.content).trim() : "";
  let reader = "readability";
  let hidden = 0;
  if ((article?.textContent?.replace(/\s+/g, " ").trim().length ?? 0) < MIN_CHARS) {
    // Readability skips hidden elements itself; the whole body kept them.
    hidden = doc.body ? dropHidden(doc.body) : 0;
    // A page that is all chrome by these rules still has its text read.
    body = doc.body ? service.turndown(withoutChrome(doc.body)).trim() || service.turndown(doc.body).trim() : "";
    reader = "turndown";
  }
  if (!body) return { text: "" };
  const notes = hidden > 0 ? { notes: [{ kind: "hidden-left-out" as const, count: hidden }] } : {};

  const heading = (article?.title?.trim() || title).replace(/\s+/g, " ");
  return {
    text: [
      heading && `# ${heading}`,
      saved ? `Saved from ${saved}` : fetchedFrom && `Fetched from ${fetchedFrom}`,
      body,
    ]
      .filter(Boolean)
      .join("\n\n"),
    reader,
    ...notes,
  };
}
