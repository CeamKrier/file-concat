// Hand-built DOCX coverage probe. Every part is written by hand so each
// construct holds exactly one marker. Run: node gen/docx.mjs <outdir>
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const { zipSync, strToU8 } = createRequire(new URL("../../../../core/package.json", import.meta.url))("fflate");

const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });

const NS = `xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" mc:Ignorable="w14 w15 wp14"`;
const XMLDECL = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;
const RNS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const t = (s) => `<w:r><w:t xml:space="preserve">${s}</w:t></w:r>`;
const p = (inner, ppr = "") => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}${inner}</w:p>`;
const tc = (inner, tcpr = "") => `<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/>${tcpr}</w:tcPr>${inner}</w:tc>`;
const fld = (instr, resultRuns, ffData = "") =>
  `<w:r><w:fldChar w:fldCharType="begin">${ffData}</w:fldChar></w:r><w:r><w:instrText xml:space="preserve">${instr}</w:instrText></w:r>` +
  (resultRuns === null ? "" : `<w:r><w:fldChar w:fldCharType="separate"/></w:r>${resultRuns}`) +
  `<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
const num = (id, lvl) => `<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${lvl}"/><w:numId w:val="${id}"/></w:numPr>`;

const inlinePic = (id, name, descr, title, graphic) =>
  `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="914400" cy="914400"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="${name}" descr="${descr}"${title ? ` title="${title}"` : ""}/><wp:cNvGraphicFramePr/>${graphic}</wp:inline></w:drawing></w:r>`;

const txbxBody = (marker) => `<w:txbxContent><w:p><w:r><w:t>${marker}</w:t></w:r></w:p></w:txbxContent>`;
const textBoxAlt = `<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="251659264" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="1828800" cy="457200"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapSquare wrapText="bothSides"/><wp:docPr id="10" name="Text Box 10"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr txBox="1"/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1828800" cy="457200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></wps:spPr><wps:txbx>${txbxBody("QZTEXTBOX")}</wps:txbx><wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice><mc:Fallback><w:pict><v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype><v:shape id="Text Box 10" o:spid="_x0000_s1026" type="#_x0000_t202" style="position:absolute;width:2in;height:36pt"><v:textbox>${txbxBody("QZTEXTBOX")}</v:textbox></v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r>`;
const vmlOnly = `<w:r><w:pict><v:shape id="_x0000_s1030" type="#_x0000_t202" style="position:absolute;width:2in;height:36pt"><v:textbox>${txbxBody("QZVMLTEXTBOX")}</v:textbox></v:shape></w:pict></w:r>`;

const picGraphic = `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="image1.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>`;
const chartGraphic = `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rIdChart"/></a:graphicData></a:graphic>`;
const dgmGraphic = `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram"><dgm:relIds r:dm="rIdDgmData" r:lo="rIdDgmLayout" r:qs="rIdDgmQs" r:cs="rIdDgmColors"/></a:graphicData></a:graphic>`;

const nestedTable = `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="1500"/></w:tblGrid><w:tr>${tc(p(t("QZNESTEDCELL")))}</w:tr></w:tbl>`;

