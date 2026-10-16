// Which rows of results/docx.md (the DOCX coverage map) occur in a real .docx.
// Used to weight the map's rows by how often a construct shows up in real files,
// so a missing construct nobody writes counts less than one in every document.
// Each detector is a cheap regex over the XML part the row names; the probe's
// QZ marker text is never looked at. Run through ./run.mjs.
import { createRequire } from "node:module";
const { unzipSync } = createRequire(new URL("../../../../core/package.json", import.meta.url))("fflate");

// Rows that cannot be told from the file. Empty: every docx row names markup.
export const UNDETECTABLE = {};

const dec = new TextDecoder();
const nonEmpty = (tag) => new RegExp(`<${tag}>\\s*[^<\\s]`);
// field instruction, complex (instrText) or simple (w:instr)
const instr = (name) => new RegExp(`(?:<w:instrText[^>]*>|w:instr=")\\s*${name}\\b`);

function load(bytes) {
  const z = unzipSync(bytes, { filter: (f) => /\.(xml|rels)$/.test(f.name) });
  const x = Object.fromEntries(Object.entries(z).map(([n, b]) => [n, dec.decode(b)]));
  const mainPath = /Target="\/?([^"]+)"[^>]*Type="[^"]*\/officeDocument"|Type="[^"]*\/officeDocument"[^>]*Target="\/?([^"]+)"/.exec(x["_rels/.rels"] ?? "");
  const main = (mainPath && (mainPath[1] || mainPath[2])) || "word/document.xml";
  const dir = main.replace(/[^/]+$/, "");
  const rels = {};
  for (const m of (x[`${dir}_rels/${main.slice(dir.length)}.rels`] ?? "").matchAll(/<Relationship\s[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1];
    const target = /Target="([^"]+)"/.exec(m[0])?.[1] ?? "";
    rels[id] = target.startsWith("/") ? target.slice(1) : dir + target;
  }
  const D = x[main] ?? "";
  const part = (re) => Object.keys(x).filter((n) => re.test(n)).map((n) => x[n]).join("\n");
  const hf = part(/^word\/(header|footer)\d*\.xml$/);
  const notes = part(/^word\/(foot|end)notes\.xml$/);
  const S = D + hf + notes; // every story the reader prints
  return {
    x, D, S, rels, notes,
    style: Object.fromEntries([...(x["word/styles.xml"] ?? "").matchAll(/<w:style\s[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g)].map((m) => [m[1], m[2]])),
    numbering: x["word/numbering.xml"] ?? "",
    settings: x["word/settings.xml"] ?? "",
    comments: part(/^word\/comments\.xml$/),
    glossary: part(/^word\/glossary\/document\.xml$/),
    charts: part(/^word\/charts\/chart\d*\.xml$/),
    dgmData: part(/^word\/diagrams\/data\d*\.xml$/),
    core: x["docProps/core.xml"] ?? "",
    app: x["docProps/app.xml"] ?? "",
    custom: x["docProps/custom.xml"] ?? "",
  };
}

const pStyle = (pPr) => /<w:pStyle w:val="([^"]+)"/.exec(pPr)?.[1];
// First match of `re` in a paragraph style or a style it is basedOn.
function fromStyle(P, id, re) {
  for (let i = 0; id && i < 10; i++, id = /<w:basedOn w:val="([^"]+)"/.exec(P.style[id] ?? "")?.[1]) {
    const m = re.exec(P.style[id] ?? "");
    if (m) return m;
  }
}

