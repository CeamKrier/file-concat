// Any page that is mostly an article, with no site-specific line of code.
//
// This is the highest coverage per line in the whole extension: Substack,
// Medium, documentation, news and blogs are all just "a page with a body on
// it", and Readability has been deciding which part that is, in Firefox, for
// over a decade. Writing per-site selectors instead would be a maintenance
// contract with every publisher on the web.

import { Readability, isProbablyReaderable } from "@mozilla/readability";
import TurndownService from "turndown";
import type { ArticleClipping } from "./markdown";

/**
 * Below this much rendered Markdown, "article" is a claim the page does not
 * support. Checked on the finished body, never handed to `isProbablyReaderable`
 * — its `minContentLength` is a threshold *per paragraph*, so raising it there
 * rejects any page that writes in short ones. Measured: at 400 it turned down
 * MDN, Wikipedia and Substack alike.
 */
const MIN_CHARS = 400;

/**
 * `base` is the page's own URL. Passed in rather than read from `location` so
 * the link rule below — the one that decides what a clipping costs — can be
 * exercised without a browser.
 */
export function turndown(base: string): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "_",
  });
  // A figure's caption is content; the chrome around it is not.
  service.addRule("figure", {
    filter: "figure",
    replacement: (_content, node) => {
      const caption = (node as HTMLElement).querySelector("figcaption")?.textContent?.trim();
      return caption ? `\n\n_${caption}_\n\n` : "\n\n";
    },
  });
  // A same-origin link becomes its own text. Its href is a path on this site
  // that the anchor text already names, so in a bundle billed by the token it
  // is pure cost: measured 2026-08-19 at 27% of an MDN page, 22% of a Wikipedia
  // article and 13% of a blog post. An external link is kept, because it points
  // somewhere the prose does not say.
  service.addRule("sameOriginLink", {
    filter: (node) => node.nodeName === "A" && !!node.getAttribute("href"),
    replacement: (content, node) => {
      if (!content.trim()) return "";
      const href = node.getAttribute("href") ?? "";
      let resolved: URL;
      try {
        resolved = new URL(href, base);
      } catch {
        return content;
      }
      // `javascript:` parses as a perfectly good URL with a null origin, so
      // scheme is checked rather than inferred: without this a clipping carries
      // `[click](javascript:void\(0\))` as if it were a citation.
      if (resolved.protocol === "mailto:") return `[${content}](${resolved.href})`;
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return content;
      return resolved.origin === new URL(base).origin ? content : `[${content}](${resolved.href})`;
    },
  });
  // Reddit and YouTube get their own handlers; everywhere else, a bare `<img>`
  // in prose is decoration far more often than it is information, and its alt
  // text is usually empty. Images are out of scope for v1 either way.
  service.remove(["script", "style", "noscript", "iframe", "form", "button"]);
  return service;
}

/**
 * Whether the panel should offer to clip this page.
 *
 * `isProbablyReaderable` is the fast path and it is wrong in one direction: it
 * scores `p`, `pre` and `article` nodes only, so text kept anywhere else counts
 * for nothing however much of it there is. An arXiv abstract lives in a
 * `blockquote`. Measured 2026-08-21 over the six most recent cs.CL papers: all
 * six refused, each holding 1,269 to 1,804 characters of abstract, and all six
 * clipped correctly the moment Readability was actually asked.
 *
 * Lowering `minContentLength` does not reach it, since the node was never in
 * the candidate set to be measured.
 *
 * So when the cheap check says no, the question is settled by doing the work.
 * The offer and the clip now pass and fail together, which they did not before:
 * a page could be offered and then throw, or be refused while holding a perfect
 * clipping.
 *
 * ponytail: the slow path parses again when the user then clips. One parse per
 * navigation, only on pages currently being turned away. Cache the result if a
 * profile ever says it matters.
 */
export function looksLikeArticle(): boolean {
  if (isProbablyReaderable(document)) return true;
  try {
    clipArticle();
    return true;
  } catch {
    return false;
  }
}

export function articleTitle(): string {
  return (
    document.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim() ||
    document.title.trim() ||
    location.hostname
  );
}

const meta = (name: string) =>
  document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute("content")?.trim() ?? "";

export function clipArticle(): ArticleClipping {
  // Readability rewrites the document it is handed, so it gets a copy. Handing
  // it the live one strips the page the user is still looking at.
  const parsed = new Readability(document.cloneNode(true) as Document).parse();
  if (!parsed?.content) throw new Error("Nothing on this page reads as an article.");

  const body = turndown(location.href).turndown(parsed.content).trim();
  if (body.length < MIN_CHARS) throw new Error("This page has too little text to be worth clipping.");

  return {
    title: parsed.title?.trim() || articleTitle(),
    author: parsed.byline?.trim() || meta("author") || "",
    siteName: parsed.siteName?.trim() || location.hostname.replace(/^www\./, ""),
    url: location.href,
    // `article:published_time` is the one publishers agree on; Readability's own
    // guess is second because it is scraped from prose.
    published: meta("article:published_time") || parsed.publishedTime || "",
    excerpt: parsed.excerpt?.trim() || "",
    body,
    clippedOn: new Date().toISOString().slice(0, 10),
  };
}
