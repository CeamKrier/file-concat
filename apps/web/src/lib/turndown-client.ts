import TurndownService from "turndown";

/**
 * Remove what the author hid from `root` and say how many hidden elements held
 * text (Q18 O1): the `hidden` attribute and an inline `display: none` or
 * `visibility: hidden`, the set Readability skips when it picks an article.
 * The whole-body fallback and the ebook reader kept them. `aria-hidden` stays:
 * that text is on screen, only kept from a screen reader, and so does
 * `hidden="until-found"`, which a find on the page reveals.
 *
 * Zero opacity and zero font size stay too, measured on saved pages: a
 * carousel's captions sit at opacity 0 until script fades them in, and a zero
 * font size on a container is the usual fix for gaps between inline blocks,
 * whose children set their own.
 *
 * ponytail: inline styles only; a stylesheet rule or white-on-white text needs
 * computed styles, which a parsed document has no layout for.
 */
export function dropHidden(root: Element): number {
  let dropped = 0;
  for (const element of root.querySelectorAll<HTMLElement>("[hidden], [style]")) {
    // Already gone with a hidden ancestor.
    if (!root.contains(element)) continue;
    // Keywords come back lowercased, whatever case the author wrote. A MathML
    // node may have no style at all, as Readability's own check allows for.
    const display = element.style?.display;
    const visibility = element.style?.visibility;
    const hidden =
      (element.hasAttribute("hidden") && element.getAttribute("hidden")?.toLowerCase() !== "until-found") ||
      display === "none" ||
      visibility === "hidden" ||
      visibility === "collapse";
    if (!hidden) continue;
    if (element.textContent?.trim()) dropped++;
    element.remove();
  }
  return dropped;
}

/**
 * HTML to Markdown for the readers that hold a DOM: saved web pages and
 * ebooks. The options and the link rule are the clipper's (`apps/extension/
 * src/article.ts`), copied rather than shared because the extension is not a
 * workspace package. Client-only, like its callers.
 */
export function turndown(base: string): TurndownService {
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
