// Hand-built PPTX probe: every text-bearing PresentationML construct carries one unique QZ marker.
// Usage: node pptx.mjs <outDir>
import { createRequire } from "node:module";
const { zipSync, strToU8 } = createRequire(new URL("../../../../core/package.json", import.meta.url))("fflate");
import { writeFileSync, mkdirSync } from "node:fs";

const out = process.argv[2];
mkdirSync(out, { recursive: true });

const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const PNS = `xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"`;
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";

const xfrm = (x = 838200, y = 365125, cx = 10515600, cy = 1325563) =>
  `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`;
const run = (t, rPr = '<a:rPr lang="en-US" dirty="0"/>') => `<a:r>${rPr}<a:t>${t}</a:t></a:r>`;
const para = (inner, pPr = "") => `<a:p>${pPr}${inner}</a:p>`;
const body = (...paras) => `<p:txBody><a:bodyPr/><a:lstStyle/>${paras.join("")}</p:txBody>`;
const emptyBody = () => `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody>`;
const fld = (type, t) =>
  `<a:fld id="{${crypto.randomUUID().toUpperCase()}}" type="${type}"><a:rPr lang="en-US"/><a:t>${t}</a:t></a:fld>`;

// A shape. ph = ' type="title"' etc., or null for a plain text box.
let nextId = 2;
const sp = (name, ph, txBody, { spPr = `<p:spPr>${xfrm()}</p:spPr>`, txBox = false, descr = "" } = {}) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${nextId++}" name="${name}"${descr}/><p:cNvSpPr${txBox ? ' txBox="1"' : ""}>${ph ? '<a:spLocks noGrp="1"/>' : ""}</p:cNvSpPr><p:nvPr>${ph ? `<p:ph${ph}/>` : ""}</p:nvPr></p:nvSpPr>${ph ? "<p:spPr/>" : spPr}${txBody}</p:sp>`;
const tree = (...shapes) =>
  `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes.join("")}</p:spTree>`;
const sldNumPh = (n) => sp("Slide Number Placeholder", ' type="sldNum" sz="quarter" idx="12"', body(para(fld("slidenum", String(n)))));
const ftrPh = () => sp("Footer Placeholder", ' type="ftr" sz="quarter" idx="11"', body(para(run("QZFOOTER"))));
const dtPh = () => sp("Date Placeholder", ' type="dt" sz="half" idx="10"', body(para(fld("datetime1", "QZDATEPH"))));
const slide = (shapes, { show = "" } = {}) =>
  `${DECL}<p:sld ${PNS}${show}><p:cSld>${tree(...shapes)}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
const rels = (list) =>
  `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list
    .map(([id, type, target, ext]) => `<Relationship Id="${id}" Type="${type.startsWith("http") ? type : REL + type}" Target="${target}"${ext ? ' TargetMode="External"' : ""}/>`)
    .join("")}</Relationships>`;

const files = {};
const put = (name, xml) => (files[name] = strToU8(xml));

// ---------- presentation order: slide2, slide1, slide3, slide5 (hidden), slide4 ----------
// slide part -> [rId, sldId]
const order = [
  ["slide2.xml", "rId3", 256],
  ["slide1.xml", "rId2", 257],
  ["slide3.xml", "rId4", 258],
  ["slide5.xml", "rId6", 259],
  ["slide4.xml", "rId5", 260],
];
const guid = () => `{${crypto.randomUUID().toUpperCase()}}`;

put(
  "ppt/presentation.xml",
  `${DECL}<p:presentation ${PNS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId7"/></p:notesMasterIdLst><p:sldIdLst>${order
    .map(([, rid, id]) => `<p:sldId id="${id}" r:id="${rid}"/>`)
    .join("")}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/><p:custShowLst><p:custShow name="QZCUSTSHOW" id="0"><p:sldLst><p:sld r:id="rId4"/><p:sld r:id="rId2"/></p:sldLst></p:custShow></p:custShowLst><p:defaultTextStyle><a:lvl1pPr marL="0"><a:defRPr sz="1800"/></a:lvl1pPr></p:defaultTextStyle><p:extLst><p:ext uri="{521415D9-36F7-43E2-AB2F-B90AF26B5E84}"><p14:sectionLst xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"><p14:section name="QZSECTIONONE" id="${guid()}"><p14:sldIdLst><p14:sldId id="256"/><p14:sldId id="257"/></p14:sldIdLst></p14:section><p14:section name="QZSECTIONTWO" id="${guid()}"><p14:sldIdLst><p14:sldId id="258"/><p14:sldId id="259"/><p14:sldId id="260"/></p14:sldIdLst></p14:section></p14:sectionLst></p:ext></p:extLst></p:presentation>`
);
put(
  "ppt/_rels/presentation.xml.rels",
  rels([
    ["rId1", "slideMaster", "slideMasters/slideMaster1.xml"],
    ["rId2", "slide", "slides/slide1.xml"],
    ["rId3", "slide", "slides/slide2.xml"],
    ["rId4", "slide", "slides/slide3.xml"],
    ["rId5", "slide", "slides/slide4.xml"],
    ["rId6", "slide", "slides/slide5.xml"],
    ["rId7", "notesMaster", "notesMasters/notesMaster1.xml"],
    ["rId8", "commentAuthors", "commentAuthors.xml"],
    ["rId9", "http://schemas.microsoft.com/office/2018/10/relationships/authors", "authors.xml"],
    ["rId10", "theme", "theme/theme1.xml"],
  ])
);

