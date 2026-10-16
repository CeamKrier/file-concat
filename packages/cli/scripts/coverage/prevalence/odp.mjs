// Which rows of the ODP section of results/odf.md a real .odp contains, so the coverage map can be
// weighted by how often each construct occurs. Plain regex over content.xml, styles.xml, meta.xml and
// embedded chart objects; a row counts when its construct is in the file, whatever the reader does.
import { createRequire } from "node:module";
const { unzipSync, strFromU8 } = createRequire(new URL("../../../../core/package.json", import.meta.url))("fflate");

const T = /<text:(?:p|h|span|a)\b[^>]*(?<!\/)>\s*[^<\s]/; // a paragraph or span with visible text
const all = (x, re) => x.match(re) ?? [];
const frames = (x) => all(x, /<draw:frame\b[\s\S]*?<\/draw:frame>/g);
const cls = (f) => f.match(/^<draw:frame\b[^>]*presentation:class="([^"]+)"/)?.[1] ?? null;
const notesOf = (x) => all(x, /<presentation:notes\b[\s\S]*?<\/presentation:notes>/g);
const noNotes = (x) => x.replace(/<presentation:notes\b[\s\S]*?<\/presentation:notes>/g, "");
const anyFrame = (xs, f) => xs.some((x) => frames(x).some(f));
const filled = (c) => (f) => cls(f) === c && !/^<draw:frame\b[^>]*presentation:placeholder="true"/.test(f) && T.test(f);
const stripAxes = (x) => x.replace(/<chart:axis\b[^>]*[^/]>[\s\S]*?<\/chart:axis>/g, "");

const ROWS = {
  P1: (p) => /<dc:title>\s*[^<\s]/.test(p.meta),
  // LibreOffice stores an unnamed slide as "pageN"; anything else was set by the author.
  P2: (p) => p.pages.some((x) => { const n = x.match(/^<draw:page\b[^>]*draw:name="([^"]*)"/)?.[1]; return !!n?.trim() && !/^(page|slide)\s*\d+$/i.test(n); }),
  P3: (p) => anyFrame(p.bodies, filled("title")),
  P4: (p) => anyFrame(p.bodies, filled("subtitle")),
  P5: (p) => anyFrame(p.bodies, filled("outline")),
  P6: (p) => anyFrame(p.bodies, (f) => filled("outline")(f) && /<text:list-item>(?:(?!<\/text:list-item>)[\s\S])*?<text:list[\s>]/.test(f)),
  P7: (p) => anyFrame(p.bodies, (f) => cls(f) === null && f.includes("<draw:text-box") && T.test(f)),
  P8: (p) => p.bodies.some((x) => all(x, /<draw:custom-shape\b[\s\S]*?<\/draw:custom-shape>/g).some((s) => T.test(s))),
  P9: (p) => p.bodies.some((x) => all(x, /<draw:g\b[\s\S]*?<\/draw:g>/g).some((g) => T.test(g))),
  P10: (p) => p.bodies.some((x) => all(x, /<table:table\b[\s\S]*?<\/table:table>/g).some((t) => T.test(t))),
  P11: (p) => p.pages.some((x) => notesOf(x).some((n) => frames(n).some(filled("notes")))),
  P12: (p) => p.hidden.length > 0,
  P13: (p) => p.hidden.some((x) => notesOf(x).some((n) => frames(n).some(filled("notes")))),
  P14: (p) => anyFrame(p.masters.map(noNotes), (f) => cls(f) === "title" && T.test(f)),
  P15: (p) => p.masters.map(noNotes).some((x) => frames(x).some((f) => cls(f) === null && T.test(f)) || all(x, /<draw:custom-shape\b[\s\S]*?<\/draw:custom-shape>/g).some((s) => T.test(s))),
  P16: (p) => /<presentation:footer-decl\b[^>]*>\s*[^<\s]/.test(p.content),
  P17: (p) => p.masters.some((x) => notesOf(x).some((n) => frames(n).some((f) => cls(f) === "notes" && T.test(f)))),
  P18: (p) => p.charts.some((x) => all(stripAxes(x), /<chart:title\b[\s\S]*?<\/chart:title>/g).some((t) => T.test(t))),
  P19: (p) => p.charts.some((x) => all(x, /<chart:subtitle\b[\s\S]*?<\/chart:subtitle>/g).some((t) => T.test(t))),
  P20: (p) => p.charts.some((x) => all(x, /<chart:axis\b[^>]*[^/]>[\s\S]*?<\/chart:axis>/g).some((a) => /<chart:title\b[\s\S]*?<text:p\b[^>]*(?<!\/)>\s*[^<\s]/.test(a))),
  P21: (p) => p.charts.some((x) => all(x, /<table:table\b[^>]*table:name="local-table"[\s\S]*?<\/table:table>/g).some((t) => /office:value-type="string"/.test(t) && T.test(t))),
  P22: (p) => anyFrame(p.bodies, (f) => p.chartHrefs.has(f.match(/<draw:object\b[^>]*xlink:href="(?:\.\/)?([^"]+)"/)?.[1]) && /<svg:title>\s*[^<\s]/.test(f)),
  P23: (p) => anyFrame(p.bodies, (f) => f.includes("<draw:image") && !f.includes("<draw:object") && /<svg:title>\s*[^<\s]/.test(f)),
  P24: (p) => anyFrame(p.bodies, (f) => f.includes("<draw:image") && !f.includes("<draw:object") && /<svg:desc>\s*[^<\s]/.test(f)),
  P25: (p) => p.annotations.some((a) => T.test(a)),
  P26: (p) => p.annotations.some((a) => /<dc:creator>\s*[^<\s]/.test(a)),
};

export const UNDETECTABLE = {};

export default async function detect(bytes) {
  try {
    const raw = unzipSync(bytes, { filter: (f) => /\.xml$/.test(f.name) });
    const parts = Object.fromEntries(Object.entries(raw).map(([n, b]) => [n, strFromU8(b)]));
    const content = parts["content.xml"] ?? "", styles = parts["styles.xml"] ?? "";
    const pages = all(content, /<draw:page[\s>][\s\S]*?<\/draw:page>/g);
    const hiddenStyles = new Set([...(content + styles).matchAll(/<style:style\b[^>]*style:name="([^"]+)"[^>]*>(?:(?!<\/style:style>)[\s\S])*?presentation:visibility="hidden"/g)].map((m) => m[1]));
    const chartNames = Object.keys(parts).filter((n) => n !== "content.xml" && n.endsWith("/content.xml") && parts[n].includes("<office:chart"));
    const p = {
      meta: parts["meta.xml"] ?? "", content, pages,
      bodies: pages.map(noNotes),
      hidden: pages.filter((x) => hiddenStyles.has(x.match(/^<draw:page\b[^>]*draw:style-name="([^"]+)"/)?.[1])),
      masters: all(styles, /<style:master-page\b[\s\S]*?<\/style:master-page>/g),
      charts: chartNames.map((n) => parts[n]),
      chartHrefs: new Set(chartNames.map((n) => n.slice(0, -"/content.xml".length))),
      annotations: pages.flatMap((x) => all(noNotes(x), /<office:annotation\b[\s\S]*?<\/office:annotation>/g)),
    };
    return Object.keys(ROWS).filter((r) => ROWS[r](p));
  } catch {
    return [];
  }
}
