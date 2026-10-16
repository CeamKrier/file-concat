// Which rows of the "## ODT" section of results/odf.md occur in a real .odt.
// Used to weight the map's rows by how often a construct shows up in real files,
// so a missing construct nobody writes counts less than one in every document.
// Each detector is a cheap regex over content.xml, styles.xml or meta.xml; the
// probe's QZ marker text is never looked at. Rows are returned as "T1".."T64",
// the row ids of the map. Run through ./run.mjs.
import { createRequire } from "node:module";
const { unzipSync } = createRequire(new URL("../../../../core/package.json", import.meta.url))("fflate");

// Rows that cannot be told from the file. Empty: every ODT row names markup.
export const UNDETECTABLE = {};

const dec = new TextDecoder();
const nonEmpty = (tag) => new RegExp(`<${tag}>\\s*[^<\\s]`);
const textOf = (xml) => xml.replace(/<[^>]+>/g, "").trim();

const depth2 = (re, s) => {
  let d = 0;
  for (const m of s.matchAll(re)) if ((d += m[0][1] === "/" ? -1 : 1) >= 2) return true;
  return false;
};

// Level-1 kind ("bullet" | "number") of each list style, from both parts.
// ponytail: a list without its own style-name (inherits from the outer list) is
// classified by the outer list only; outline numbering on headings is ignored.
function listKinds(C, St) {
  const kind = {};
  for (const m of (C + St).matchAll(/<text:list-style\s[^>]*style:name="([^"]+)"[^>]*>([\s\S]*?)<\/text:list-style>/g)) {
    const l1 = /<text:list-level-style-(bullet|number|image)\s(?=[^>]*text:level="1")[^>]*>/.exec(m[2]);
    if (l1) kind[m[1]] = l1[1] === "number" && /style:num-format="[^"]/.test(l1[0]) ? "number" : l1[1] === "number" ? "" : "bullet";
  }
  // a style not defined in the file falls back to LibreOffice's built-in names
  const builtin = (n) => (/^Numbering_20_/.test(n) ? "number" : /^List_20_\d/.test(n) ? "bullet" : undefined);
  return [...C.matchAll(/<text:list\s[^>]*text:style-name="([^"]+)"/g)].map((m) => kind[m[1]] ?? builtin(m[1]));
}

// A master-page region with text, unless switched off with style:display="false".
const region = (tag) => (P) =>
  [...P.St.matchAll(new RegExp(`<style:${tag}(\\s[^>]*)?>([\\s\\S]*?)</style:${tag}>`, "g"))].some(
    (m) => !/style:display="false"/.test(m[1] ?? "") && textOf(m[2]) !== "",
  );

