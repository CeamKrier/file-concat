// Which rows of results/pptx.md a real .pptx contains, so the coverage map can be weighted by how
// often each construct occurs. Plain regex over the XML parts: a row counts when its construct is in
// the file, whatever the reader then does with it. Row numbers are the `#` column.
import { createRequire } from "node:module";
const { unzipSync, strFromU8 } = createRequire(new URL("../../../../core/package.json", import.meta.url))("fflate");

const T = /<a:t(?:\s[^>]*)?>\s*[^<\s]/; // a run with visible text
const shapes = (x) => x.match(/<p:sp[\s>][\s\S]*?<\/p:sp>/g) ?? [];
const phType = (s) => {
  const ph = s.match(/<p:ph\b[^>]*>/);
  return ph ? (ph[0].match(/\btype="(\w+)"/)?.[1] ?? "obj") : null;
};
const ph = (...types) => (s) => types.includes(phType(s)) && T.test(s);
const free = (s) => phType(s) === null && T.test(s);
const some = (xmls, f) => xmls.some((x) => shapes(x).some(f));
const cells = (x) => x.match(/<a:tc\b[^>]*>[\s\S]*?<\/a:tc>/g) ?? [];
const runs = (x) => x.match(/<a:r>[\s\S]*?<\/a:r>/g) ?? [];
const rels = (x = "") =>
  Object.fromEntries([...x.matchAll(/<Relationship\b[^>]*>/g)].map(([t]) => [t.match(/\bId="([^"]+)"/)?.[1], { target: t.match(/\bTarget="([^"]+)"/)?.[1] ?? "", ext: /TargetMode="External"/.test(t) }]));
// Every p:grpSp element with its nesting depth (1 = top level) and inner XML.
const groups = (x) => {
  const out = [], stack = [];
  for (const m of x.matchAll(/<(\/?)p:grpSp[\s>]/g)) m[1] ? out.push([stack.length, x.slice(stack.pop(), m.index)]) : stack.push(m.index);
  return out;
};

const ROWS = {
  1: (p) => p.order.some((n, i) => i > 0 && n < p.order[i - 1]),
  2: (p) => some(p.slides, ph("ctrTitle")),
  3: (p) => some(p.slides, ph("subTitle")),
  4: (p) => some(p.slides, ph("title")),
  5: (p) => some(p.slides, (s) => ph("body", "obj")(s) && /<a:pPr\b[^>]*\blvl="[1-8]"/.test(s)),
  6: (p) => some(p.slides, (s) => /txBox="1"/.test(s) && T.test(s)),
  7: (p) => p.slides.some((x) => groups(x).some(([, g]) => T.test(g))),
  8: (p) => p.slides.some((x) => groups(x).some(([d, g]) => d >= 2 && T.test(g))),
  9: (p) => p.slides.some((x) => (x.match(/<p:pic[\s>][\s\S]*?<\/p:pic>/g) ?? []).some((s) => /<p:cNvPr\b[^>]*\bdescr="\s*[^"\s]/.test(s))),
  10: (p) => p.slides.some((x) => runs(x).some((r) => r.includes("<a:hlinkClick") && T.test(r))),
  11: (p) => p.slideNames.some((n, i) => {
    const r = rels(p.parts[n.replace(/([^/]+)$/, "_rels/$1.rels")]);
    return runs(p.slides[i]).some((run) => r[run.match(/<a:hlinkClick\b[^>]*\br:id="([^"]+)"/)?.[1]]?.ext);
  }),
  12: (p) => some(p.slides, (s) => phType(s) === null && /<a:fld\b[^>]*type="slidenum"/.test(s)),
  13: (p) => some(p.slides, (s) => phType(s) === null && /<a:fld\b[^>]*type="datetime\d*"/.test(s)),
  14: (p) => p.slides.some((x) => /<a:tc\b[^>]*gridSpan="(?!1")\d+"/.test(x)),
  15: (p) => p.slides.some((x) => cells(x).some((c) => /^<a:tc\b[^>]*hMerge="(1|true)"/.test(c) && T.test(c))),
  16: (p) => p.slides.some((x) => /<a:tc\b[^>]*rowSpan="(?!1")\d+"/.test(x)),
  17: (p) => p.slides.some((x) => cells(x).some((c) => /^<a:tc\b[^>]*vMerge="(1|true)"/.test(c) && T.test(c))),
  18: (p) => p.slides.some((x) => cells(x).some((c) => !/^<a:tc\b[^>]*(Span|Merge)=/.test(c) && T.test(c))),
  19: (p) => p.charts.some((x) => { const t = x.match(/<c:chart>\s*<c:title>([\s\S]*?)<\/c:title>/); return !!t && t[1].includes("<c:rich>") && T.test(t[1]); }),
  20: (p) => p.charts.some((x) => /<c:ser>\s*<c:idx\b[^>]*\/>\s*<c:order\b[^>]*\/>\s*<c:tx>/.test(x)),
  21: (p) => p.charts.some((x) => /<c:cat>\s*<c:(strRef|strLit|multiLvlStrRef)>/.test(x)),
  22: (p) => p.charts.some((x) => /<c:(val|yVal)>\s*<c:num(Ref|Lit)>/.test(x)),
  23: (p) => p.charts.some((x) => /<c:dLbl>(?:(?!<\/c:dLbl>)[\s\S])*<c:tx>/.test(x)),
  24: (p) => p.charts.some((x) => (x.match(/<c:(cat|val|date|ser)Ax>[\s\S]*?<\/c:\1Ax>/g) ?? []).some((a) => /<c:title>\s*<c:tx>/.test(a))),
  25: (p) => p.diagrams.some((x) => (x.match(/<dgm:t>[\s\S]*?<\/dgm:t>/g) ?? []).some((t) => T.test(t))),
  26: (p) => some(p.slides, (s) => phType(s) === "sldNum"),
  27: (p) => some(p.slides, ph("ftr")),
  28: (p) => some(p.slides, ph("dt")),
  29: (p) => some(p.notes, ph("body")),
  30: (p) => some(p.notes, (s) => phType(s) === "sldNum"),
  31: (p) => some(p.notesMasters, ph("body")),
  32: (p) => some(p.notesMasters, ph("hdr")),
  33: (p) => p.comments.some((x) => /<p:cm\b/.test(x) && /<p:text>\s*[^<\s]/.test(x)),
  34: (p) => ROWS[33](p) && /<p:cmAuthor\b[^>]*\bname="\s*[^"\s]/.test(p.parts["ppt/commentAuthors.xml"] ?? ""),
  35: (p) => p.comments.some((x) => /<p188:cm[\s>]/.test(x) && T.test(x)),
  36: (p) => p.comments.some((x) => /<p188:reply[\s>]/.test(x)),
  37: (p) => ROWS[35](p) && /<p188:author\b[^>]*\bname="\s*[^"\s]/.test(p.parts["ppt/authors.xml"] ?? ""),
  38: (p) => p.slides.some((x) => /<p:sld\b[^>]*\bshow="(0|false)"/.test(x)),
  39: (p) => some(p.layouts, ph("body", "obj")),
  40: (p) => some(p.layouts, ph("ctrTitle", "subTitle")),
  41: (p) => some(p.masters, (s) => phType(s) !== null && T.test(s)),
  42: (p) => some(p.masters, free),
  43: (p) => some(p.layouts, free),
  44: (p) => /<p:custShow\b/.test(p.pres),
  45: (p) => /<p14:section\b[^>]*\bname="\s*[^"\s]/.test(p.pres),
  46: (p) => /<dc:title>\s*[^<\s]/.test(p.parts["docProps/core.xml"] ?? ""),
  47: (p) => /<dc:creator>\s*[^<\s]/.test(p.parts["docProps/core.xml"] ?? ""),
  48: (p) => /<Company>\s*[^<\s]/.test(p.parts["docProps/app.xml"] ?? ""),
};