const body = [
  p(t("QZHEADING"), `<w:pStyle w:val="Heading1"/>`),
  p(t("QZBODYRUN")),
  // breaks and special characters
  p(`${t("QZTABLEFT")}<w:r><w:tab/></w:r>${t("QZTABRIGHT")}`),
  p(`${t("QZBREAKLEFT")}<w:r><w:br/></w:r>${t("QZBREAKRIGHT")}`),
  p(`${t("QZCRLEFT")}<w:r><w:cr/></w:r>${t("QZCRRIGHT")}`),
  p(`${t("QZSYMLEFT")}<w:r><w:sym w:font="Symbol" w:char="F061"/></w:r>${t("QZSYMRIGHT")}`),
  p(`${t("QZNBHLEFT")}<w:r><w:noBreakHyphen/></w:r>${t("QZNBHRIGHT")}`),
  p(`${t("QZSOFTLEFT")}<w:r><w:softHyphen/></w:r>${t("QZSOFTRIGHT")}`),
  p(`${t("QZPTABLEFT")}<w:r><w:ptab w:relativeTo="margin" w:alignment="right" w:leader="none"/></w:r>${t("QZPTABRIGHT")}`),
  // table with caption, gridSpan, vMerge, nested table, cell and row SDTs
  `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblCaption w:val="QZTBLCAPTION"/><w:tblDescription w:val="QZTBLDESC"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>` +
    `<w:tr>${tc(p(t("QZCELLONE")))}${tc(p(t("QZCELLTWO")))}${tc(p(t("QZCELLTHREE")))}</w:tr>` +
    `<w:tr>${tc(p(t("QZGRIDSPAN")), `<w:gridSpan w:val="2"/>`)}${tc(p(t("QZVMERGESTART")), `<w:vMerge w:val="restart"/>`)}</w:tr>` +
    `<w:tr>${tc(p(t("QZROWTHREEA")))}${tc(p(t("QZROWTHREEB")))}${tc(p(""), `<w:vMerge/>`)}</w:tr>` +
    `<w:tr>${tc(p(t("QZOUTERCELL")) + nestedTable + p(""))}<w:sdt><w:sdtPr><w:id w:val="101"/></w:sdtPr><w:sdtContent>${tc(p(t("QZSDTCELL")))}</w:sdtContent></w:sdt>${tc(p(t("QZROWFOURC")))}</w:tr>` +
    `<w:sdt><w:sdtPr><w:id w:val="102"/></w:sdtPr><w:sdtContent><w:tr>${tc(p(t("QZSDTROWA")))}${tc(p(t("QZSDTROWB")))}${tc(p(t("QZSDTROWC")))}</w:tr></w:sdtContent></w:sdt>` +
    `</w:tbl>`,
  p(""),
  // lists
  p(t("QZLISTONE"), num(1, 0)),
  p(t("QZLISTSUBA"), num(1, 1)),
  p(t("QZLISTDEEP"), num(1, 2)),
  p(t("QZLISTSUBB"), num(1, 1)),
  p(t("QZLISTTWO"), num(1, 0)),
  p(t("QZBULLETONE"), num(2, 0)),
  p(t("QZBULLETTWO"), num(2, 0)),
  p(t("QZARTICLEONE"), num(3, 0)),
  p(t("QZARTICLESUB"), num(3, 1)),
  // notes and comments
  p(`${t("QZFNANCHOR")}<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="1"/></w:r>${t(" QZAFTERFN")}`),
  p(`${t("QZENANCHOR")}<w:r><w:rPr><w:rStyle w:val="EndnoteReference"/></w:rPr><w:endnoteReference w:id="1"/></w:r>`),
  p(`<w:commentRangeStart w:id="0"/>${t("QZCOMMENTED")}<w:commentRangeEnd w:id="0"/><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r>`),
  // tracked changes
  p(`${t("QZREVBEFORE ")}<w:ins w:id="201" w:author="A" w:date="2026-10-14T00:00:00Z">${t("QZINSERTED")}</w:ins><w:del w:id="202" w:author="A" w:date="2026-10-14T00:00:00Z"><w:r><w:delText xml:space="preserve">QZDELETED</w:delText></w:r></w:del>${t(" QZREVAFTER")}`),
  `<w:moveFromRangeStart w:id="210" w:author="A" w:date="2026-10-14T00:00:00Z" w:name="move1"/>` +
    p(`<w:moveFrom w:id="211" w:author="A" w:date="2026-10-14T00:00:00Z">${t("QZMOVEDFROM")}</w:moveFrom>`) +
    `<w:moveFromRangeEnd w:id="210"/>`,
  p(t("QZBETWEENMOVES")),
  `<w:moveToRangeStart w:id="212" w:author="A" w:date="2026-10-14T00:00:00Z" w:name="move1"/>` +
    p(`<w:moveTo w:id="213" w:author="A" w:date="2026-10-14T00:00:00Z">${t("QZMOVEDTO")}</w:moveTo>`) +
    `<w:moveToRangeEnd w:id="212"/>`,
  p(t("QZPARAMARKA"), `<w:rPr><w:del w:id="220" w:author="A" w:date="2026-10-14T00:00:00Z"/></w:rPr>`),
  p(t("QZPARAMARKB")),
  // fields
  p(`<w:fldSimple w:instr=" DOCPROPERTY QZSIMPLECODE \\* MERGEFORMAT ">${t("QZFLDSIMPLE")}</w:fldSimple>`),
  p(fld(" DOCPROPERTY QZCOMPLEXCODE \\* MERGEFORMAT ", t("QZCOMPLEXRESULT"))),
  p(`${t("QZPAGELABEL ")}${fld(" PAGE ", t("7"))}${t(" QZPAGEEND")}`),
  p(`<w:bookmarkStart w:id="300" w:name="QZBMNAME"/>${t("QZBOOKMARKED")}<w:bookmarkEnd w:id="300"/>`),
  p(fld(" REF QZBMNAME \\h ", t("QZREFRESULT"))),
  p(fld(' HYPERLINK "https://qzhyperfield.example/" ', `<w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>QZHYPERFIELDTEXT</w:t></w:r>`)),
  p(fld(" FORMTEXT ", t("QZFORMTEXT"), `<w:ffData><w:name w:val="Text1"/><w:enabled/><w:calcOnExit w:val="0"/><w:textInput><w:default w:val="QZFORMDEFAULT"/></w:textInput></w:ffData>`)),
  p(`${fld(" FORMCHECKBOX ", null, `<w:ffData><w:name w:val="Check1"/><w:enabled/><w:calcOnExit w:val="0"/><w:checkBox><w:sizeAuto/><w:default w:val="0"/><w:checked/></w:checkBox></w:ffData>`)}${t(" QZFFCHECKLABEL")}`),
  p(`${t("QZDDLABEL ")}${fld(" FORMDROPDOWN ", null, `<w:ffData><w:name w:val="Dropdown1"/><w:enabled/><w:calcOnExit w:val="0"/><w:ddList><w:result w:val="1"/><w:listEntry w:val="QZDDFIRST"/><w:listEntry w:val="QZDDSECOND"/><w:listEntry w:val="QZDDTHIRD"/></w:ddList></w:ffData>`)}`),
  // TOC field spanning paragraphs
  p(`<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:hyperlink w:anchor="_Toc1" w:history="1"><w:r><w:t>QZTOCENTRY</w:t></w:r><w:r><w:rPr><w:webHidden/></w:rPr><w:tab/></w:r><w:r><w:rPr><w:webHidden/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:webHidden/></w:rPr><w:instrText xml:space="preserve"> PAGEREF _Toc1 \\h </w:instrText></w:r><w:r><w:rPr><w:webHidden/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:webHidden/></w:rPr><w:t>3</w:t></w:r><w:r><w:rPr><w:webHidden/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:hyperlink>`, `<w:pStyle w:val="TOC1"/>`),
  p(`<w:r><w:fldChar w:fldCharType="end"/></w:r>`),
  // hyperlink element
  p(`<w:hyperlink r:id="rIdLink" w:history="1"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>QZLINKTEXT</w:t></w:r></w:hyperlink>`),
  // content controls
  `<w:sdt><w:sdtPr><w:id w:val="103"/><w:alias w:val="QZSDTALIAS"/><w:tag w:val="QZSDTTAG"/></w:sdtPr><w:sdtContent>${p(t("QZSDTBLOCK"))}</w:sdtContent></w:sdt>`,
  `<w:sdt><w:sdtPr><w:id w:val="109"/></w:sdtPr><w:sdtContent>${p(t("QZSDTBARE"))}</w:sdtContent></w:sdt>`,
  p(`${t("QZINLINEBEFORE ")}<w:sdt><w:sdtPr><w:id w:val="104"/></w:sdtPr><w:sdtContent>${t("QZSDTINLINE")}</w:sdtContent></w:sdt>`),
  p(`<w:sdt><w:sdtPr><w:id w:val="105"/><w:placeholder><w:docPart w:val="DefaultPlaceholder_-1854013440"/></w:placeholder><w:showingPlcHdr/></w:sdtPr><w:sdtContent><w:r><w:rPr><w:rStyle w:val="PlaceholderText"/></w:rPr><w:t>QZPLACEHOLDER</w:t></w:r></w:sdtContent></w:sdt>`),
  p(`<w:sdt><w:sdtPr><w:id w:val="106"/><w:text/></w:sdtPr><w:sdtContent>${t("QZPLAINTEXTSDT")}</w:sdtContent></w:sdt>`),
  p(`<w:sdt><w:sdtPr><w:id w:val="107"/><w:dropDownList><w:listItem w:displayText="QZSDTDDOPTA" w:value="A"/><w:listItem w:displayText="QZSDTDDOPTB" w:value="B"/></w:dropDownList></w:sdtPr><w:sdtContent>${t("QZSDTDDOPTB")}</w:sdtContent></w:sdt>`),
  p(`<w:sdt><w:sdtPr><w:id w:val="108"/><w14:checkbox><w14:checked w14:val="1"/><w14:checkedState w14:val="2612" w14:font="MS Gothic"/><w14:uncheckedState w14:val="2610" w14:font="MS Gothic"/></w14:checkbox></w:sdtPr><w:sdtContent><w:r><w:rPr><w:rFonts w:ascii="MS Gothic" w:eastAsia="MS Gothic" w:hAnsi="MS Gothic" w:hint="eastAsia"/></w:rPr><w:t>☒</w:t></w:r></w:sdtContent></w:sdt>${t(" QZCHECKSDTLABEL")}`),
  // text boxes
  p(`${t("QZTXBXANCHOR")}${textBoxAlt}`),
  p(`${t("QZVMLANCHOR")}${vmlOnly}`),
  // ruby
  p(`${t("QZRUBYBEFORE ")}<w:r><w:ruby><w:rubyPr><w:rubyAlign w:val="distributeSpace"/><w:hps w:val="10"/><w:hpsRaise w:val="18"/><w:hpsBaseText w:val="21"/><w:lid w:val="ja-JP"/></w:rubyPr><w:rt><w:r><w:t>QZRUBYTEXT</w:t></w:r></w:rt><w:rubyBase><w:r><w:t>QZRUBYBASE</w:t></w:r></w:rubyBase></w:ruby></w:r>`),
  // hidden
  p(`${t("QZVISIBLEA ")}<w:r><w:rPr><w:vanish/></w:rPr><w:t>QZVANISHED</w:t></w:r>${t(" QZVISIBLEB")}`),
  p(`<w:r><w:rPr><w:specVanish/></w:rPr><w:t>QZSPECVANISH</w:t></w:r>`, `<w:rPr><w:vanish/><w:specVanish/></w:rPr>`),
  p(`<w:r><w:rPr><w:webHidden/></w:rPr><w:t>QZWEBHIDDEN</w:t></w:r>`),
  // smart tag, custom XML
  p(`<w:smartTag w:uri="urn:schemas-microsoft-com:office:smarttags" w:element="place"><w:r><w:t>QZSMARTTAG</w:t></w:r></w:smartTag>`),
  p(`<w:customXml w:uri="urn:qz" w:element="client"><w:r><w:t>QZCUSTOMXMLRUN</w:t></w:r></w:customXml>`),
  `<w:customXml w:uri="urn:qz" w:element="section">${p(t("QZCUSTOMXMLBLOCK"))}</w:customXml>`,
  // altChunk
  `<w:altChunk r:id="rIdAlt"/>`,
  // math
  p(`${t("QZMATHLEAD ")}<m:oMath><m:r><m:t>QZMATHINLINE</m:t></m:r><m:f><m:num><m:r><m:t>QZNUMER</m:t></m:r></m:num><m:den><m:r><m:t>QZDENOM</m:t></m:r></m:den></m:f></m:oMath>`),
  p(`<m:oMathPara><m:oMath><m:r><m:t>QZMATHPARA</m:t></m:r></m:oMath></m:oMathPara>`),
  // drawings: picture alt text, chart, SmartArt
  p(inlinePic(20, "Picture 20", "QZPICALT", "QZPICTITLE", picGraphic)),
  p(inlinePic(21, "Chart 21", "QZCHARTALT", "", chartGraphic)),
  p(inlinePic(22, "Diagram 22", "QZDGMALT", "", dgmGraphic)),
  p(t("QZLASTBODY")),
  `<w:sectPr><w:headerReference w:type="default" r:id="rIdH1"/><w:headerReference w:type="first" r:id="rIdH2"/><w:headerReference w:type="even" r:id="rIdH3"/><w:footerReference w:type="default" r:id="rIdF1"/><w:footerReference w:type="first" r:id="rIdF2"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/><w:titlePg/></w:sectPr>`,
].join("");

