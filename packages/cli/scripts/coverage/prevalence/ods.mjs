// Which rows of the ODS section of results/odf.md a real .ods carries, for weighting the
// coverage map by how often each construct occurs. One regex test per row over content.xml,
// styles.xml and meta.xml; it looks for the construct, never the probe's QZ text. Prefixes
// are taken as LibreOffice writes them (table:, text:, office:). Flat .fods is not a zip: [].
import { createRequire } from "node:module";
const { unzipSync, strFromU8 } = createRequire(new URL("../../../../core/package.json", import.meta.url))("fflate");

const PARTS = ["content.xml", "styles.xml", "meta.xml"];
const FIELDS = /<text:(sheet-name|page-number|page-count|date|time|file-name|title)\b[^>]*(?:\/>|>[^]*?<\/text:\1>)/g;

// Header or footer with author text: fields and markup dropped, and LibreOffice's default
// "Page <n>" / "Page <n> / <m>" footer and punctuation-only text such as the "Report"
// style's "<sheet> (<title>)" header not counted.
// ponytail: the default's word is localised; only these UI languages are recognised.
const PAGE_WORD = /^(?:Page|Seite|Pagina|P\u00e1gina|Sayfa|Strona|Str\u00e1nka|Sivu|Side|Sida|Oldal|\u0421\u0442\u0440\u0430\u043d\u0438\u0446\u0430)( \/)?$/i;
function hfText(styles, kind) {
  const blocks = styles.match(new RegExp(`<style:${kind}(?:-left|-first)?(?![\\w-])(?![^>]*style:display="false")[^>]*>[^]*?</style:${kind}(?:-left|-first)?>`, "g")) || [];
  return blocks.some((b) => {
    const text = b.replace(FIELDS, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return /[\p{L}\p{N}]/u.test(text) && !(/text:page-number/.test(b) && PAGE_WORD.test(text));
  });
}

function load(bytes) {
  const raw = unzipSync(bytes, { filter: (f) => PARTS.includes(f.name) });
  const [content, styles, meta] = PARTS.map((n) => (raw[n] ? strFromU8(raw[n]) : ""));
  // cell text only: comments, validation messages and drawn shapes removed
  const body = content.replace(/<office:annotation\b[^]*?<\/office:annotation>|<table:content-validations>[^]*?<\/table:content-validations>|<table:shapes>[^]*?<\/table:shapes>|<draw:(frame|custom-shape)\b[^]*?<\/draw:\1>/g, "");
  const cells = body.match(/<table:table-cell\b[^>]*>/g) || [];
  return { content, styles, meta, body, cells };
}

const cell = (p, rx) => p.cells.some((c) => rx.test(c));
const formula = (p, rx) => p.cells.some((c) => /table:formula="/.test(c) && rx.test(c));

function hiddenSheet(p) {
  const hidden = [...p.content.matchAll(/<style:style\b[^>]*style:name="([^"]+)"[^>]*>(?:(?!<\/style:style>)[^])*?<style:table-properties\b[^>]*table:display="false"/g)].map((m) => m[1]);
  return hidden.some((n) => new RegExp(`<table:table\\s[^>]*table:style-name="${n}"`).test(p.content));
}

export const ROWS = {
  S1: (p) => /<dc:title>\s*[^<\s]/.test(p.meta),
  S2: (p) => /<table:table\s[^>]*table:name="/.test(p.content),
  S3: (p) => (p.content.match(/<table:table\s/g) || []).length > 1,
  S4: hiddenSheet,
  S5: (p) => /<table:table-column\b[^>]*table:visibility="(?:collapse|filter)"/.test(p.content),
  S6: (p) => /<table:table-row\b[^>]*table:visibility="(?:collapse|filter)"/.test(p.content),
  S7: (p) => cell(p, /office:value-type="string"/),
  S8: (p) => cell(p, /office:value-type="float"/),
  S9: (p) => cell(p, /office:value-type="date"/),
  S10: (p) => cell(p, /office:value-type="currency"/),
  S11: (p) => cell(p, /office:value-type="percentage"/),
  S12: (p) => formula(p, /office:value-type="string"/),
  S13: (p) => formula(p, /./),
  S14: (p) => formula(p, /office:value-type="(?:float|currency|percentage)"/),
  S15: (p) => /<office:annotation[\s>]/.test(p.content),
  S16: (p) => /<office:annotation[\s>](?:(?!<\/office:annotation>)[^])*?<dc:creator>\s*[^<\s]/.test(p.content),
  S17: (p) => cell(p, /table:number-(?:columns|rows)-spanned="(?:[2-9]|\d\d)/),
  S18: (p) => /<table:covered-table-cell\b[^>]*>\s*<text:p\b[^>]*>[^<]/.test(p.body),
  S19: (p) => /<table:covered-table-cell\b(?:(?!<\/table:table-row>)[^])*?<table:table-cell\b[^>]*office:value-type/.test(p.body),
  S20: (p) => /<table:table-cell\b[^>]*>(?:(?!<\/table:table-cell>)[^])*?<\/text:p>\s*<text:p\b/.test(p.body),
  S21: (p) => p.cells.some((c) => /columns-repeated="(?:[2-9]|\d\d)/.test(c) && /office:value-type/.test(c)),
  S22: (p) => /<table:table-cell\b[^>]*table:number-columns-repeated="\d+"[^>]*\/>\s*<\/table:table-row>|<table:table-row\b[^>]*table:number-rows-repeated="\d+"[^>]*>\s*(?:<table:table-cell\b[^>]*\/>\s*)+<\/table:table-row>/.test(p.body),
  S23: (p) => /<table:help-message\b(?:[^>]*table:title="[^"]|[^>]*>(?:(?!<\/table:help-message>)[^])*?<text:p\b[^>]*>[^<])/.test(p.content),
  S24: (p) => /<table:error-message\b(?:[^>]*table:title="[^"]|[^>]*>(?:(?!<\/table:error-message>)[^])*?<text:p\b[^>]*>[^<])/.test(p.content),
  S25: (p) => hfText(p.styles, "header"),
  S26: (p) => hfText(p.styles, "footer"),
  S27: (p) => /<table:named-(?:range|expression)\b/.test(p.content),
};

export const UNDETECTABLE = {};

export default async function detect(bytes) {
  try {
    const p = load(bytes);
    return Object.keys(ROWS).filter((k) => ROWS[k](p));
  } catch {
    return [];
  }
}