export const UNDETECTABLE = {};

export default async function detect(bytes) {
  try {
    const raw = unzipSync(bytes, { filter: (f) => /\.(xml|rels)$/.test(f.name) });
    const parts = Object.fromEntries(Object.entries(raw).map(([n, b]) => [n, strFromU8(b)]));
    const of = (re) => Object.keys(parts).filter((n) => re.test(n)).sort();
    const pres = parts["ppt/presentation.xml"] ?? "";
    const presRels = rels(parts["ppt/_rels/presentation.xml.rels"]);
    const order = [...pres.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)].map((m) => +(presRels[m[1]]?.target.match(/(\d+)\.xml$/)?.[1] ?? NaN));
    const slideNames = of(/^ppt\/slides\/slide\d+\.xml$/);
    // Layouts a slide actually uses; an unused layout's prompts never reach a reader.
    const used = new Set(slideNames.flatMap((n) => Object.values(rels(parts[n.replace(/([^/]+)$/, "_rels/$1.rels")])).map((r) => r.target.match(/slideLayout\d+\.xml$/)?.[0]).filter(Boolean)));
    const p = {
      parts, pres, order, slideNames,
      slides: slideNames.map((n) => parts[n]),
      layouts: of(/^ppt\/slideLayouts\/slideLayout\d+\.xml$/).filter((n) => used.has(n.split("/").pop())).map((n) => parts[n]),
      masters: of(/^ppt\/slideMasters\/slideMaster\d+\.xml$/).map((n) => parts[n]),
      notes: of(/^ppt\/notesSlides\/notesSlide\d+\.xml$/).map((n) => parts[n]),
      notesMasters: of(/^ppt\/notesMasters\/notesMaster\d+\.xml$/).map((n) => parts[n]),
      charts: of(/^ppt\/charts\/chart\d+\.xml$/).map((n) => parts[n]),
      diagrams: of(/^ppt\/diagrams\/data\d+\.xml$/).map((n) => parts[n]),
      comments: of(/^ppt\/comments\/[^/]+\.xml$/).map((n) => parts[n]),
    };
    return Object.keys(ROWS).filter((r) => ROWS[r](p)).map(Number);
  } catch {
    return [];
  }
}