const W_ROOT = (tag, inner) => `${XMLDECL}<w:${tag} ${NS}>${inner}</w:${tag}>`;
const rels = (list) =>
  `${XMLDECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list
    .map(([id, type, target, ext]) => `<Relationship Id="${id}" Type="${type.startsWith("http") ? type : `${RNS}/${type}`}" Target="${target}"${ext ? ' TargetMode="External"' : ""}/>`)
    .join("")}</Relationships>`;

const lvl = (ilvl, fmt, text, extra = "") =>
  `<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 * (ilvl + 1)}" w:hanging="360"/></w:pPr>${extra}</w:lvl>`;
const numbering = W_ROOT(
  "numbering",
  `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${lvl(0, "decimal", "%1.")}${lvl(1, "lowerLetter", "%2)")}${lvl(2, "lowerRoman", "%3.")}</w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${lvl(0, "bullet", "", `<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr>`)}</w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="multilevel"/>${lvl(0, "decimal", "Article %1.")}${lvl(1, "decimal", "%1.%2")}</w:abstractNum>` +
    `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="3"><w:abstractNumId w:val="2"/></w:num>`,
);

const styles = W_ROOT(
  "styles",
  `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/></w:style>` +
    `<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/><w:basedOn w:val="Normal"/></w:style>` +
    `<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/></w:style>` +
    `<w:style w:type="character" w:styleId="PlaceholderText"><w:name w:val="Placeholder Text"/><w:rPr><w:color w:val="808080"/></w:rPr></w:style>` +
    `<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>` +
    `<w:style w:type="character" w:styleId="EndnoteReference"><w:name w:val="endnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>` +
    `<w:style w:type="character" w:styleId="CommentReference"><w:name w:val="annotation reference"/></w:style>` +
    `<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style>`,
);
const settings = W_ROOT("settings", `<w:evenAndOddHeaders/><w:defaultTabStop w:val="720"/><w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr><w:endnotePr><w:endnote w:id="-1"/><w:endnote w:id="0"/></w:endnotePr>`);
const hdr = (m) => W_ROOT("hdr", p(t(m), `<w:pStyle w:val="Header"/>`));
const ftr = (m) => W_ROOT("ftr", p(t(m), `<w:pStyle w:val="Footer"/>`));
const sepRuns = (kind, marker) => `<w:p><w:r><w:${kind}/></w:r>${t(marker)}</w:p>`;
const footnotes = W_ROOT(
  "footnotes",
  `<w:footnote w:type="separator" w:id="-1">${sepRuns("separator", "QZFNSEPARATOR")}</w:footnote>` +
    `<w:footnote w:type="continuationSeparator" w:id="0">${sepRuns("continuationSeparator", "QZFNCONTSEP")}</w:footnote>` +
    `<w:footnote w:id="1"><w:p><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>${t(" QZFOOTNOTE")}</w:p></w:footnote>`,
);
const endnotes = W_ROOT(
  "endnotes",
  `<w:endnote w:type="separator" w:id="-1">${sepRuns("separator", "QZENSEPARATOR")}</w:endnote>` +
    `<w:endnote w:type="continuationSeparator" w:id="0">${sepRuns("continuationSeparator", "QZENCONTSEP")}</w:endnote>` +
    `<w:endnote w:id="1"><w:p><w:r><w:rPr><w:rStyle w:val="EndnoteReference"/></w:rPr><w:endnoteRef/></w:r>${t(" QZENDNOTE")}</w:p></w:endnote>`,
);
const comments = W_ROOT(
  "comments",
  `<w:comment w:id="0" w:author="QZCOMMENTAUTHOR" w:date="2026-10-14T00:00:00Z" w:initials="QA"><w:p><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r>${t("QZCOMMENTBODY")}</w:p></w:comment>`,
);
const glossary = W_ROOT(
  "glossaryDocument",
  `<w:docParts><w:docPart><w:docPartPr><w:name w:val="DefaultPlaceholder_-1854013440"/><w:category><w:name w:val="General"/><w:gallery w:val="placeholder"/></w:category><w:types><w:type w:val="bbPlcHdr"/></w:types><w:behaviors><w:behavior w:val="content"/></w:behaviors><w:guid w:val="{00000000-0000-0000-0000-000000000001}"/></w:docPartPr><w:docPartBody>${p(`<w:r><w:rPr><w:rStyle w:val="PlaceholderText"/></w:rPr><w:t>QZGLOSSARY</w:t></w:r>`)}</w:docPartBody></w:docPart></w:docParts>`,
);
const altChunkHtml = `<html><head><meta charset="utf-8"><title>chunk</title></head><body><p>QZALTCHUNK</p></body></html>`;