// ---------- theme (minimal, shared by master and notes master) ----------
const sysClr = (n, v) => `<a:${n}><a:srgbClr val="${v}"/></a:${n}>`;
const theme = (name) =>
  `${DECL}<a:theme xmlns:a="${NS_A}" name="${name}"><a:themeElements><a:clrScheme name="Office">${sysClr("dk1", "000000")}${sysClr("lt1", "FFFFFF")}${sysClr("dk2", "44546A")}${sysClr("lt2", "E7E6E6")}${sysClr("accent1", "4472C4")}${sysClr("accent2", "ED7D31")}${sysClr("accent3", "A5A5A5")}${sysClr("accent4", "FFC000")}${sysClr("accent5", "5B9BD5")}${sysClr("accent6", "70AD47")}${sysClr("hlink", "0563C1")}${sysClr("folHlink", "954F72")}</a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
put("ppt/theme/theme1.xml", theme("Office Theme"));
put("ppt/theme/theme2.xml", theme("Notes Theme"));

// ---------- master: placeholder prompts + decorative text box ----------
nextId = 2;
put(
  "ppt/slideMasters/slideMaster1.xml",
  `${DECL}<p:sldMaster ${PNS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>${tree(
    sp("Title Placeholder 1", ' type="title"', body(para(run("QZMASTERTITLEPROMPT")))),
    sp("Text Placeholder 2", ' type="body" idx="1"', body(para(run("QZMASTERBODYPROMPT"), '<a:pPr lvl="0"/>'))),
    sp("Date Placeholder 3", ' type="dt" sz="half" idx="2"', body(para(fld("datetime1", "QZMASTERDATE")))),
    sp("Footer Placeholder 4", ' type="ftr" sz="quarter" idx="3"', emptyBody()),
    sp("Slide Number Placeholder 5", ' type="sldNum" sz="quarter" idx="4"', body(para(fld("slidenum", "‹#›")))),
    sp("TextBox 6", null, body(para(run("QZMASTERDECOR"))), { txBox: true })
  )}</p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/><p:sldLayoutId id="2147483650" r:id="rId2"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2800"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`
);
put(
  "ppt/slideMasters/_rels/slideMaster1.xml.rels",
  rels([
    ["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"],
    ["rId2", "slideLayout", "../slideLayouts/slideLayout2.xml"],
    ["rId3", "theme", "../theme/theme1.xml"],
  ])
);