const ROWS = {
  T1: (P) => nonEmpty("dc:title").test(P.M),
  T2: (P) => nonEmpty("dc:subject").test(P.M),
  T3: (P) => nonEmpty("dc:description").test(P.M),
  T4: (P) => nonEmpty("meta:keyword").test(P.M),
  T5: (P) => nonEmpty("meta:initial-creator").test(P.M),
  T6: (P) => /<text:h(?:\s(?![^>]*text:outline-level)[^>]*)?>|<text:h\s[^>]*text:outline-level="1"/.test(P.C),
  T7: (P) => /<text:h\s[^>]*text:outline-level="2"/.test(P.C),
  T8: (P) => /<text:p[\s>]/.test(P.C),
  // a letter on both sides of a span edge, also where two spans meet
  T9: (P) => /[\p{L}\p{N}]<text:span[\s>]|<\/text:span>[\p{L}\p{N}]|[\p{L}\p{N}]<\/text:span><text:span[^>]*>[\p{L}\p{N}]/u.test(P.C),
  T10: (P) => /<text:line-break\s*\/>/.test(P.C),
  T11: (P) => /<text:tab[\s/]/.test(P.C),
  T12: (P) => /<text:s\s[^>]*text:c="/.test(P.C),
  T13: (P) => /<text:bookmark(?:-start)?\s/.test(P.C),
  T14: (P) => /<text:list-header[\s>]/.test(P.C),
  T15: (P) => /<text:number>/.test(P.C) || P.lists.includes("number"),
  T16: (P) => /<text:list-item[\s>]/.test(P.C),
  T17: (P) => /<text:list-item[\s>](?:(?!<\/text:list-item>)[\s\S])*?<text:list[\s>]/.test(P.C),
  T18: (P) => P.lists.includes("bullet"),
  T19: (P) => /<text:a\s/.test(P.C),
  T20: (P) => /<text:a\s[^>]*xlink:href="[^"]/.test(P.C),
  T21: (P) => /<text:a\s[^>]*office:title="[^"]/.test(P.C),
  T22: (P) => /<text:note-citation\s[^>]*text:label="[^"]/.test(P.C),
  T23: (P) => /text:note-class="footnote"/.test(P.C),
  T24: (P) => /text:note-class="endnote"/.test(P.C),
  T25: (P) => /<office:annotation[\s>]/.test(P.C),
  T26: (P) => /<office:annotation[\s>](?:(?!<\/office:annotation>)[\s\S])*?<dc:creator>\s*[^<\s]/.test(P.C),
  T27: (P) => /<office:annotation-end\s/.test(P.C),
  T28: (P) => /<text:insertion>/.test(P.C),
  T29: (P) => /<text:deletion>/.test(P.C),
  T30: (P) => /<office:change-info>\s*<dc:creator>\s*[^<\s]/.test(P.C),
  T31: (P) => /<text:section\s/.test(P.C),
  T32: (P) => /<text:section\s[^>]*text:display="none"/.test(P.C),
  T33: (P) => /<text:hidden-text\s[^>]*text:is-hidden="true"/.test(P.C),
  T34: (P) => /<text:hidden-paragraph\s[^>]*text:is-hidden="true"/.test(P.C),
  T35: (P) => /<text:conditional-text\s/.test(P.C),
  T36: (P) => /<text:conditional-text\s/.test(P.C),
  T37: (P) => /<text:page-number[\s>/]/.test(P.C),
  T38: (P) => /<text:date[\s>/]/.test(P.C),
  T39: (P) => /<text:title[\s>/]/.test(P.C),
  T40: (P) => /<text:sequence[\s>/]/.test(P.C),
  T41: (P) => /<text:variable-set\s(?![^>]*text:display="none")/.test(P.C),
  T42: (P) => /<text:variable-set\s[^>]*text:display="none"/.test(P.C),
  T43: (P) => /<text:ruby[\s>]/.test(P.C),
  T44: (P) => /<text:ruby-text[\s>]/.test(P.C),
  T45: (P) => /<table:table\s[^>]*table:name="/.test(P.C),
  T46: (P) => /<table:title>/.test(P.C),
  T47: (P) => /<table:desc>/.test(P.C),
  T48: (P) => /<table:table-header-rows>/.test(P.C),
  T49: (P) => /table:number-columns-spanned="(?!1")/.test(P.C),
  T50: (P) => /<table:covered-table-cell(?:\s[^>]*[^/])?>\s*<text:[ph][\s>]/.test(P.C),
  T51: (P) => depth2(/<\/?table:table[\s>]/g, P.C),
  T52: (P) => [...P.C.matchAll(/<table:table-cell[^>]*[^/]>([\s\S]*?)<\/table:table-cell>/g)].some((m) => (m[1].match(/<text:[ph][\s>/]/g) ?? []).length >= 2),
  T53: (P) => /<draw:text-box[\s>]/.test(P.C),
  T54: (P) => P.images.some((s) => nonEmpty("svg:title").test(s)),
  T55: (P) => P.images.some((s) => nonEmpty("svg:desc").test(s)),
  T56: (P) => P.images.some((s) => /<draw:image[^>]*[^/]>\s*<text:p[^>]*>\s*[^<\s]/.test(s)),
  T57: region("header"),
  T58: region("header-first"),
  T59: region("footer"),
  T60: region("footer-left"),
  T61: (P) => /<text:index-title[\s>]/.test(P.toc),
  T62: (P) => /<text:index-body>[\s\S]*?<text:p[\s>]/.test(P.toc),
  T63: (P) => /<text:index-title-template[\s>]/.test(P.toc),
  T64: (P) => /<form:text\s[^>]*form:(?:current-)?value="[^"]/.test(P.C),
};

export default async function detect(bytes) {
  try {
    const z = unzipSync(bytes, { filter: (f) => /^(content|styles|meta)\.xml$/.test(f.name) });
    const [C, St, M] = ["content.xml", "styles.xml", "meta.xml"].map((n) => (z[n] ? dec.decode(z[n]) : ""));
    const P = {
      C, St, M,
      lists: listKinds(C, St),
      // from each draw:image to the end of its frame, where svg:title/desc sit
      images: C.match(/<draw:image[\s\S]*?<\/draw:frame>/g) ?? [],
      // TOC rows only; other index types (bibliography, ...) carry the same elements
      toc: (C.match(/<text:table-of-content[\s>][\s\S]*?<\/text:table-of-content>/g) ?? []).join(""),
    };
    return Object.keys(ROWS).filter((r) => ROWS[r](P));
  } catch {
    return [];
  }
}