const C = `xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${RNS}"`;
const chart = `${XMLDECL}<c:chartSpace ${C}><c:roundedCorners val="0"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>QZCHARTTITLE</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:f>Sheet1!$B$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>QZSERIESNAME</c:v></c:pt></c:strCache></c:strRef></c:tx><c:cat><c:strRef><c:f>Sheet1!$A$2:$A$3</c:f><c:strCache><c:ptCount val="2"/><c:pt idx="0"><c:v>QZCATONE</c:v></c:pt><c:pt idx="1"><c:v>QZCATTWO</c:v></c:pt></c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>Sheet1!$B$2:$B$3</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="2"/><c:pt idx="0"><c:v>98761</c:v></c:pt><c:pt idx="1"><c:v>98762</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser><c:gapWidth val="219"/><c:axId val="1"/><c:axId val="2"/></c:barChart><c:catAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="2"/></c:catAx><c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="1"/></c:valAx></c:plotArea><c:plotVisOnly val="1"/></c:chart></c:chartSpace>`;

const DG = `xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${RNS}"`;
const dgmData = `${XMLDECL}<dgm:dataModel ${DG}><dgm:ptLst><dgm:pt modelId="{A0000000-0000-0000-0000-000000000000}" type="doc"><dgm:prSet loTypeId="urn:microsoft.com/office/officeart/2005/8/layout/default"/><dgm:spPr/><dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></dgm:t></dgm:pt><dgm:pt modelId="{B0000000-0000-0000-0000-000000000000}"><dgm:prSet phldrT="[Text]"/><dgm:spPr/><dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>QZSMARTNODE</a:t></a:r></a:p></dgm:t></dgm:pt><dgm:pt modelId="{C0000000-0000-0000-0000-000000000000}" type="parTrans" cxnId="{D0000000-0000-0000-0000-000000000000}"><dgm:prSet/><dgm:spPr/><dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></dgm:t></dgm:pt></dgm:ptLst><dgm:cxnLst><dgm:cxn modelId="{D0000000-0000-0000-0000-000000000000}" srcId="{A0000000-0000-0000-0000-000000000000}" destId="{B0000000-0000-0000-0000-000000000000}" srcOrd="0" destOrd="0"/></dgm:cxnLst><dgm:bg/><dgm:whole/><dgm:extLst><a:ext uri="http://schemas.microsoft.com/office/drawing/2008/diagram"><dsp:dataModelExt xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram" relId="rIdDgmDrawing" minVer="http://schemas.openxmlformats.org/drawingml/2006/diagram"/></a:ext></dgm:extLst></dgm:dataModel>`;
const dgmDrawing = `${XMLDECL}<dsp:drawing xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><dsp:spTree><dsp:nvGrpSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvGrpSpPr/></dsp:nvGrpSpPr><dsp:grpSpPr/><dsp:sp modelId="{E0000000-0000-0000-0000-000000000000}"><dsp:nvSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvSpPr/></dsp:nvSpPr><dsp:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="457200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></dsp:spPr><dsp:style><a:lnRef idx="0"><a:scrgbClr r="0" g="0" b="0"/></a:lnRef><a:fillRef idx="0"><a:scrgbClr r="0" g="0" b="0"/></a:fillRef><a:effectRef idx="0"><a:scrgbClr r="0" g="0" b="0"/></a:effectRef><a:fontRef idx="minor"/></dsp:style><dsp:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>QZSMARTNODE</a:t></a:r></a:p></dsp:txBody><dsp:txXfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="457200"/></dsp:txXfrm></dsp:sp></dsp:spTree></dsp:drawing>`;
const dgmLayout = `${XMLDECL}<dgm:layoutDef ${DG} uniqueId="urn:microsoft.com/office/officeart/2005/8/layout/default"><dgm:title val=""/><dgm:desc val=""/><dgm:catLst><dgm:cat type="list" pri="400"/></dgm:catLst><dgm:layoutNode name="diagram"/></dgm:layoutDef>`;
const dgmQs = `${XMLDECL}<dgm:styleDef ${DG} uniqueId="urn:microsoft.com/office/officeart/2005/8/quickstyle/simple1"><dgm:title val=""/><dgm:desc val=""/><dgm:catLst><dgm:cat type="simple" pri="10100"/></dgm:catLst></dgm:styleDef>`;
const dgmColors = `${XMLDECL}<dgm:colorsDef ${DG} uniqueId="urn:microsoft.com/office/officeart/2005/8/colors/accent1_2"><dgm:title val=""/><dgm:desc val=""/><dgm:catLst><dgm:cat type="accent1" pri="11200"/></dgm:catLst></dgm:colorsDef>`;