// ---------- layouts ----------
const layout = (name, type, shapes) =>
  `${DECL}<p:sldLayout ${PNS} type="${type}" preserve="1"><p:cSld name="${name}">${tree(...shapes)}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
nextId = 2;
put(
  "ppt/slideLayouts/slideLayout1.xml",
  layout("Title Slide", "title", [
    sp("Title 1", ' type="ctrTitle"', body(para(run("QZLAYOUTTITLEPROMPT")))),
    sp("Subtitle 2", ' type="subTitle" idx="1"', body(para(run("QZLAYOUTSUBPROMPT")))),
  ])
);
nextId = 2;
put(
  "ppt/slideLayouts/slideLayout2.xml",
  layout("Title and Content", "obj", [
    sp("Title 1", ' type="title"', emptyBody()),
    sp("Content Placeholder 2", ' idx="1"', body(para(run("QZLAYOUTPROMPT")))),
    sp("TextBox 3", null, body(para(run("QZLAYOUTDECOR"))), { txBox: true }),
  ])
);
for (const n of [1, 2]) put(`ppt/slideLayouts/_rels/slideLayout${n}.xml.rels`, rels([["rId1", "slideMaster", "../slideMasters/slideMaster1.xml"]]));

// ---------- slide2.xml (presentation position 1): title slide ----------
nextId = 2;
put(
  "ppt/slides/slide2.xml",
  slide([
    sp("Title 1", ' type="ctrTitle"', body(para(run("QZCTRTITLE")))),
    sp("Subtitle 2", ' type="subTitle" idx="1"', body(para(run("QZSUBTITLE")))),
    dtPh(),
    ftrPh(),
    sldNumPh(1),
  ])
);
put("ppt/slides/_rels/slide2.xml.rels", rels([["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"]]));

// ---------- slide1.xml (position 2): title/body, text box, groups, picture, link, fields, notes ----------
nextId = 2;
const grpHead = (id, name) =>
  `<p:nvGrpSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="838200" y="4000000"/><a:ext cx="4000000" cy="1000000"/><a:chOff x="838200" y="4000000"/><a:chExt cx="4000000" cy="1000000"/></a:xfrm></p:grpSpPr>`;
const title1 = sp("Title 1", ' type="title"', body(para(run("QZTITLE"))));
const body1 = sp(
  "Content Placeholder 2",
  ' idx="1"',
  body(para(run("QZBODYONE")), para(run("QZBODYTWO"), '<a:pPr lvl="1"/>'), para(run("Read QZLINKPRE ") + run("QZLINKTEXT", '<a:rPr lang="en-US"><a:hlinkClick r:id="rId3"/></a:rPr>') + run(" QZLINKPOST.")))
);
const textbox1 = sp("TextBox 3", null, body(para(run("QZTEXTBOX"))), { txBox: true });
const fields1 = sp("TextBox 4", null, body(para(run("Slide ") + fld("slidenum", "QZFLDSLIDENUM") + run(" on ") + fld("datetime1", "QZFLDDATETIME"))), { txBox: true });
const outer = sp("TextBox 6", null, body(para(run("QZGROUPOUTER"))), { txBox: true });
const inner = sp("TextBox 8", null, body(para(run("QZGROUPINNER"))), { txBox: true });
const group1 = `<p:grpSp>${grpHead(20, "Group 19")}${outer}<p:grpSp>${grpHead(21, "Group 20")}${inner}</p:grpSp></p:grpSp>`;
const pic1 = `<p:pic><p:nvPicPr><p:cNvPr id="30" name="Picture 29" descr="QZALTTEXT"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId4"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(6000000, 4000000, 1000000, 1000000)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
put("ppt/slides/slide1.xml", slide([title1, body1, textbox1, group1, pic1, fields1, dtPh(), ftrPh(), sldNumPh(2)]));
put(
  "ppt/slides/_rels/slide1.xml.rels",
  rels([
    ["rId1", "slideLayout", "../slideLayouts/slideLayout2.xml"],
    ["rId2", "notesSlide", "../notesSlides/notesSlide1.xml"],
    ["rId3", "hyperlink", "https://example.com/QZLINKTARGET", true],
    ["rId4", "image", "../media/image1.png"],
  ])
);
// 1x1 transparent PNG
files["ppt/media/image1.png"] = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64")
);

