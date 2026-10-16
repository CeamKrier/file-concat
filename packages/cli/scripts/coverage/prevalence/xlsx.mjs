// Which rows of results/xlsx.md a real .xlsx carries, for weighting the coverage map by
// how often each construct occurs. One regex test per row over the package's XML parts;
// it looks for the construct (element/attribute in its part), never the probe's QZ text.
// `~` in a pattern stands for an optional namespace prefix (the .NET SDK writes `x:c`).
import { createRequire } from "node:module";
import path from "node:path";
const { unzipSync, strFromU8 } = createRequire(new URL("../../../../core/package.json", import.meta.url))("fflate");

const re = (s, f = "") => new RegExp(s.replace(/~/g, "(?:\\w+:)?"), f);
const has = (text, s) => re(s).test(text);
const nonEmpty = (text, tag) => re(`<~${tag}\\b[^>]*>\\s*[^<\\s]`).test(text);

// Number format classes, read from the format code with quoted text, escapes and [..] removed.
const bare = (code) => code.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, "");
const DATE_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
const isPct = (id, code) => id === 9 || id === 10 || bare(code).includes("%");
const isCur = (id, code) => [5, 6, 7, 8, 42, 44].includes(id) || /[$\u00a3\u00a5\u20ac\u20b9\u20ba]/.test(code.replace(/\[\$-[^\]]*\]/g, ""));
const isDate = (id, code) => DATE_IDS.has(id) || (/[dmyhs]/i.test(bare(code).replace(/General/gi, "")));
const isLit = (id, code) => /"[^"]*\p{L}[^"]*"/u.test(code);
const isHid = (id, code) => code.trim() === ";;;";

function load(bytes) {
  const raw = unzipSync(bytes, { filter: (f) => /\.(xml|rels|vml)$/i.test(f.name) });
  const parts = {};
  for (const [k, v] of Object.entries(raw)) parts[k.replace(/\\/g, "/")] = strFromU8(v);
  const list = (rx) => Object.keys(parts).filter((k) => rx.test(k)).map((k) => parts[k]);
  const cat = (rx) => list(rx).join("\n");
  const rels = (src) => {
    const r = parts[path.posix.join(path.posix.dirname(src), "_rels", path.posix.basename(src) + ".rels")] || "";
    return [...r.matchAll(/Target="([^"]+)"/g)].map((m) => (m[1].startsWith("/") ? m[1].slice(1) : path.posix.join(path.posix.dirname(src), m[1])));
  };
  const wbName = ((parts["_rels/.rels"] || "").match(/officeDocument"[^>]*Target="\/?([^"]+)"|Target="\/?([^"]+)"[^>]*officeDocument"/) || []).slice(1).find(Boolean) || "xl/workbook.xml";
  const charts = Object.keys(parts).filter((k) => /\/charts\/chart[^/]*\.xml$/i.test(k));
  const csCharts = new Set(Object.keys(parts).filter((k) => /\/chartsheets\/[^/]+\.xml$/i.test(k)).flatMap(rels).flatMap(rels));
  const p = {
    wb: parts[wbName] || "",
    ws: cat(/\/worksheets\/[^/]+\.xml$/i),
    cs: cat(/\/chartsheets\/[^/]+\.xml$/i),
    sst: cat(/sharedStrings[^/]*\.xml$/i),
    sty: cat(/^xl\/styles\.xml$/i),
    cms: list(/\/comments[^/]*\.xml$/i),
    tc: cat(/threadedComments\/[^/]+\.xml$/i),
    per: cat(/\/persons\/[^/]+\.xml$/i),
    dr: cat(/\/drawings\/[^/]+\.xml$/i),
    ch: charts.map((k) => parts[k]).join("\n"),
    chEmb: charts.filter((k) => !csCharts.has(k)).map((k) => parts[k]).join("\n"),
    chCs: charts.filter((k) => csCharts.has(k)).map((k) => parts[k]).join("\n"),
    tb: cat(/\/tables\/[^/]+\.xml$/i),
    pt: cat(/\/pivotTables\/[^/]+\.xml$/i),
    pc: cat(/\/pivotCache\/pivotCacheDefinition[^/]*\.xml$/i),
    el: cat(/\/externalLinks\/[^/]+\.xml$/i),
    elr: cat(/\/externalLinks\/_rels\/[^/]+\.rels$/i),
    core: parts["docProps/core.xml"] || "",
    app: parts["docProps/app.xml"] || "",
  };
  p.cells = cellKinds(p.ws, p.sty);
  return p;
}

// Every valued cell reduced to {type, has formula, number format}, deduplicated.
function cellKinds(ws, sty) {
  const fmts = {};
  for (const m of sty.matchAll(re('<~numFmt\\b[^>]*numFmtId="(\\d+)"[^>]*formatCode="([^"]*)"', "g")))
    fmts[m[1]] = m[2].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const xfs = ((sty.match(re("<~cellXfs\\b[^]*?</~cellXfs>")) || [""])[0].match(re("<~xf\\b[^>]*>", "g")) || []).map((x) => +((x.match(/numFmtId="(\d+)"/) || [0, 0])[1]));
  const seen = new Map();
  for (const m of ws.matchAll(re("<~c\\b([^>]*?)(?:/>|>([^]*?)</~c>)", "g"))) {
    if (!m[2] || !re("<~(v|is)\\b").test(m[2])) continue;
    const t = (m[1].match(/\bt="(\w+)"/) || [0, "n"])[1];
    const s = +((m[1].match(/\bs="(\d+)"/) || [0, 0])[1]);
    const f = re("<~f\\b").test(m[2]);
    const key = `${t}|${s}|${f}`;
    if (!seen.has(key)) {
      const id = xfs[s] ?? 0;
      seen.set(key, { t, f, id, code: fmts[id] ?? "" });
    }
  }
  return [...seen.values()];
}
const num = (p, test) => p.cells.some((c) => c.t === "n" && test(c.id, c.code));

function legacyComments(cms) {
  return cms.flatMap((x) => {
    const authors = [...x.matchAll(re("<~author>([^<]*)</~author>", "g"))].map((m) => m[1]);
    return [...x.matchAll(re('<~comment\\b[^>]*authorId="(\\d+)"', "g"))].map((m) => authors[+m[1]] ?? "").filter((a) => !a.startsWith("tc="));
  });
}

const hiddenRows = (ws) => ws.match(re('<~row\\b[^>]*\\bhidden="(?:1|true)"[^>]*>', "g")) || [];
const outlined = (r) => /outlineLevel="[1-9]/.test(r);
const hf = (x, kind) => re(`<~(odd|even|first)${kind}>\\s*[^<\\s]`).test(x);
const ROW_TITLE = "<~chart>\\s*<~title>(?:(?!</~title>)[^])*?<~tx>";

export const ROWS = {
  1: (p) => p.ws !== "" && has(p.wb, '<~sheet\\b(?![^>]*state="(?:hidden|veryHidden)")'),
  2: (p) => p.cells.some((c) => c.t === "s"),
  3: (p) => p.cells.some((c) => c.t === "inlineStr"),
  4: (p) => p.cells.some((c) => c.t === "str"),
  5: (p) => p.cells.some((c) => c.f),
  6: (p) => has(p.sst, "<~si>(?:(?!</~si>)[^])*?<~r>"),
  7: (p) => has(p.sst, "<~rPh\\b"),
  8: (p) => has(p.sst, "<~rPh\\b[^>]*>\\s*<~t\\b[^>]*>[^<]"),
  9: (p) => num(p, isPct),
  10: (p) => num(p, isCur),
  11: (p) => num(p, isDate),
  12: (p) => num(p, isLit),
  13: (p) => num(p, isHid),
  14: (p) => p.cells.some((c) => ["s", "str", "inlineStr"].includes(c.t) && isHid(c.id, c.code)),
  15: (p) => p.cells.some((c) => c.t === "n" && c.f),
  16: (p) => p.cells.some((c) => c.t === "e"),
  17: (p) => p.cells.some((c) => c.t === "b"),
  18: (p) => has(p.ws, "<~mergeCell\\b"),
  19: (p) => has(p.ws, '<~col\\b[^>]*\\bhidden="(?:1|true)"'),
  20: (p) => hiddenRows(p.ws).some((r) => !outlined(r)),
  21: (p) => hiddenRows(p.ws).some(outlined),
  22: (p) => has(p.wb, '<~sheet\\b[^>]*state="hidden"'),
  23: (p) => has(p.wb, '<~sheet\\b[^>]*state="veryHidden"'),
  24: (p) => hf(p.ws + p.cs, "Header"),
  25: (p) => hf(p.ws + p.cs, "Footer"),
  26: (p) => legacyComments(p.cms).length > 0,
  27: (p) => legacyComments(p.cms).some((a) => a.trim() !== ""),
  28: (p) => has(p.tc, "<~threadedComment\\b"),
  29: (p) => has(p.per, '<~person\\b[^>]*displayName="[^"]'),
  30: (p) => has(p.ws, '<~dataValidation\\b[^>]*\\bprompt(?:Title)?="[^"]'),
  31: (p) => has(p.ws, '<~dataValidation\\b[^>]*\\berror(?:Title)?="[^"]'),
  32: (p) => has(p.ws, '<~dataValidation\\b[^>]*type="list"[^>]*>\\s*<~formula1>\\s*(?:<~f>)?"'),
  33: (p) => has(p.ws, "<~hyperlink\\b"),
  34: (p) => has(p.ws, '<~hyperlink\\b[^>]*\\b\\w+:id="'),
  35: (p) => has(p.ws, '<~hyperlink\\b[^>]*\\btooltip="[^"]'),
  36: (p) => has(p.wb, '<~definedName\\b[^>]*name="(?!_xlnm\\.)'),
  37: (p) => has(p.tb, '<~table\\b(?![^>]*headerRowCount="0")'),
  38: (p) => has(p.tb, "<~table\\b"),
  39: (p) => has(p.tb, '<~tableColumn\\b[^>]*totalsRowLabel="[^"]'),
  40: (p) => has(p.tb, "<~table\\b"),
  41: (p) => has(p.dr, "<~txBody\\b(?:(?!</~txBody>)[^])*?<~t>[^<]"),
  42: (p) => has(p.dr, '<~cNvPr\\b[^>]*\\bdescr="[^"]'),
  43: (p) => has(p.chEmb, ROW_TITLE),
  44: (p) => has(p.ch, "<~ser>(?:(?!</~ser>)[^])*?<~tx>(?:(?!</~tx>)[^])*?<~v>"),
  45: (p) => has(p.ch, "<~cat>(?:(?!</~cat>)[^])*?<~(?:multiLvl)?strCache>(?:(?!</~(?:multiLvl)?strCache>)[^])*?<~pt\\b"),
  46: (p) => has(p.ch, "<~numCache>(?:(?!</~numCache>)[^])*?<~pt\\b"),
  47: (p) => has(p.ch, "<~(cat|val|date|ser)Ax>(?:(?!</~\\1Ax>)[^])*?<~title>"),
  48: (p) => p.cs !== "",
  49: (p) => has(p.chCs, ROW_TITLE),
  50: (p) => has(p.pt, "<~pivotTableDefinition\\b"),
  51: (p) => has(p.pt, '<~pivotTableDefinition\\b[^>]*grandTotalCaption="[^"]'),
  52: (p) => has(p.pt, '<~item\\b[^>]*\\bm="(?:1|true)"'),
  53: (p) => has(p.pc, '<~cacheField\\b[^>]*name="[^"]'),
  54: (p) => has(p.pt, '<~pivotTableDefinition\\b[^>]*name="[^"]'),
  55: (p) => has(p.pc, '<~pivotCacheDefinition\\b[^>]*refreshedBy="[^"]'),
  56: (p) => has(p.ws, "<~f\\b[^>]*>[^<]*\\[\\d+\\][^<]*</~f>\\s*<~v>"),
  // ponytail: any cached cell counts; telling an unused one apart needs formula-to-cache matching
  57: (p) => has(p.el, "<~sheetDataSet>(?:(?!</~sheetDataSet>)[^])*?<~cell\\b"),
  58: (p) => has(p.el, "<~externalBook\\b") && /externalLinkPath/.test(p.elr),
  59: (p) => has(p.sst + p.ws, "<~t\\b[^>]*>[^<]*(?:,|&quot;|\"|\\n|&#10;)") || has(p.ws, '<~c\\b[^>]*t="str"[^>]*>(?:(?!</~c>)[^])*?<~v>[^<]*(?:,|"|&quot;|\\n)'),
  // ponytail: "very long" taken as over 1,024 chars (what an Excel cell displays); the probe holds 31,881
  60: (p) => has(p.sst + p.ws, "<~t\\b[^>]*>[^<]{1025}"),
  61: (p) => has(p.ws, '<~dimension\\b[^>]*ref="(?!A1(?::|"))'),
  62: (p) => nonEmpty(p.core, "title"),
  63: (p) => ["creator", "subject", "keywords", "description"].some((t) => nonEmpty(p.core, t)) || nonEmpty(p.app, "Company"),
};

export const UNDETECTABLE = {};

export default async function detect(bytes) {
  try {
    const p = load(bytes);
    return Object.keys(ROWS).filter((k) => ROWS[k](p)).map(Number);
  } catch {
    return [];
  }
}