const core = `${XMLDECL}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>QZCORETITLE</dc:title><dc:subject>QZCORESUBJECT</dc:subject><dc:creator>QZCORECREATOR</dc:creator><cp:keywords>QZCOREKEYWORDS</cp:keywords><dc:description>QZCOREDESC</dc:description><cp:lastModifiedBy>QZCOREMODIFIER</cp:lastModifiedBy><cp:revision>2</cp:revision><dcterms:created xsi:type="dcterms:W3CDTF">2026-10-14T00:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">2026-10-14T00:00:00Z</dcterms:modified></cp:coreProperties>`;
const app = `${XMLDECL}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Template>Normal.dotm</Template><TotalTime>1</TotalTime><Pages>1</Pages><Words>10</Words><Application>Microsoft Office Word</Application><DocSecurity>0</DocSecurity><Lines>1</Lines><Paragraphs>1</Paragraphs><Manager>QZAPPMANAGER</Manager><Company>QZAPPCOMPANY</Company><LinksUpToDate>false</LinksUpToDate><AppVersion>16.0000</AppVersion></Properties>`;
const custom = `${XMLDECL}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="Client"><vt:lpwstr>QZCUSTOMPROP</vt:lpwstr></property></Properties>`;

// 1x1 transparent PNG
const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"));