// ---------- notes for slide1 + notes master ----------
nextId = 2;
put(
  "ppt/notesSlides/notesSlide1.xml",
  `${DECL}<p:notes ${PNS}><p:cSld>${tree(
    `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>`,
    sp("Notes Placeholder 2", ' type="body" idx="1"', body(para(run("QZNOTESBODY")))),
    sp("Slide Number Placeholder 3", ' type="sldNum" sz="quarter" idx="5"', body(para(fld("slidenum", "2"))))
  )}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`
);
put(
  "ppt/notesSlides/_rels/notesSlide1.xml.rels",
  rels([
    ["rId1", "notesMaster", "../notesMasters/notesMaster1.xml"],
    ["rId2", "slide", "../slides/slide1.xml"],
  ])
);
nextId = 2;
put(
  "ppt/notesMasters/notesMaster1.xml",
  `${DECL}<p:notesMaster ${PNS}><p:cSld>${tree(
    sp("Header Placeholder 1", ' type="hdr" sz="quarter"', body(para(run("QZNOTESMASTERHDR")))),
    sp("Notes Placeholder 4", ' type="body" sz="quarter" idx="3"', body(para(run("QZNOTESMASTERPROMPT"))))
  )}</p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:notesMaster>`
);
put("ppt/notesMasters/_rels/notesMaster1.xml.rels", rels([["rId1", "theme", "../theme/theme2.xml"]]));

