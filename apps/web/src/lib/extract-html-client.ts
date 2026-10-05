import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { savedPageUrl, type ExtractionResult } from "@fileconcat/core";

/**
 * Client-only reading of a page a browser saved (extraction router, step R5).
 * Reached solely through the guarded dynamic import in ./parsers, which keeps
 * Readability and Turndown out of the Cloudflare SSR worker bundle.
 *
 * Readability picks the article out of the page and Turndown writes it as
 * Markdown, the pair the clipper uses on a live page (`apps/extension/src/
 * article.ts`) and the extraction eval scored on saved ones. The Turndown
 * options and the link rule are the clipper's, copied rather than shared
 * because the extension is not a workspace package.
 */

/**
 * Below this much Markdown the article is a claim the page does not support,
 * and the whole body is written instead. The clipper's floor. A ratio against
 * the full page (Jina keeps Readability at 30% or more) was measured on 180
 * pages of the Article Extraction Benchmark and would have thrown away a good
 * article on 106 of them: a page's chrome routinely outweighs its prose.
 */
const MIN_CHARS = 400;

function turndown(base: string): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "_",
  });
  service.addRule("figure", {
    filter: "figure",
    replacement: (_content, node) => {
      const caption = (node as HTMLElement).querySelector("figcaption")?.textContent?.trim();
      return caption ? `\n\n_${caption}_\n\n` : "\n\n";
    },
  });
  // A same-origin link becomes its own text: its href is a path on the site
  // that the anchor text already names, so in a bundle billed by the token it
  // is pure cost. An external link points somewhere the prose does not say.
  service.addRule("sameOriginLink", {
    filter: (node) => node.nodeName === "A" && !!node.getAttribute("href"),
    replacement: (content, node) => {
      if (!content.trim()) return "";
      let resolved: URL;
      try {
        resolved = new URL(node.getAttribute("href") ?? "", base);
      } catch {
        return content;
      }
      if (resolved.protocol === "mailto:") return `[${content}](${resolved.href})`;
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return content;
      return resolved.origin === new URL(base).origin ? content : `[${content}](${resolved.href})`;
    },
  });
  service.remove(["script", "style", "noscript", "iframe", "form", "button", "template"]);
  return service;
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
  const html = decode(bytes);
  const saved = savedPageUrl(html);
  const url = saved ?? "https://localhost/";
  const doc = new DOMParser().parseFromString(html, "text/html");
  // Readability resolves relative links against the document's base, which
  // for a parsed string is this site, not the page that was saved.
  if (!doc.querySelector("base[href]")) {
    const base = doc.createElement("base");
    base.href = url;
    doc.head.insertBefore(base, doc.head.firstChild);
  }
  const service = turndown(url);
  const title = doc.title.trim();

  const article = new Readability(doc.cloneNode(true) as Document).parse();
  let body = article?.content ? service.turndown(article.content).trim() : "";
  let reader = "readability";
  if (body.length < MIN_CHARS) {
    body = doc.body ? service.turndown(doc.body).trim() : "";
    reader = "turndown";
  }
  if (!body) return { text: "" };

  const heading = (article?.title?.trim() || title).replace(/\s+/g, " ");
  return {
    text: [heading && `# ${heading}`, saved && `Saved from ${saved}`, body].filter(Boolean).join("\n\n"),
    reader,
  };
}