const WML = "application/vnd.openxmlformats-officedocument.wordprocessingml";
const ct = `${XMLDECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="htm" ContentType="text/html"/>` +
  [
    ["/word/document.xml", `${WML}.document.main+xml`],
    ["/word/styles.xml", `${WML}.styles+xml`],
    ["/word/settings.xml", `${WML}.settings+xml`],
    ["/word/numbering.xml", `${WML}.numbering+xml`],
    ["/word/header1.xml", `${WML}.header+xml`],
    ["/word/header2.xml", `${WML}.header+xml`],
    ["/word/header3.xml", `${WML}.header+xml`],
    ["/word/footer1.xml", `${WML}.footer+xml`],
    ["/word/footer2.xml", `${WML}.footer+xml`],
    ["/word/footnotes.xml", `${WML}.footnotes+xml`],
    ["/word/endnotes.xml", `${WML}.endnotes+xml`],
    ["/word/comments.xml", `${WML}.comments+xml`],
    ["/word/glossary/document.xml", `${WML}.document.glossary+xml`],
    ["/word/charts/chart1.xml", "application/vnd.openxmlformats-officedocument.drawingml.chart+xml"],
    ["/word/diagrams/data1.xml", "application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml"],
    ["/word/diagrams/layout1.xml", "application/vnd.openxmlformats-officedocument.drawingml.diagramLayout+xml"],
    ["/word/diagrams/quickStyle1.xml", "application/vnd.openxmlformats-officedocument.drawingml.diagramStyle+xml"],
    ["/word/diagrams/colors1.xml", "application/vnd.openxmlformats-officedocument.drawingml.diagramColors+xml"],
    ["/word/diagrams/drawing1.xml", "application/vnd.ms-office.drawingml.diagramDrawing+xml"],
    ["/docProps/core.xml", "application/vnd.openxmlformats-package.core-properties+xml"],
    ["/docProps/app.xml", "application/vnd.openxmlformats-officedocument.extended-properties+xml"],
    ["/docProps/custom.xml", "application/vnd.openxmlformats-officedocument.custom-properties+xml"],
  ].map(([n, c]) => `<Override PartName="${n}" ContentType="${c}"/>`).join("") + `</Types>`;

