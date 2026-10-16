// Which rows of the EPUB section of results/web-text.md a real .epub contains, so the coverage map can
// be weighted by how often each construct occurs. Plain regex over the OPF and the spine's XHTML; a row
// counts when its construct is in the file, whatever the reader then does with it.
import { createRequire } from "node:module";
const { unzipSync, strFromU8 } = createRequire(new URL("../../../../core/package.json", import.meta.url))("fflate");

const attr = (tag, n) => tag.match(new RegExp(`\\s${n}=["']([^"']*)["']`))?.[1];
const base = (href = "") => decodeURIComponent(href.split(/[?#]/)[0].split("/").pop());
const resolve = (dir, href) => {
  const out = [];
  for (const s of (dir + decodeURIComponent(href.split("#")[0])).split("/")) s === ".." ? out.pop() : s !== "." && out.push(s);
  return out.join("/");
};
const filled = (tag) => new RegExp(`<${tag}\\b[^>]*>\\s*[^<\\s]`);
const imgs = (x) => (x.match(/<img\b[^>]*>/g) ?? []).map((t) => ({ src: base(attr(t, "src")), alt: attr(t, "alt")?.trim() }));
const doc = (p, re) => p.docs.some((x) => re.test(x));

const ROWS = {
  E1: (p) => p.spineIdx.some((n, i) => i > 0 && n < p.spineIdx[i - 1]),
  E2: (p) => p.spine.some((t) => attr(t, "linear") === "no"),
  E3: (p) => p.items.some((i) => /\bnav\b/.test(i.props) && !p.spineIds.has(i.id)),
  E4: (p) => p.items.some((i) => i.type === "application/x-dtbncx+xml"),
  E5: (p) => p.items.some((i) => /html/.test(i.type) && !/\bnav\b/.test(i.props) && !p.spineIds.has(i.id)),
  E6: (p) => !!p.cover && p.docs.some((x) => imgs(x).some((i) => i.src === p.cover && i.alt)),
  E7: (p) => doc(p, /<h[1-6][\s>]/),
  E8: (p) => doc(p, filled("p")),
  E9: (p) => doc(p, /<aside\b[^>]*(epub:type="[^"]*\bfootnote\b|role="doc-footnote")/),
  E10: (p) => doc(p, /<a\b[^>]*(epub:type="[^"]*\bnoteref\b|role="doc-noteref")/),
  // In-chapter: any spine document but the cover page (the first one that shows the cover image).
  E11: (p) => p.docs.some((x, n) => n !== p.coverDoc && imgs(x).some((i) => i.alt)),
  E12: (p) => doc(p, /<title>\s*[^<\s]/),
  E13: (p) => doc(p, /<style[\s>]/),
  E14: (p) => filled("dc:title").test(p.opf),
  E15: (p) => filled("dc:creator").test(p.opf),
  E16: (p) => filled("dc:description").test(p.opf),
};

export const UNDETECTABLE = {};

export default async function detect(bytes) {
  try {
    const raw = unzipSync(bytes, { filter: (f) => /\.(xml|opf|ncx|x?html?)$/i.test(f.name) });
    const parts = Object.fromEntries(Object.entries(raw).map(([n, b]) => [n, strFromU8(b)]));
    const opfPath = parts["META-INF/container.xml"].match(/full-path=["']([^"']+)["']/)[1];
    const opf = parts[opfPath], dir = opfPath.slice(0, opfPath.lastIndexOf("/") + 1);
    const items = (opf.match(/<(?:opf:)?item\s[^>]*>/g) ?? []).map((t) => ({ id: attr(t, "id"), href: attr(t, "href") ?? "", type: attr(t, "media-type") ?? "", props: attr(t, "properties") ?? "" }));
    const spine = opf.match(/<(?:opf:)?itemref\s[^>]*>/g) ?? [];
    const spineIds = spine.map((t) => attr(t, "idref"));
    const coverId = opf.match(/<meta\b[^>]*name=["']cover["'][^>]*>/)?.[0];
    const cover = items.find((i) => /\bcover-image\b/.test(i.props)) ?? items.find((i) => coverId && i.id === attr(coverId, "content"));
    const p = {
      opf, items, spine,
      spineIds: new Set(spineIds),
      spineIdx: spineIds.map((id) => items.findIndex((i) => i.id === id)),
      cover: cover && base(cover.href),
      docs: spineIds.map((id) => parts[resolve(dir, items.find((i) => i.id === id)?.href ?? "")]).filter(Boolean),
    };
    p.coverDoc = p.docs.findIndex((x) => imgs(x).some((i) => i.src === p.cover));
    return Object.keys(ROWS).filter((r) => ROWS[r](p));
  } catch {
    return [];
  }
}