// ---------- slide3.xml (position 3): table with merges + chart + modern comment ----------
nextId = 2;
const tc = (t, attrs = "") => `<a:tc${attrs}><a:txBody><a:bodyPr/><a:lstStyle/>${t ? para(run(t)) : '<a:p><a:endParaRPr lang="en-US"/></a:p>'}</a:txBody><a:tcPr/></a:tc>`;
const tr = (...cells) => `<a:tr h="370840">${cells.join("")}</a:tr>`;
const table = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="40" name="Table 39"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="838200" y="1825625"/><a:ext cx="6000000" cy="1112520"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid><a:gridCol w="2000000"/><a:gridCol w="2000000"/><a:gridCol w="2000000"/></a:tblGrid>${tr(
  tc("QZSPANH", ' gridSpan="2"'),
  tc("QZHMERGEGHOST", ' hMerge="1"'),
  tc("QZCELLC")
)}${tr(tc("QZSPANV", ' rowSpan="2"'), tc("QZCELLE"), tc("QZCELLF"))}${tr(tc("QZVMERGEGHOST", ' vMerge="1"'), tc("QZCELLH"), tc("QZCELLI"))}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
const chartFrame = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="41" name="Chart 40"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="7000000" y="1825625"/><a:ext cx="4000000" cy="3000000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId2"/></a:graphicData></a:graphic></p:graphicFrame>`;
put("ppt/slides/slide3.xml", slide([sp("Title 1", ' type="title"', body(para(run("QZTABLESLIDE")))), table, chartFrame, ftrPh(), sldNumPh(3)]));
put(
  "ppt/slides/_rels/slide3.xml.rels",
  rels([
    ["rId1", "slideLayout", "../slideLayouts/slideLayout2.xml"],
    ["rId2", "chart", "../charts/chart1.xml"],
    ["rId3", "http://schemas.microsoft.com/office/2018/10/relationships/comments", "../comments/modernComment_102_ABCD1234.xml"],
  ])
);
const rich = (t) => `<c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>${t}</a:t></a:r></a:p></c:rich></c:tx>`;
const shows = (v) => ["showLegendKey", "showVal", "showCatName", "showSerName", "showPercent", "showBubbleSize"].map((n) => `<c:${n} val="${n === "showVal" ? v : 0}"/>`).join("");
put(
  "ppt/charts/chart1.xml",
  `${DECL}<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="${NS_A}" xmlns:r="${NS_R}"><c:date1904 val="0"/><c:chart><c:title>${rich("QZCHARTTITLE")}<c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:f>Sheet1!$B$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>QZSERIESNAME</c:v></c:pt></c:strCache></c:strRef></c:tx><c:invertIfNegative val="0"/><c:dLbls><c:dLbl><c:idx val="0"/>${rich("QZDATALABEL")}${shows(1)}</c:dLbl>${shows(1)}</c:dLbls><c:cat><c:strRef><c:f>Sheet1!$A$2:$A$3</c:f><c:strCache><c:ptCount val="2"/><c:pt idx="0"><c:v>QZCATONE</c:v></c:pt><c:pt idx="1"><c:v>QZCATTWO</c:v></c:pt></c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>Sheet1!$B$2:$B$3</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="2"/><c:pt idx="0"><c:v>4242.5</c:v></c:pt><c:pt idx="1"><c:v>7373.25</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser><c:gapWidth val="219"/><c:axId val="111"/><c:axId val="222"/></c:barChart><c:catAx><c:axId val="111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:title>${rich("QZAXISTITLE")}<c:overlay val="0"/></c:title><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="222"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx><c:valAx><c:axId val="222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="111"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx></c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`
);
const AUTH = "{6E2F1B3A-1111-4C2D-9E8F-000000000001}";
put(
  "ppt/comments/modernComment_102_ABCD1234.xml",
  `${DECL}<p188:cmLst xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p188="http://schemas.microsoft.com/office/powerpoint/2018/8/main"><p188:cm id="{6E2F1B3A-2222-4C2D-9E8F-000000000002}" authorId="${AUTH}" created="2026-10-01T10:00:00.000"><pc:sldMkLst xmlns:pc="http://schemas.microsoft.com/office/powerpoint/2013/main/command"><pc:docMk/><pc:sldMk cId="2882348084" sldId="258"/></pc:sldMkLst><p188:replyLst><p188:reply id="{6E2F1B3A-3333-4C2D-9E8F-000000000003}" authorId="${AUTH}" created="2026-10-01T11:00:00.000"><p188:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>QZMODERNREPLY</a:t></a:r></a:p></p188:txBody></p188:reply></p188:replyLst><p188:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>QZMODERNCOMMENT</a:t></a:r></a:p></p188:txBody></p188:cm></p188:cmLst>`
);
put(
  "ppt/authors.xml",
  `${DECL}<p188:authorLst xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p188="http://schemas.microsoft.com/office/powerpoint/2018/8/main"><p188:author id="${AUTH}" name="QZMODERNAUTHOR" initials="QM" userId="QZMODERNAUTHOR" providerId="None"/></p188:authorLst>`
);

// ---------- slide4.xml (position 5): SmartArt + legacy comment + unfilled body placeholder ----------
nextId = 2;
const dgmFrame = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="50" name="Diagram 49"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="838200" y="1825625"/><a:ext cx="6000000" cy="3000000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram"><dgm:relIds xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" r:dm="rId2" r:lo="rId3" r:qs="rId4" r:cs="rId5"/></a:graphicData></a:graphic></p:graphicFrame>`;
put(
  "ppt/slides/slide4.xml",
  slide([sp("Title 1", ' type="title"', body(para(run("QZSMARTSLIDE")))), sp("Content Placeholder 2", ' idx="1"', emptyBody()), dgmFrame, ftrPh(), sldNumPh(5)])
);
put(
  "ppt/slides/_rels/slide4.xml.rels",
  rels([
    ["rId1", "slideLayout", "../slideLayouts/slideLayout2.xml"],
    ["rId2", "diagramData", "../diagrams/data1.xml"],
    ["rId3", "diagramLayout", "../diagrams/layout1.xml"],
    ["rId4", "diagramQuickStyle", "../diagrams/quickStyle1.xml"],
    ["rId5", "diagramColors", "../diagrams/colors1.xml"],
    ["rId6", "http://schemas.microsoft.com/office/2007/relationships/diagramDrawing", "../diagrams/drawing1.xml"],
    ["rId7", "comments", "../comments/comment1.xml"],
  ])
);
const DGM = 'xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"';
const pt = (id, t, type = "") =>
  `<dgm:pt modelId="${id}"${type}><dgm:prSet/><dgm:spPr/>${t === null ? "" : `<dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>${t}</a:t></a:r></a:p></dgm:t>`}</dgm:pt>`;