const files = {
  "[Content_Types].xml": ct,
  "_rels/.rels": rels([
    ["rId1", "officeDocument", "word/document.xml"],
    ["rId2", "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties", "docProps/core.xml"],
    ["rId3", "extended-properties", "docProps/app.xml"],
    ["rId4", "custom-properties", "docProps/custom.xml"],
  ]),
  "docProps/core.xml": core,
  "docProps/app.xml": app,
  "docProps/custom.xml": custom,
  "word/document.xml": W_ROOT("document", `<w:body>${body}</w:body>`),
  "word/_rels/document.xml.rels": rels([
    ["rIdStyles", "styles", "styles.xml"],
    ["rIdSettings", "settings", "settings.xml"],
    ["rIdNum", "numbering", "numbering.xml"],
    ["rIdH1", "header", "header1.xml"],
    ["rIdH2", "header", "header2.xml"],
    ["rIdH3", "header", "header3.xml"],
    ["rIdF1", "footer", "footer1.xml"],
    ["rIdF2", "footer", "footer2.xml"],
    ["rIdFn", "footnotes", "footnotes.xml"],
    ["rIdEn", "endnotes", "endnotes.xml"],
    ["rIdCm", "comments", "comments.xml"],
    ["rIdGloss", "glossaryDocument", "glossary/document.xml"],
    ["rIdLink", "hyperlink", "https://qzlinkaddr.example/", true],
    ["rIdAlt", "aFChunk", "afchunk.htm"],
    ["rIdImg", "image", "media/image1.png"],
    ["rIdChart", "chart", "charts/chart1.xml"],
    ["rIdDgmData", "diagramData", "diagrams/data1.xml"],
    ["rIdDgmLayout", "diagramLayout", "diagrams/layout1.xml"],
    ["rIdDgmQs", "diagramQuickStyle", "diagrams/quickStyle1.xml"],
    ["rIdDgmColors", "diagramColors", "diagrams/colors1.xml"],
    ["rIdDgmDrawing", "http://schemas.microsoft.com/office/2007/relationships/diagramDrawing", "diagrams/drawing1.xml"],
  ]),
  "word/styles.xml": styles,
  "word/settings.xml": settings,
  "word/numbering.xml": numbering,
  "word/header1.xml": hdr("QZHEADERDEFAULT"),
  "word/header2.xml": hdr("QZHEADERFIRST"),
  "word/header3.xml": hdr("QZHEADEREVEN"),
  "word/footer1.xml": ftr("QZFOOTERDEFAULT"),
  "word/footer2.xml": ftr("QZFOOTERFIRST"),
  "word/footnotes.xml": footnotes,
  "word/endnotes.xml": endnotes,
  "word/comments.xml": comments,
  "word/glossary/document.xml": glossary,
  "word/afchunk.htm": altChunkHtml,
  "word/media/image1.png": png,
  "word/charts/chart1.xml": chart,
  "word/diagrams/data1.xml": dgmData,
  "word/diagrams/layout1.xml": dgmLayout,
  "word/diagrams/quickStyle1.xml": dgmQs,
  "word/diagrams/colors1.xml": dgmColors,
  "word/diagrams/drawing1.xml": dgmDrawing,
};

const zipIn = {};
for (const [name, v] of Object.entries(files)) {
  zipIn[name] = typeof v === "string" ? strToU8(v) : v;
  // each XML part also written out flat, for an xmllint well-formedness check
  if (process.argv[3] && (name.endsWith(".xml") || name.endsWith(".rels"))) {
    fs.mkdirSync(process.argv[3], { recursive: true });
    fs.writeFileSync(path.join(process.argv[3], name.replace(/[\/\[\]]/g, "_")), v);
  }
}
fs.writeFileSync(path.join(out, "probe-docx.docx"), zipSync(zipIn));
console.log("wrote", path.join(out, "probe-docx.docx"));
