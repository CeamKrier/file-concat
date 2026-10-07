import TurndownService from "turndown";

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
