import { attr, decodeXml, fold, tagsOf, text, unpack } from "./office-charts";

/** The lines of a document's page headers and footers, a paragraph each. */
export interface PageFurniture {
  headers: string[];
  footers: string[];
}

const ODF_REGION = /^style:(header|footer)(?:-left|-first)?$/;
const ODF_PARAGRAPH = new Set(["text:p", "text:h"]);
const ODF_SPACE = new Set(["text:s", "text:tab", "text:line-break"]);

/**
 * Every header and footer an OpenDocument text file prints (C7): the default,
 * first-page and left-page ones of the default master page and of each master
 * page a style names. officeparser reads the first master page's default pair
 * alone, so a cover page's header or an even page's footer was lost. A region
 * the author switched off (`style:display="false"`) is left out, and a field
 * reads as the text the file caches for it.
 */
export function odfPageFurniture(bytes: Uint8Array): PageFurniture {
  const found: PageFurniture = { headers: [], footers: [] };
  const parts = unpack(bytes, (name) => name === "styles.xml" || name === "content.xml");
  const styles = text(parts?.["styles.xml"]);
  if (!styles.includes("style:master-page")) return found;
  const used = new Set<string>();
  for (const xml of [styles, text(parts?.["content.xml"])]) {
    for (const t of tagsOf(xml)) {
      const name = t.opens ? attr(t.tag, "style:master-page-name") : undefined;
      if (name) used.add(decodeXml(name));
    }
  }
  let first = true;
  let taken = false;
  let region: string[] | undefined;
  let line: string | undefined;
  let after = 0;
  for (const t of tagsOf(styles)) {
    if (line !== undefined) line += decodeXml(styles.slice(after, t.from));
    after = t.to;
    if (t.name === "style:master-page" && t.opens) {
      taken = first || used.has(decodeXml(attr(t.tag, "style:name") ?? ""));
      first = false;
    } else if (ODF_REGION.test(t.name)) {
      if (!t.opens) region = undefined;
      else if (!t.closes && taken && attr(t.tag, "style:display") !== "false") {
        region = t.name.startsWith("style:header") ? found.headers : found.footers;
      }
    } else if (region && ODF_PARAGRAPH.has(t.name)) {
      if (t.opens && !t.closes) line ??= "";
      else if (!t.opens && line !== undefined) {
        if (fold(line)) region.push(fold(line));
        line = undefined;
      }
    } else if (line !== undefined && ODF_SPACE.has(t.name) && t.opens) line += " ";
  }
  return found;
}