put(
  "ppt/diagrams/data1.xml",
  `${DECL}<dgm:dataModel ${DGM} xmlns:a="${NS_A}" xmlns:r="${NS_R}"><dgm:ptLst><dgm:pt modelId="{00000000-0000-0000-0000-000000000000}" type="doc"><dgm:prSet loTypeId="urn:microsoft.com/office/officeart/2005/8/layout/default"/><dgm:spPr/><dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></dgm:t></dgm:pt>${pt("{11111111-0000-0000-0000-000000000001}", "QZSMARTONE")}${pt("{11111111-0000-0000-0000-000000000002}", "QZSMARTTWO")}${pt("{22222222-0000-0000-0000-000000000001}", null, ' type="parTrans" cxnId="{33333333-0000-0000-0000-000000000001}"')}${pt("{22222222-0000-0000-0000-000000000002}", null, ' type="sibTrans" cxnId="{33333333-0000-0000-0000-000000000001}"')}</dgm:ptLst><dgm:cxnLst><dgm:cxn modelId="{33333333-0000-0000-0000-000000000001}" srcId="{00000000-0000-0000-0000-000000000000}" destId="{11111111-0000-0000-0000-000000000001}" srcOrd="0" destOrd="0" parTransId="{22222222-0000-0000-0000-000000000001}" sibTransId="{22222222-0000-0000-0000-000000000002}"/><dgm:cxn modelId="{33333333-0000-0000-0000-000000000002}" srcId="{00000000-0000-0000-0000-000000000000}" destId="{11111111-0000-0000-0000-000000000002}" srcOrd="1" destOrd="0"/></dgm:cxnLst><dgm:bg/><dgm:whole/><dgm:extLst><a:ext uri="http://schemas.microsoft.com/office/drawing/2008/diagram"><dsp:dataModelExt xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram" relId="rId6" minVer="http://schemas.openxmlformats.org/drawingml/2006/diagram"/></a:ext></dgm:extLst></dgm:dataModel>`
);
put("ppt/diagrams/layout1.xml", `${DECL}<dgm:layoutDef ${DGM} xmlns:a="${NS_A}" uniqueId="urn:microsoft.com/office/officeart/2005/8/layout/default"><dgm:layoutNode name="diagram"/></dgm:layoutDef>`);
put("ppt/diagrams/quickStyle1.xml", `${DECL}<dgm:styleDef ${DGM} xmlns:a="${NS_A}" uniqueId="urn:microsoft.com/office/officeart/2005/8/quickstyle/simple1"/>`);
put("ppt/diagrams/colors1.xml", `${DECL}<dgm:colorsDef ${DGM} xmlns:a="${NS_A}" uniqueId="urn:microsoft.com/office/officeart/2005/8/colors/accent1_2"/>`);
const dspSp = (id, t, x) =>
  `<dsp:sp modelId="${id}"><dsp:nvSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvSpPr/></dsp:nvSpPr><dsp:spPr>${xfrm(x, 0, 2000000, 1200000)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></dsp:spPr><dsp:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>${t}</a:t></a:r></a:p></dsp:txBody><dsp:txXfrm><a:off x="${x}" y="0"/><a:ext cx="2000000" cy="1200000"/></dsp:txXfrm></dsp:sp>`;
put(
  "ppt/diagrams/drawing1.xml",
  `${DECL}<dsp:drawing xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram" xmlns:a="${NS_A}"><dsp:spTree><dsp:nvGrpSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvGrpSpPr/></dsp:nvGrpSpPr><dsp:grpSpPr/>${dspSp("{44444444-0000-0000-0000-000000000001}", "QZSMARTONE", 0)}${dspSp("{44444444-0000-0000-0000-000000000002}", "QZSMARTTWO", 2500000)}</dsp:spTree></dsp:drawing>`
);
put(
  "ppt/comments/comment1.xml",
  `${DECL}<p:cmLst ${PNS}><p:cm authorId="0" dt="2026-10-01T09:00:00.000" idx="1"><p:pos x="10" y="10"/><p:text>QZLEGACYCOMMENT</p:text></p:cm></p:cmLst>`
);
put(
  "ppt/commentAuthors.xml",
  `${DECL}<p:cmAuthorLst ${PNS}><p:cmAuthor id="0" name="QZLEGACYAUTHOR" initials="QL" lastIdx="1" clrIdx="0"/></p:cmAuthorLst>`
);

// ---------- slide5.xml (position 4): hidden ----------
nextId = 2;
put(
  "ppt/slides/slide5.xml",
  slide([sp("Title 1", ' type="title"', body(para(run("QZHIDDENTITLE")))), sp("Content Placeholder 2", ' idx="1"', body(para(run("QZHIDDENBODY")))), sldNumPh(4)], { show: ' show="0"' })
);
put("ppt/slides/_rels/slide5.xml.rels", rels([["rId1", "slideLayout", "../slideLayouts/slideLayout2.xml"]]));

