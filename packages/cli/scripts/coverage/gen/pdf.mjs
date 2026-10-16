// Hand-built PDF probes for the coverage study. Every object is written here,
// content streams uncompressed, xref offsets computed. Usage: node pdf.mjs <outdir>
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const fontkit = require(
  new URL("../../../../core/tests/fixtures/real/node_modules/fontkit/dist/main.cjs", import.meta.url).pathname,
);
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });

const esc = (s) => s.replace(/[\\()]/g, (c) => "\\" + c);
const lit = (s) => `(${esc(s)})`;

class Pdf {
  objs = [];
  reserve() {
    this.objs.push(null);
    return this.objs.length;
  }
  set(n, dict, stream) {
    this.objs[n - 1] = { dict, stream };
    return n;
  }
  add(dict, stream) {
    return this.set(this.reserve(), dict, stream);
  }
  write(file, rootRef, infoRef) {
    const parts = [Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n", "latin1")];
    let pos = parts[0].length;
    const offsets = [];
    this.objs.forEach((o, i) => {
      offsets.push(pos);
      let body;
      if (o.stream !== undefined) {
        const data = Buffer.isBuffer(o.stream) ? o.stream : Buffer.from(o.stream, "latin1");
        const d = o.dict.replace(/>>\s*$/, ` /Length ${data.length} >>`);
        body = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n${d}\nstream\n`, "latin1"), data, Buffer.from("\nendstream\nendobj\n")]);
      } else body = Buffer.from(`${i + 1} 0 obj\n${o.dict}\nendobj\n`, "latin1");
      parts.push(body);
      pos += body.length;
    });
    const xref = [`xref\n0 ${this.objs.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)].join("");
    const id = "<" + Buffer.from(path.basename(file)).toString("hex").padEnd(32, "0").slice(0, 32) + ">";
    const trailer = `trailer\n<< /Size ${this.objs.length + 1} /Root ${rootRef} 0 R${infoRef ? ` /Info ${infoRef} 0 R` : ""} /ID [${id} ${id}] >>\nstartxref\n${pos}\n%%EOF\n`;
    parts.push(Buffer.from(xref + trailer, "latin1"));
    fs.writeFileSync(path.join(out, file), Buffer.concat(parts));
  }
}

const t = (x, y, s, font = "F1", size = 11) => `BT /${font} ${size} Tf ${x} ${y} Td ${lit(s)} Tj ET`;
const helv = (pdf, extra = "") =>
  pdf.add(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding ${extra}>>`);

// ---------- 1. main: four pages, text constructs, furniture, metadata, annotations, forms ----------
{
  const pdf = new Pdf();
  const catalog = pdf.reserve();
  const pagesRef = pdf.reserve();
  const pageRefs = [pdf.reserve(), pdf.reserve(), pdf.reserve(), pdf.reserve()];

  const f1 = helv(pdf);
  const f2 = pdf.add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [1 /fi] >> >>",
  );
  // ToUnicode that disagrees with the glyph codes: codes a..n draw "abcdefghijklmn", the CMap says QZTOUNICODEMAP.
  const target = "QZTOUNICODEMAP";
  const bf = [...target].map((ch, i) => `<${(0x61 + i).toString(16)}> <${ch.charCodeAt(0).toString(16).padStart(4, "0")}>`).join("\n");
  const cmap1 = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<00> <FF>\nendcodespacerange\n${target.length} beginbfchar\n${bf}\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
  const tu1 = pdf.add("<< >>", cmap1);
  const f3 = helv(pdf, `/ToUnicode ${tu1} 0 R `);

  // Type0 / Identity-H with an embedded TrueType (DejaVuSans) and a ToUnicode CMap.
  const ttfPath = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
  const ttf = fs.readFileSync(ttfPath);
  const font = fontkit.openSync(ttfPath);
  const word = "QZTYPEZEROFONT";
  const glyphs = [...word].map((ch) => font.glyphForCodePoint(ch.charCodeAt(0)));
  const scale = 1000 / font.unitsPerEm;
  const uniq = [...new Map(glyphs.map((g, i) => [g.id, { g, ch: word[i] }])).values()];
  const widths = uniq.map(({ g }) => `${g.id} [${Math.round(g.advanceWidth * scale)}]`).join(" ");
  const bf0 = uniq.map(({ g, ch }) => `<${g.id.toString(16).padStart(4, "0")}> <${ch.charCodeAt(0).toString(16).padStart(4, "0")}>`).join("\n");
  const cmap0 = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${uniq.length} beginbfchar\n${bf0}\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
  const ff2 = pdf.add(`<< /Length1 ${ttf.length} >>`, ttf);
  const fd = pdf.add(
    `<< /Type /FontDescriptor /FontName /DejaVuSans /Flags 32 /FontBBox [-1021 -463 1793 1232] /ItalicAngle 0 /Ascent 928 /Descent -236 /CapHeight 729 /StemV 80 /FontFile2 ${ff2} 0 R >>`,
  );
  const cid = pdf.add(
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /DejaVuSans /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${fd} 0 R /DW 1000 /W [${widths}] /CIDToGIDMap /Identity >>`,
  );
  const tu0 = pdf.add("<< >>", cmap0);
  const f4 = pdf.add(
    `<< /Type /Font /Subtype /Type0 /BaseFont /DejaVuSans /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${tu0} 0 R >>`,
  );
  const type0Hex = glyphs.map((g) => g.id.toString(16).padStart(4, "0")).join("");

  const helvForm = pdf.add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const zadb = pdf.add("<< /Type /Font /Subtype /Type1 /BaseFont /ZapfDingbats >>");

  const fx = pdf.add(
    `<< /Type /XObject /Subtype /Form /BBox [0 0 300 20] /Resources << /Font << /F1 ${f1} 0 R >> >> >>`,
    `BT /F1 11 Tf 0 4 Td (QZFORMXOBJECT drawn inside a form xobject) Tj ET`,
  );
  const ocOff = pdf.add("<< /Type /OCG /Name (Layer off) >>");
  const ocOn = pdf.add("<< /Type /OCG /Name (Layer on) >>");

  const resources = `<< /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R /F3 ${f3} 0 R /F4 ${f4} 0 R >> /XObject << /Fx1 ${fx} 0 R >> /Properties << /oc1 ${ocOff} 0 R /oc2 ${ocOn} 0 R >> >>`;
  const header = t(72, 750, "QZRUNHEAD Quarterly Report", "F1", 10);
  const footer = (n) => t(290, 40, `QZFOLIO ${n}`, "F1", 10);
  const watermark = "q 0.85 g BT /F1 60 Tf 0.7071 0.7071 -0.7071 0.7071 160 260 Tm (QZWATERMARK) Tj ET Q";

  const page1 = [
    header,
    t(72, 710, "QZPLAINTJ is a plain sentence drawn with one Tj."),
    "BT /F1 11 Tf 72 690 Td [(QZTJWORD) -300 (QZTJGAP) -300 (third word)] TJ ET",
    "BT /F1 11 Tf 72 670 Td [(QZKE) -15 (RNIN) 20 (SIDE) ( kerned within one word)] TJ ET",
    "BT /F1 11 Tf 72 650 Td (QZPOSA) Tj 70 0 Td (QZPOSB) Tj ET",
    // two columns, right column written first
    t(320, 600, "QZRIGHTCOLONE right column first line"),
    t(320, 586, "right column second line of text"),
    t(320, 572, "right column third line QZRIGHTCOLEND"),
    t(72, 600, "QZLEFTCOLONE left column first line"),
    t(72, 586, "left column second line of text"),
    t(72, 572, "left column third line QZLEFTCOLEND"),
    // a table drawn as positioned text
    t(72, 480, "Item"), t(220, 480, "QZTABLEQTY"), t(360, 480, "Price"),
    t(72, 464, "Apples"), t(220, 464, "12"), t(360, 464, "3.50"),
    t(72, 448, "Pears"), t(220, 448, "7"), t(360, 448, "2.25"),
    footer(1),
    watermark,
  ].join("\n");

  const page2 = [
    header,
    `q BT /F1 11 Tf 72 710 Td 3 Tr (QZINVISIBLE text in render mode three) Tj ET Q`,
    `q BT /F1 24 Tf 72 680 Td 7 Tr (QZCLIPTEXT) Tj ET 0 0 1 rg 72 670 300 40 re f Q`,
    `q 1 1 1 rg BT /F1 11 Tf 72 650 Td (QZWHITEONWHITE text drawn white) Tj ET Q`,
    `/OC /oc1 BDC ${t(72, 630, "QZOCGOFF text in a layer that is off")} EMC`,
    `/OC /oc2 BDC ${t(72, 610, "QZOCGON text in a layer that is on")} EMC`,
    `q 1 0 0 1 72 586 cm /Fx1 Do Q`,
    t(72, 570, "abcdefghijklmn", "F3"),
    `BT /F2 11 Tf 72 550 Td (QZDIFFLIGA of\\001ce) Tj ET`,
    `BT /F1 11 Tf 72 530 Td /Span << /ActualText (QZACTUALTEXT) >> BDC (QZGLYPHRUN) Tj EMC ET`,
    t(72, 510, "QZHIGHLIGHTED words under a highlight"),
    t(72, 490, "QZLINKTEXT goes to a web address"),
    footer(2),
    watermark,
  ].join("\n");

  const page3 = [
    header,
    `BT /F1 11 Tf 72 710 Td (QZSOFTHY\\255) Tj ET`,
    t(72, 696, "PHENA continues after a soft hyphen."),
    t(72, 676, "QZHARDHY-"),
    t(72, 662, "PHENB continues after a hard hyphen."),
    `BT /F4 12 Tf 72 640 Td <${type0Hex}> Tj ET`,
    t(72, 600, "Form fields follow:"),
    footer(3),
    watermark,
  ].join("\n");

  const page4 = [header, t(72, 700, "QZLASTPAGE closing paragraph of the document."), footer(4), watermark].join("\n");

  // ---- annotations on page 2
  const p2 = pageRefs[1];
  const sticky = pdf.reserve();
  const popup = pdf.add(`<< /Type /Annot /Subtype /Popup /Rect [430 620 590 700] /Parent ${sticky} 0 R /Open false /Contents (QZPOPUPOWN) /P ${p2} 0 R >>`);
  pdf.set(sticky, `<< /Type /Annot /Subtype /Text /Rect [400 700 420 720] /Contents (QZSTICKYNOTE) /T (Reviewer) /Name /Comment /Popup ${popup} 0 R /F 4 /P ${p2} 0 R >>`);
  const ftAp = pdf.add(
    `<< /Type /XObject /Subtype /Form /BBox [0 0 200 30] /Resources << /Font << /Helv ${helvForm} 0 R >> >> >>`,
    `BT /Helv 12 Tf 4 10 Td (QZFREETEXT box on the page) Tj ET`,
  );
  const freeText = pdf.add(`<< /Type /Annot /Subtype /FreeText /Rect [350 400 550 430] /Contents (QZFREETEXT box on the page) /DA (/Helv 12 Tf 0 g) /F 4 /AP << /N ${ftAp} 0 R >> /P ${p2} 0 R >>`);
  const hl = pdf.add(`<< /Type /Annot /Subtype /Highlight /Rect [70 506 260 522] /QuadPoints [70 522 260 522 70 506 260 506] /C [1 1 0] /Contents (QZHIGHLIGHTNOTE) /T (Reviewer) /F 4 /P ${p2} 0 R >>`);
  const link = pdf.add(`<< /Type /Annot /Subtype /Link /Rect [70 486 140 502] /Border [0 0 0] /A << /S /URI /URI (https://example.com/QZLINKURI) >> /F 4 /P ${p2} 0 R >>`);
  const attBody = pdf.add("<< /Type /EmbeddedFile /Subtype /text#2Fplain >>", "QZATTACHBODY text inside the file attached by an annotation");
  const attFs = pdf.add(`<< /Type /Filespec /F (QZATTACHNAME.txt) /UF (QZATTACHNAME.txt) /Desc (QZATTACHDESC) /EF << /F ${attBody} 0 R >> >>`);
  const att = pdf.add(`<< /Type /Annot /Subtype /FileAttachment /Rect [520 480 540 500] /Contents (QZATTACHNOTE) /FS ${attFs} 0 R /Name /Paperclip /F 4 /P ${p2} 0 R >>`);
  const hidden = pdf.add(`<< /Type /Annot /Subtype /Text /Rect [400 300 420 320] /Contents (QZHIDDENANNOT) /F 2 /P ${p2} 0 R >>`);
  const annots2 = [sticky, popup, freeText, hl, link, att, hidden];

  // ---- form fields on page 3
  const p3 = pageRefs[2];
  const tfAp = pdf.add(`<< /Type /XObject /Subtype /Form /BBox [0 0 228 20] /Resources << /Font << /Helv ${helvForm} 0 R >> >> >>`, `/Tx BMC q BT /Helv 10 Tf 2 6 Td (QZFIELDVALUE) Tj ET Q EMC`);
  const tf = pdf.add(`<< /Type /Annot /Subtype /Widget /FT /Tx /T (fullname) /TU (QZFIELDTOOLTIP) /V (QZFIELDVALUE) /DA (/Helv 10 Tf 0 g) /Rect [72 570 300 590] /F 4 /AP << /N ${tfAp} 0 R >> /P ${p3} 0 R >>`);
  const cbOn = pdf.add(`<< /Type /XObject /Subtype /Form /BBox [0 0 14 14] /Resources << /Font << /ZaDb ${zadb} 0 R >> >> >>`, `q BT /ZaDb 12 Tf 1 2 Td (4) Tj ET Q`);
  const cbOff = pdf.add(`<< /Type /XObject /Subtype /Form /BBox [0 0 14 14] >>`, ``);
  const cb = pdf.add(`<< /Type /Annot /Subtype /Widget /FT /Btn /T (agree) /TU (QZCHECKBOXTU) /V /Yes /AS /Yes /Rect [72 545 86 559] /F 4 /MK << /CA (4) >> /AP << /N << /Yes ${cbOn} 0 R /Off ${cbOff} 0 R >> >> /P ${p3} 0 R >>`);
  const chAp = pdf.add(`<< /Type /XObject /Subtype /Form /BBox [0 0 150 20] /Resources << /Font << /Helv ${helvForm} 0 R >> >> >>`, `/Tx BMC q BT /Helv 10 Tf 2 6 Td (QZCHOICEB) Tj ET Q EMC`);
  const ch = pdf.add(`<< /Type /Annot /Subtype /Widget /FT /Ch /Ff 131072 /T (pick) /Opt [(QZCHOICEA) (QZCHOICEB)] /V (QZCHOICEB) /DA (/Helv 10 Tf 0 g) /Rect [72 515 222 535] /F 4 /AP << /N ${chAp} 0 R >> /P ${p3} 0 R >>`);
  const noAp = pdf.add(`<< /Type /Annot /Subtype /Widget /FT /Tx /T (noappearance) /V (QZNOAPVALUE) /DA (/Helv 10 Tf 0 g) /Rect [72 485 300 505] /F 4 /P ${p3} 0 R >>`);
  const fields = [tf, cb, ch, noAp];

  const contents = [page1, page2, page3, page4].map((s) => pdf.add("<< >>", s));
  pageRefs.forEach((ref, i) => {
    const annots = i === 1 ? annots2 : i === 2 ? fields : [];
    pdf.set(
      ref,
      `<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 612 792] /Resources ${resources} /Contents ${contents[i]} 0 R${annots.length ? ` /Annots [${annots.map((a) => `${a} 0 R`).join(" ")}]` : ""} >>`,
    );
  });
  pdf.set(pagesRef, `<< /Type /Pages /Kids [${pageRefs.map((r) => `${r} 0 R`).join(" ")}] /Count 4 >>`);

  // outline
  const outlines = pdf.reserve();
  const o1 = pdf.reserve();
  const o1c = pdf.add(`<< /Title (QZOUTLINECHILD) /Parent ${o1} 0 R /Dest [${pageRefs[1]} 0 R /Fit] >>`);
  pdf.set(o1, `<< /Title (QZOUTLINEONE) /Parent ${outlines} 0 R /First ${o1c} 0 R /Last ${o1c} 0 R /Count 1 /Dest [${pageRefs[0]} 0 R /Fit] >>`);
  pdf.set(outlines, `<< /Type /Outlines /First ${o1} 0 R /Last ${o1} 0 R /Count 2 >>`);

  const js = pdf.add(`<< /S /JavaScript /JS (app.alert\\("QZJAVASCRIPT"\\);) >>`);
  const embBody = pdf.add("<< /Type /EmbeddedFile /Subtype /text#2Fplain >>", "QZEMBEDBODY text inside a document-level embedded file");
  const embFs = pdf.add(`<< /Type /Filespec /F (QZEMBEDNAME.txt) /UF (QZEMBEDNAME.txt) /Desc (QZEMBEDDESC) /EF << /F ${embBody} 0 R >> >>`);
  const xmp = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title><rdf:Alt><rdf:li xml:lang="x-default">QZXMPTITLE</rdf:li></rdf:Alt></dc:title>
</rdf:Description></rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>`;
  const meta = pdf.add("<< /Type /Metadata /Subtype /XML >>", Buffer.from(xmp, "utf8"));
  const acro = pdf.add(`<< /Fields [${fields.map((f) => `${f} 0 R`).join(" ")}] /NeedAppearances true /DA (/Helv 10 Tf 0 g) /DR << /Font << /Helv ${helvForm} 0 R /ZaDb ${zadb} 0 R >> >> >>`);
  pdf.set(
    catalog,
    `<< /Type /Catalog /Pages ${pagesRef} 0 R /Outlines ${outlines} 0 R /PageMode /UseOutlines /Metadata ${meta} 0 R ` +
      `/PageLabels << /Nums [0 << /S /r >> 2 << /S /D /P (QZPAGELABEL) >>] >> ` +
      `/Names << /JavaScript << /Names [(doc) ${js} 0 R] >> /EmbeddedFiles << /Names [(QZEMBEDNAME.txt) ${embFs} 0 R] >> >> ` +
      `/AcroForm ${acro} 0 R /OCProperties << /OCGs [${ocOff} 0 R ${ocOn} 0 R] /D << /Order [${ocOff} 0 R ${ocOn} 0 R] /ON [${ocOn} 0 R] /OFF [${ocOff} 0 R] >> >> >>`,
  );
  const info = pdf.add(`<< /Title (QZINFOTITLE) /Author (QZINFOAUTHOR) /Subject (QZINFOSUBJECT) /Keywords (QZINFOKEYWORDS) /Producer (hand-built probe) >>`);
  pdf.write("pdf-main.pdf", catalog, info);
}

// ---------- 2. tagged: Pagination artifact header on two pages, Figure with Alt ----------
{
  const pdf = new Pdf();
  const catalog = pdf.reserve();
  const pagesRef = pdf.reserve();
  const pg = [pdf.reserve(), pdf.reserve()];
  const f1 = helv(pdf);
  const art = (s) => `/Artifact << /Type /Pagination /Subtype /Header >> BDC ${t(72, 750, s, "F1", 10)} EMC`;
  const c1 = pdf.add("<< >>", [
    art("QZARTIFACTHEAD running header marked as a pagination artifact"),
    `/P << /MCID 0 >> BDC ${t(72, 700, "QZTAGGEDBODYONE first page body paragraph.")} EMC`,
    `/Figure << /MCID 1 >> BDC 0 0 1 rg 72 560 100 100 re f EMC`,
    `/P << /MCID 2 >> BDC ${t(72, 540, "QZAFTERFIGURE paragraph after the figure.")} EMC`,
  ].join("\n"));
  const c2 = pdf.add("<< >>", [
    art("QZARTIFACTHEAD running header marked as a pagination artifact"),
    `/P << /MCID 0 >> BDC ${t(72, 700, "QZTAGGEDBODYTWO second page body paragraph.")} EMC`,
  ].join("\n"));
  const root = pdf.reserve();
  const doc = pdf.reserve();
  const pA = pdf.add(`<< /Type /StructElem /S /P /P ${doc} 0 R /Pg ${pg[0]} 0 R /K 0 >>`);
  const fig = pdf.add(`<< /Type /StructElem /S /Figure /P ${doc} 0 R /Pg ${pg[0]} 0 R /Alt (QZFIGUREALT a blue square) /K 1 >>`);
  const pB = pdf.add(`<< /Type /StructElem /S /P /P ${doc} 0 R /Pg ${pg[0]} 0 R /K 2 >>`);
  const pC = pdf.add(`<< /Type /StructElem /S /P /P ${doc} 0 R /Pg ${pg[1]} 0 R /K 0 >>`);
  pdf.set(doc, `<< /Type /StructElem /S /Document /P ${root} 0 R /K [${pA} 0 R ${fig} 0 R ${pB} 0 R ${pC} 0 R] >>`);
  pdf.set(root, `<< /Type /StructTreeRoot /K ${doc} 0 R /ParentTree << /Nums [0 [${pA} 0 R ${fig} 0 R ${pB} 0 R] 1 [${pC} 0 R]] >> /ParentTreeNextKey 2 >>`);
  [c1, c2].forEach((c, i) =>
    pdf.set(pg[i], `<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${f1} 0 R >> >> /Contents ${c} 0 R /StructParents ${i} >>`),
  );
  pdf.set(pagesRef, `<< /Type /Pages /Kids [${pg[0]} 0 R ${pg[1]} 0 R] /Count 2 >>`);
  pdf.set(catalog, `<< /Type /Catalog /Pages ${pagesRef} 0 R /StructTreeRoot ${root} 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>`);
  pdf.write("pdf-tagged.pdf", catalog);
}

// ---------- 3. rotated page and vertical text ----------
{
  const pdf = new Pdf();
  const catalog = pdf.reserve();
  const pagesRef = pdf.reserve();
  const pg = [pdf.reserve(), pdf.reserve()];
  const f1 = helv(pdf);
  const c1 = pdf.add("<< >>", [t(72, 700, "QZROTATEDPAGE first line on a page with Rotate 90."), t(72, 684, "second line of the rotated page.")].join("\n"));
  const c2 = pdf.add("<< >>", [t(72, 700, "QZUPRIGHTCONTROL upright line on the second page."), `BT /F1 11 Tf 0 1 -1 0 500 300 Tm (QZVERTICALTEXT drawn bottom to top) Tj ET`].join("\n"));
  [c1, c2].forEach((c, i) =>
    pdf.set(pg[i], `<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 612 792]${i === 0 ? " /Rotate 90" : ""} /Resources << /Font << /F1 ${f1} 0 R >> >> /Contents ${c} 0 R >>`),
  );
  pdf.set(pagesRef, `<< /Type /Pages /Kids [${pg[0]} 0 R ${pg[1]} 0 R] /Count 2 >>`);
  pdf.set(catalog, `<< /Type /Catalog /Pages ${pagesRef} 0 R >>`);
  pdf.write("pdf-rotate.pdf", catalog);
}

// ---------- 5. control: the same two columns written left column first ----------
{
  const pdf = new Pdf();
  const catalog = pdf.reserve();
  const pagesRef = pdf.reserve();
  const pg = pdf.reserve();
  const f1 = helv(pdf);
  const c = pdf.add("<< >>", [
    t(72, 600, "QZCTLLEFTONE left column first line"),
    t(72, 586, "left column second line of text"),
    t(72, 572, "left column third line QZCTLLEFTEND"),
    t(320, 600, "QZCTLRIGHTONE right column first line"),
    t(320, 586, "right column second line of text"),
    t(320, 572, "right column third line QZCTLRIGHTEND"),
  ].join("\n"));
  // a second page so the reader runs with the same settings as the four-page main probe
  const pg2 = pdf.reserve();
  const c2 = pdf.add("<< >>", t(72, 700, "second page of the column control."));
  pdf.set(pg, `<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${f1} 0 R >> >> /Contents ${c} 0 R >>`);
  pdf.set(pg2, `<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${f1} 0 R >> >> /Contents ${c2} 0 R >>`);
  pdf.set(pagesRef, `<< /Type /Pages /Kids [${pg} 0 R ${pg2} 0 R] /Count 2 >>`);
  pdf.set(catalog, `<< /Type /Catalog /Pages ${pagesRef} 0 R >>`);
  pdf.write("pdf-columns-control.pdf", catalog);
}

// ---------- 7. Tr 3 text with no picture on the page, two pages, nothing else ----------
{
  const pdf = new Pdf();
  const catalog = pdf.reserve();
  const pagesRef = pdf.reserve();
  const pg = [pdf.reserve(), pdf.reserve()];
  const f1 = helv(pdf);
  const cs = [
    pdf.add("<< >>", [t(72, 720, "QZTRTHREECTL visible line above."), `q BT /F1 11 Tf 72 700 Td 3 Tr (QZTRTHREEALONE invisible line without a picture) Tj ET Q`, t(72, 680, "visible line below.")].join("\n")),
    pdf.add("<< >>", t(72, 700, "second page visible line.")),
  ];
  cs.forEach((c, i) =>
    pdf.set(pg[i], `<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${f1} 0 R >> >> /Contents ${c} 0 R >>`),
  );
  pdf.set(pagesRef, `<< /Type /Pages /Kids [${pg[0]} 0 R ${pg[1]} 0 R] /Count 2 >>`);
  pdf.set(catalog, `<< /Type /Catalog /Pages ${pagesRef} 0 R >>`);
  pdf.write("pdf-tr3.pdf", catalog);
}

// ---------- 6. OCR text layer: a full-page picture with Tr 3 text over it, as scanners write ----------
{
  const pdf = new Pdf();
  const catalog = pdf.reserve();
  const pagesRef = pdf.reserve();
  const pg = [pdf.reserve(), pdf.reserve()];
  const f1 = helv(pdf);
  const px = Buffer.alloc(64 * 64, 0xf0);
  for (let i = 0; i < 64; i++) px[i * 64 + i] = 0x20;
  const img = pdf.add("<< /Type /XObject /Subtype /Image /Width 64 /Height 64 /ColorSpace /DeviceGray /BitsPerComponent 8 >>", px);
  const page = (s) => `q 612 0 0 792 0 0 cm /Im1 Do Q\nBT 3 Tr /F1 11 Tf 72 700 Td (${s}) Tj ET`;
  const cs = [pdf.add("<< >>", page("QZOCRLAYERONE recognised text of the first scanned page")), pdf.add("<< >>", page("QZOCRLAYERTWO recognised text of the second scanned page"))];
  cs.forEach((c, i) =>
    pdf.set(pg[i], `<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${f1} 0 R >> /XObject << /Im1 ${img} 0 R >> >> /Contents ${c} 0 R >>`),
  );
  pdf.set(pagesRef, `<< /Type /Pages /Kids [${pg[0]} 0 R ${pg[1]} 0 R] /Count 2 >>`);
  pdf.set(catalog, `<< /Type /Catalog /Pages ${pagesRef} 0 R >>`);
  pdf.write("pdf-ocrlayer.pdf", catalog);
}

// ---------- 4. plain two-page document, encrypted afterwards by pypdf ----------
{
  const pdf = new Pdf();
  const catalog = pdf.reserve();
  const pagesRef = pdf.reserve();
  const pg = [pdf.reserve(), pdf.reserve()];
  const f1 = helv(pdf);
  const c1 = pdf.add("<< >>", t(72, 700, "QZENCRYPTEDBODY first page of an encrypted document."));
  const c2 = pdf.add("<< >>", t(72, 700, "second page of the encrypted document."));
  [c1, c2].forEach((c, i) =>
    pdf.set(pg[i], `<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${f1} 0 R >> >> /Contents ${c} 0 R >>`),
  );
  pdf.set(pagesRef, `<< /Type /Pages /Kids [${pg[0]} 0 R ${pg[1]} 0 R] /Count 2 >>`);
  pdf.set(catalog, `<< /Type /Catalog /Pages ${pagesRef} 0 R >>`);
  pdf.write("plain-for-encryption.pdf.src", catalog);
}