// Numbering levels actually used by a paragraph: [{ ilvl, fmt, text }].
// ponytail: lvlOverride is ignored; a style's numPr without ilvl counts as level 0.
function usedLevels(P) {
  const abs = {};
  for (const m of P.numbering.matchAll(/<w:abstractNum\s[^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g)) {
    abs[m[1]] = {};
    for (const l of m[2].matchAll(/<w:lvl\s[^>]*w:ilvl="(\d)"[^>]*>([\s\S]*?)<\/w:lvl>/g))
      abs[m[1]][l[1]] = { fmt: /<w:numFmt w:val="([^"]*)"/.exec(l[2])?.[1] ?? "decimal", text: /<w:lvlText w:val="([^"]*)"/.exec(l[2])?.[1] ?? "" };
  }
  const num = {};
  for (const m of P.numbering.matchAll(/<w:num\s[^>]*w:numId="(\d+)"[^>]*>[\s\S]*?<w:abstractNumId w:val="(\d+)"/g)) num[m[1]] = abs[m[2]];
  const out = [];
  for (const [, pPr] of P.pPrs) {
    const id = /<w:numId w:val="(\d+)"/.exec(pPr)?.[1];
    const ilvl = /<w:ilvl w:val="(\d)"/.exec(pPr)?.[1];
    const sp = fromStyle(P, pStyle(pPr), /<w:numPr>([\s\S]*?)<\/w:numPr>/)?.[1];
    const st = sp && [/<w:numId w:val="(\d+)"/.exec(sp)?.[1], /<w:ilvl w:val="(\d)"/.exec(sp)?.[1] ?? "0"];
    const [n, l] = id ? [id, ilvl ?? st?.[1] ?? "0"] : st ?? [];
    const lvl = n && n !== "0" && num[n]?.[l];
    if (lvl) out.push({ ilvl: +l, ...lvl });
  }
  return out;
}

const NUMBERED = (v) => v.fmt !== "bullet" && v.fmt !== "none";

// Header/footer of a type, referenced from a sectPr, whose part holds text.
const hfRef = (kind, type, extra = () => true) => (P) =>
  extra(P) &&
  [...P.D.matchAll(new RegExp(`<w:${kind}Reference\\s[^>]*>`, "g"))].some(
    (m) => m[0].includes(`w:type="${type}"`) && /<w:t(?:\s[^>]*)?>[^<]*[^<\s]/.test(P.x[P.rels[/r:id="([^"]+)"/.exec(m[0])?.[1]]] ?? ""),
  );
const on = (tag) => (s) => new RegExp(`<w:${tag}(?:/>| w:val="(?:1|true|on)")`).test(s);

// One pass over the content controls: sdtPr text and the first child of sdtContent.
const sdts = (P) =>
  (P._sdts ??= [...P.S.matchAll(/<w:sdt>\s*<w:sdtPr>([\s\S]*?)<\/w:sdtPr>(?:\s*<w:sdtEndPr\s*\/>|\s*<w:sdtEndPr>[\s\S]*?<\/w:sdtEndPr>)?\s*<w:sdtContent>\s*<(\w+:\w+)/g)].map((m) => ({ pr: m[1], kid: m[2] })));
const blockSdt = (s) => s.kid === "w:p" || s.kid === "w:tbl";
const named = (s) => /<w:(alias|tag)\s/.test(s.pr);

// Each drawing: graphicData kind and its docPr attributes.
const drawings = (P) =>
  (P._dr ??= [...P.S.matchAll(/<wp:(inline|anchor)\b[\s\S]*?<\/wp:\1>/g)].map((m) => ({
    uri: /<a:graphicData uri="[^"]*\/(\w+)"/.exec(m[0])?.[1] ?? "",
    docPr: /<wp:docPr\s[^>]*>/.exec(m[0])?.[0] ?? "",
  })));
const alt = (kind, attr) => (P) => drawings(P).some((d) => d.uri === kind && new RegExp(`\\s${attr}="[^"]*[^"\\s]`).test(d.docPr));

const depth2 = (re) => (s) => {
  let d = 0;
  for (const m of s.matchAll(re)) if ((d += m[0][1] === "/" ? -1 : 1) >= 2) return true;
  return false;
};

const outside = (s, re) => s.replace(re, "");

const ROWS = {
  1: (P) => /<w:t[\s>]/.test(P.D),
  2: (P) => P.pPrs.some(([, p]) => /<w:outlineLvl w:val="[0-8]"/.test(p) || fromStyle(P, pStyle(p), /<w:name w:val="heading \d"|<w:outlineLvl w:val="[0-8]"/i)),
  3: (P) => /<w:tab\/>/.test(P.S),
  4: (P) => /<w:br(?![^>]*w:type="(?:page|column)")[^>]*\/>/.test(P.S),
  5: (P) => /<w:cr\/>/.test(P.S),
  6: (P) => /<w:sym\s/.test(P.S),
  7: (P) => /<w:noBreakHyphen\/>/.test(P.S),
  8: (P) => /<w:softHyphen\/>/.test(P.S),
  9: (P) => /<w:ptab\s/.test(P.S),
  10: (P) => /<w:tbl>/.test(P.S),
  11: (P) => /<w:gridSpan w:val="(?!1")/.test(P.S),
  12: (P) => /<w:vMerge w:val="restart"/.test(P.S),
  13: (P) => depth2(/<\/?w:tbl>/g)(P.S),
  14: (P) => /<w:tblCaption w:val="[^"]/.test(P.S),
  15: (P) => /<w:tblDescription w:val="[^"]/.test(P.S),
  16: (P) => sdts(P).some((s) => s.kid === "w:tc"),
  17: (P) => sdts(P).some((s) => s.kid === "w:tr"),
  18: (P) => P.lv.some((v) => v.ilvl === 0 && v.fmt === "decimal" && v.text === "%1."),
  19: (P) => P.lv.some((v) => v.ilvl === 1 && v.fmt === "lowerLetter"),
  20: (P) => P.lv.some((v) => v.ilvl === 2 && v.fmt === "lowerRoman"),
  21: (P) => P.lv.some((v) => v.fmt === "bullet"),
  22: (P) => P.lv.some((v) => NUMBERED(v) && /\p{L}/u.test(v.text.replace(/%\d/g, ""))),
  23: (P) => P.lv.some((v) => NUMBERED(v) && /%\d[^%]*%\d/.test(v.text)),
  24: hfRef("header", "default"),
  25: hfRef("header", "first", (P) => on("titlePg")(P.D)),
  26: hfRef("header", "even", (P) => on("evenAndOddHeaders")(P.settings)),
  27: hfRef("footer", "default"),
  28: hfRef("footer", "first", (P) => on("titlePg")(P.D)),
  29: (P) => /<w:footnoteReference\s/.test(P.D),
  30: (P) => /<w:endnoteReference\s/.test(P.D),
  31: (P) => /w:type="(?:separator|continuationSeparator)"/.test(P.notes),
  32: (P) => /<w:comment\s/.test(P.comments),
  33: (P) => /<w:ins\s[^>]*[^/]>/.test(P.S),
  34: (P) => /<w:delText[\s>]/.test(P.S),
  35: (P) => /<w:moveFrom\s[^>]*[^/]>/.test(P.S),
  36: (P) => /<w:moveTo\s[^>]*[^/]>/.test(P.S),
  37: (P) => P.pPrs.some(([, p]) => /<w:rPr>(?:(?!<\/w:rPr>)[\s\S])*<w:del\s/.test(p)),
  38: (P) => /<w:fldSimple\s[^>]*[^/]>/.test(P.S),
  39: (P) => /<w:fldSimple\s/.test(P.S),
  40: (P) => /w:fldCharType="separate"/.test(P.S),
  41: (P) => /<w:instrText[\s>]/.test(P.S),
  42: (P) => instr("PAGE").test(P.S),
  43: (P) => instr("TOC").test(P.S),
  44: (P) => /<w:bookmarkStart\s[^>]*w:name="(?!_GoBack")/.test(P.S),
  45: (P) => instr("REF").test(P.S),
  46: (P) => instr("HYPERLINK").test(P.S),
  47: (P) => instr("HYPERLINK").test(P.S),
  48: (P) => /<w:textInput[\s>/]/.test(P.S),
  49: (P) => /<w:hyperlink\s[^>]*r:id="/.test(P.S),
  50: (P) => /<w:checkBox[\s>]/.test(P.S),
  51: (P) => /<w:ddList[\s>]/.test(P.S),
  52: (P) => sdts(P).some((s) => blockSdt(s) && named(s)),
  53: (P) => sdts(P).some((s) => blockSdt(s) && !named(s)),
  54: (P) => sdts(P).some(named),
  55: (P) => sdts(P).some((s) => !blockSdt(s) && s.kid !== "w:tc" && s.kid !== "w:tr"),
  56: (P) => sdts(P).some((s) => on("showingPlcHdr")(s.pr)),
  57: (P) => /<w:docPartBody>/.test(P.glossary),
  58: (P) => sdts(P).some((s) => /<w:text[\s/>]/.test(s.pr)),
  59: (P) => sdts(P).some((s) => /<w:dropDownList[\s>]/.test(s.pr)),
  60: (P) => sdts(P).some((s) => /<w14:checkbox>/.test(s.pr)),
  61: (P) => /<wps:txbx[\s>]/.test(P.S),
  62: (P) => /<v:textbox[\s>]/.test(outside(P.S, /<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g)),
  63: (P) => /<w:ruby>/.test(P.S),
  64: (P) => /<w:rt>/.test(P.S),
  65: (P) => on("vanish")(outside(P.S, /<w:pPr>[\s\S]*?<\/w:pPr>/g)),
  66: (P) => on("specVanish")(P.S),
  67: (P) => on("webHidden")(outside(P.S, /<w:pPr>[\s\S]*?<\/w:pPr>/g)),
  68: (P) => /<w:smartTag\s/.test(P.S),
  69: (P) => P.cxml.includes("w:r"),
  70: (P) => P.cxml.some((k) => k === "w:p" || k === "w:tbl"),
  71: (P) => [...P.S.matchAll(/<w:altChunk\s[^>]*r:id="([^"]+)"/g)].some((m) => /\.(x?html?|mht)$/i.test(P.rels[m[1]] ?? "")),
  72: (P) => /<m:oMath[\s>]/.test(outside(P.S, /<m:oMathPara[\s>][\s\S]*?<\/m:oMathPara>/g)),
  73: (P) => /<m:f>/.test(P.S),
  74: (P) => /<m:oMathPara[\s>]/.test(P.S),
  75: alt("picture", "descr"),
  76: alt("picture", "title"),
  77: (P) => /<c:chart>\s*<c:title>\s*<c:tx>\s*<c:rich>/.test(P.charts),
  78: (P) => /<c:ser>[\s\S]*?<c:tx>\s*<c:strRef>/.test(P.charts),
  79: (P) => /<c:cat>\s*<c:strRef>/.test(P.charts),
  80: (P) => /<c:val>\s*<c:numRef>/.test(P.charts),
  81: alt("chart", "descr"),
  82: (P) => /<dgm:t>[\s\S]*?<a:t>[^<]/.test(P.dgmData),
  83: alt("diagram", "descr"),
  84: (P) => nonEmpty("dc:title").test(P.core),
  85: (P) => nonEmpty("dc:subject").test(P.core),
  86: (P) => nonEmpty("dc:creator").test(P.core) || nonEmpty("cp:lastModifiedBy").test(P.core),
  87: (P) => nonEmpty("cp:keywords").test(P.core) || nonEmpty("dc:description").test(P.core),
  88: (P) => nonEmpty("Company").test(P.app) || nonEmpty("Manager").test(P.app),
  89: (P) => /<vt:lpwstr>[^<]/.test(P.custom),
};

export default async function detect(bytes) {
  try {
    const P = load(bytes);
    P.pPrs = [...P.S.matchAll(/<w:pPr>([\s\S]*?)<\/w:pPr>/g)];
    P.lv = usedLevels(P);
    P.cxml = [...P.S.matchAll(/<w:customXml\s[^>]*>\s*(?:<w:customXmlPr>[\s\S]*?<\/w:customXmlPr>\s*)?<(\w+:\w+)/g)].map((m) => m[1]);
    return Object.keys(ROWS).map(Number).filter((r) => ROWS[r](P));
  } catch {
    return [];
  }
}