// ---------- package ----------
put(
  "docProps/core.xml",
  `${DECL}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>QZDOCTITLE</dc:title><dc:creator>QZDOCCREATOR</dc:creator><cp:lastModifiedBy>Probe</cp:lastModifiedBy><cp:revision>1</cp:revision><dcterms:created xsi:type="dcterms:W3CDTF">2026-10-01T09:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">2026-10-01T09:00:00Z</dcterms:modified></cp:coreProperties>`
);
put(
  "docProps/app.xml",
  `${DECL}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Office PowerPoint</Application><Slides>5</Slides><Notes>1</Notes><HiddenSlides>1</HiddenSlides><Company>QZCOMPANY</Company><AppVersion>16.0000</AppVersion></Properties>`
);
put(
  "_rels/.rels",
  rels([
    ["rId1", "officeDocument", "ppt/presentation.xml"],
    ["rId2", "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties", "docProps/core.xml"],
    ["rId3", "extended-properties", "docProps/app.xml"],
  ])
);
const PML = "application/vnd.openxmlformats-officedocument.presentationml";
const DML = "application/vnd.openxmlformats-officedocument.drawingml";
const over = {
  "/ppt/presentation.xml": `${PML}.presentation.main+xml`,
  "/ppt/slideMasters/slideMaster1.xml": `${PML}.slideMaster+xml`,
  "/ppt/slideLayouts/slideLayout1.xml": `${PML}.slideLayout+xml`,
  "/ppt/slideLayouts/slideLayout2.xml": `${PML}.slideLayout+xml`,
  "/ppt/notesMasters/notesMaster1.xml": `${PML}.notesMaster+xml`,
  "/ppt/notesSlides/notesSlide1.xml": `${PML}.notesSlide+xml`,
  "/ppt/theme/theme1.xml": "application/vnd.openxmlformats-officedocument.theme+xml",
  "/ppt/theme/theme2.xml": "application/vnd.openxmlformats-officedocument.theme+xml",
  "/ppt/charts/chart1.xml": `${DML}.chart+xml`,
  "/ppt/diagrams/data1.xml": `${DML}.diagramData+xml`,
  "/ppt/diagrams/layout1.xml": `${DML}.diagramLayout+xml`,
  "/ppt/diagrams/quickStyle1.xml": `${DML}.diagramStyle+xml`,
  "/ppt/diagrams/colors1.xml": `${DML}.diagramColors+xml`,
  "/ppt/diagrams/drawing1.xml": "application/vnd.ms-office.drawingml.diagramDrawing+xml",
  "/ppt/comments/comment1.xml": `${PML}.comments+xml`,
  "/ppt/commentAuthors.xml": `${PML}.commentAuthors+xml`,
  "/ppt/comments/modernComment_102_ABCD1234.xml": "application/vnd.ms-powerpoint.comments+xml",
  "/ppt/authors.xml": "application/vnd.ms-powerpoint.authors+xml",
  "/docProps/core.xml": "application/vnd.openxmlformats-package.core-properties+xml",
  "/docProps/app.xml": "application/vnd.openxmlformats-officedocument.extended-properties+xml",
};
for (let i = 1; i <= 5; i++) over[`/ppt/slides/slide${i}.xml`] = `${PML}.slide+xml`;
put(
  "[Content_Types].xml",
  `${DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>${Object.entries(
    over
  )
    .map(([p, t]) => `<Override PartName="${p}" ContentType="${t}"/>`)
    .join("")}</Types>`
);

// [Content_Types].xml first, as Office writes it.
const ordered = { "[Content_Types].xml": files["[Content_Types].xml"], ...files };
writeFileSync(`${out}/gen-pptx-coverage.pptx`, zipSync(ordered));
// Unzipped copy for the well-formedness check, when a second directory is given.
if (process.argv[3]) for (const [name, data] of Object.entries(files)) {
  const path = `${process.argv[3]}/${name}`;
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  writeFileSync(path, data);
}
console.log("wrote", Object.keys(files).length, "parts");
