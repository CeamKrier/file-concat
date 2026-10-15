// Hand-built ODT/ODS/ODP probes. Every construct carries a unique QZ marker.
import { createRequire } from "node:module";
const { zipSync, strToU8 } = createRequire(new URL("../../../../core/package.json", import.meta.url))("fflate");
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });

const NS = `xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:chart="urn:oasis:names:tc:opendocument:xmlns:chart:1.0" xmlns:form="urn:oasis:names:tc:opendocument:xmlns:form:1.0" xmlns:script="urn:oasis:names:tc:opendocument:xmlns:script:1.0" xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2" xmlns:ooow="http://openoffice.org/2004/writer" xmlns:oooc="http://openoffice.org/2004/calc" office:version="1.3"`;
const HDR = `<?xml version="1.0" encoding="UTF-8"?>\n`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

const meta = (title, extra = "") => `${HDR}<office:document-meta ${NS}><office:meta><meta:generator>LibreOffice/7.6</meta:generator>${title}${extra}</office:meta></office:document-meta>`;
const manifest = (mime, extra = []) => `${HDR}<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
 <manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="${mime}"/>
 <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
 <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
 <manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
${extra.map(([p, t]) => ` <manifest:file-entry manifest:full-path="${p}" manifest:media-type="${t}"/>`).join("\n")}
</manifest:manifest>`;

function pack(name, mime, parts, extraManifest = []) {
  const files = {
    mimetype: [strToU8(mime), { level: 0 }],
    "META-INF/manifest.xml": strToU8(manifest(mime, extraManifest)),
  };
  for (const [p, v] of Object.entries(parts)) files[p] = typeof v === "string" ? strToU8(v) : v;
  // mimetype first: object key order is insertion order for string keys
  writeFileSync(`${OUT}/${name}`, zipSync(files));
  return parts;
}

// ---------------- ODT ----------------
const odtContent = `${HDR}<office:document-content ${NS}>
<office:automatic-styles>
 <style:style style:name="Sect1" style:family="section"><style:section-properties/></style:style>
 <style:style style:name="Tbl" style:family="table"><style:table-properties style:width="16cm"/></style:style>
</office:automatic-styles>
<office:body><office:text>
<office:forms form:automatic-focus="false" form:apply-design-mode="false">
 <form:form form:name="Form">
  <form:text form:name="TextBox1" form:control-implementation="ooo:com.sun.star.form.component.TextField" xml:id="control1" form:id="control1" form:current-value="QZFORMCURRENT" form:value="QZFORMVALUE"/>
 </form:form>
</office:forms>
<text:tracked-changes text:track-changes="false">
 <text:changed-region xml:id="ct1" text:id="ct1"><text:insertion><office:change-info><dc:creator>QZCHGAUTHOR</dc:creator><dc:date>2026-01-01T10:00:00</dc:date></office:change-info></text:insertion></text:changed-region>
 <text:changed-region xml:id="ct2" text:id="ct2"><text:deletion><office:change-info><dc:creator>QZDELAUTHOR</dc:creator><dc:date>2026-01-01T10:01:00</dc:date></office:change-info><text:p>QZDELETED</text:p></text:deletion></text:changed-region>
</text:tracked-changes>
<text:sequence-decls><text:sequence-decl text:display-outline-level="0" text:name="Illustration"/><text:sequence-decl text:display-outline-level="0" text:name="Table"/></text:sequence-decls>
<text:variable-decls><text:variable-decl office:value-type="string" text:name="myvar"/></text:variable-decls>
<text:table-of-content text:style-name="Sect1" text:protected="true" text:name="Table of Contents1">
 <text:table-of-content-source text:outline-level="10"><text:index-title-template text:style-name="Contents_20_Heading">QZTOCTEMPLATE</text:index-title-template></text:table-of-content-source>
 <text:index-body>
  <text:index-title text:style-name="Sect1" text:name="Table of Contents1_Head"><text:p text:style-name="Contents_20_Heading">QZTOCTITLE</text:p></text:index-title>
  <text:p text:style-name="Contents_20_1"><text:a xlink:type="simple" xlink:href="#__RefHeading___Toc1_1" text:style-name="Index_20_Link">QZTOCENTRY<text:tab/>1</text:a></text:p>
 </text:index-body>
</text:table-of-content>
<text:h text:style-name="Heading_20_1" text:outline-level="1"><text:bookmark-start text:name="__RefHeading___Toc1_1"/>QZHEADONE<text:bookmark-end text:name="__RefHeading___Toc1_1"/></text:h>
<text:p text:style-name="Standard">QZPARA plain paragraph.</text:p>
<text:h text:style-name="Heading_20_2" text:outline-level="2">QZHEADTWO</text:h>
<text:p text:style-name="Standard">QZSP<text:span text:style-name="T1">LITWORD</text:span> then QZLINEA<text:line-break/>QZLINEB then QZTABA<text:tab/>QZTABB then QZSPACEA<text:s text:c="3"/>QZSPACEB<text:bookmark text:name="QZBOOKMARKNAME"/>.</text:p>
<text:list xml:id="list1" text:style-name="Numbering_20_123">
 <text:list-header><text:p text:style-name="List">QZLISTHEADER</text:p></text:list-header>
 <text:list-item text:start-value="7"><text:number>7.</text:number><text:p text:style-name="List">QZNUMITEMONE</text:p></text:list-item>
 <text:list-item><text:number>8.</text:number><text:p text:style-name="List">QZNUMITEMTWO</text:p>
  <text:list><text:list-item><text:number>8.1.</text:number><text:p text:style-name="List">QZNUMNESTED</text:p></text:list-item></text:list>
 </text:list-item>
</text:list>
<text:list xml:id="list2" text:style-name="List_20_1">
 <text:list-item><text:p text:style-name="List">QZBULLETITEM</text:p></text:list-item>
</text:list>
<text:p text:style-name="Standard">See <text:a xlink:type="simple" xlink:href="https://example.com/QZLINKHREF" office:title="QZLINKTITLE">QZLINKTEXT</text:a> here.</text:p>
<text:p text:style-name="Standard">QZFNANCHOR<text:note text:id="ftn1" text:note-class="footnote"><text:note-citation text:label="QZFNCITE">QZFNCITE</text:note-citation><text:note-body><text:p text:style-name="Footnote">QZFNBODY</text:p></text:note-body></text:note> after footnote.</text:p>
<text:p text:style-name="Standard">QZENANCHOR<text:note text:id="edn1" text:note-class="endnote"><text:note-citation>i</text:note-citation><text:note-body><text:p text:style-name="Endnote">QZENBODY</text:p></text:note-body></text:note> after endnote.</text:p>
<text:p text:style-name="Standard">QZANNANCHOR<office:annotation office:name="__Annotation__1"><dc:creator>QZANNAUTHOR</dc:creator><dc:date>2026-01-02T09:00:00</dc:date><meta:creator-initials>QZANNINITIALS</meta:creator-initials><text:p>QZANNBODY</text:p></office:annotation>QZANNRANGE<office:annotation-end office:name="__Annotation__1"/> after annotation.</text:p>
<text:p text:style-name="Standard">QZTCBEFORE <text:change-start text:change-id="ct1"/>QZINSERTED<text:change-end text:change-id="ct1"/> <text:change text:change-id="ct2"/>QZTCAFTER</text:p>
<text:section text:style-name="Sect1" text:name="Section1"><text:p text:style-name="Standard">QZSECTION</text:p></text:section>
<text:section text:style-name="Sect1" text:name="Section2" text:display="none"><text:p text:style-name="Standard">QZHIDDENSECTION</text:p></text:section>
<text:p text:style-name="Standard">QZHTBEFORE <text:hidden-text text:condition="ooow:1==1" text:string-value="QZHIDDENTEXT" text:is-hidden="true">QZHIDDENTEXT</text:hidden-text> QZHTAFTER</text:p>
<text:p text:style-name="Standard"><text:hidden-paragraph text:condition="ooow:1==1" text:is-hidden="true"/>QZHIDDENPARA</text:p>
<text:p text:style-name="Standard">QZCTBEFORE <text:conditional-text text:condition="ooow:1==1" text:string-value-if-true="QZCONDTRUE" text:string-value-if-false="QZCONDFALSE" text:current-value="true">QZCONDTRUE</text:conditional-text></text:p>
<text:p text:style-name="Standard">Page <text:page-number text:select-page="current">QZPAGENUM</text:page-number> date <text:date style:data-style-name="N37" text:date-value="2026-01-03">QZDATEFIELD</text:date> title <text:title>QZTITLEFIELD</text:title> fig <text:sequence text:ref-name="refIllustration0" text:name="Illustration" text:formula="ooow:Illustration+1" style:num-format="1">QZSEQ</text:sequence> var <text:variable-set text:name="myvar" office:value-type="string">QZVARSET</text:variable-set> hidvar <text:variable-set text:name="myvar" text:display="none" office:value-type="string">QZVARNONE</text:variable-set>.</text:p>
<text:p text:style-name="Standard"><text:ruby text:style-name="Ru1"><text:ruby-base>QZRUBYBASE</text:ruby-base><text:ruby-text>QZRUBYTEXT</text:ruby-text></text:ruby> after ruby.</text:p>
<table:table table:name="QZTABLENAME" table:style-name="Tbl">
 <table:title>QZTABLETITLE</table:title><table:desc>QZTABLEDESC</table:desc>
 <table:table-column table:number-columns-repeated="3"/>
 <table:table-header-rows><table:table-row>
  <table:table-cell office:value-type="string"><text:p>QZTHA</text:p></table:table-cell>
  <table:table-cell office:value-type="string"><text:p>QZTHB</text:p></table:table-cell>
  <table:table-cell office:value-type="string"><text:p>QZTHC</text:p></table:table-cell>
 </table:table-row></table:table-header-rows>
 <table:table-row>
  <table:table-cell table:number-columns-spanned="2" office:value-type="string"><text:p>QZSPANCELL</text:p></table:table-cell>
  <table:covered-table-cell><text:p>QZCOVEREDCELL</text:p></table:covered-table-cell>
  <table:table-cell office:value-type="string"><text:p>QZCELLC1</text:p></table:table-cell>
 </table:table-row>
 <table:table-row>
  <table:table-cell office:value-type="string"><text:p>QZCELLA2</text:p></table:table-cell>
  <table:table-cell>
   <table:table table:name="Inner">
    <table:table-column table:number-columns-repeated="2"/>
    <table:table-row><table:table-cell><text:p>QZNESTEDA</text:p></table:table-cell><table:table-cell><text:p>QZNESTEDB</text:p></table:table-cell></table:table-row>
   </table:table>
  </table:table-cell>
  <table:table-cell office:value-type="string"><text:p>QZCELLC2A</text:p><text:p>QZCELLC2B</text:p></table:table-cell>
 </table:table-row>
</table:table>
<text:p text:style-name="Standard">QZFRAMEANCHOR<draw:frame draw:style-name="fr1" draw:name="Frame1" text:anchor-type="paragraph" svg:width="5cm" draw:z-index="0"><draw:text-box fo:min-height="1cm"><text:p text:style-name="Frame_20_contents">QZTEXTBOX</text:p></draw:text-box></draw:frame></text:p>
<text:p text:style-name="Standard"><draw:frame draw:style-name="fr2" draw:name="Image1" text:anchor-type="paragraph" svg:width="2cm" svg:height="2cm" draw:z-index="1"><draw:image xlink:href="Pictures/img1.png" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad" draw:mime-type="image/png"><text:p>QZIMAGETEXT</text:p></draw:image><svg:title>QZALTTITLE</svg:title><svg:desc>QZALTDESC</svg:desc></draw:frame></text:p>
<text:p text:style-name="Standard">Form: <draw:control text:anchor-type="as-char" draw:z-index="2" draw:name="TextBox1" svg:width="4cm" svg:height="0.6cm" draw:control="control1"/></text:p>
<text:p text:style-name="Standard">QZLASTPARA</text:p>
</office:text></office:body></office:document-content>`;

const odtStyles = `${HDR}<office:document-styles ${NS}>
<office:styles><style:style style:name="Standard" style:family="paragraph" style:class="text"/></office:styles>
<office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm"/><style:header-style/><style:footer-style/></style:page-layout></office:automatic-styles>
<office:master-styles>
 <style:master-page style:name="Standard" style:page-layout-name="pm1">
  <style:header><text:p text:style-name="Header">QZHEADER</text:p></style:header>
  <style:header-first><text:p text:style-name="Header">QZHEADERFIRST</text:p></style:header-first>
  <style:footer><text:p text:style-name="Footer">QZFOOTER <text:page-number text:select-page="current">1</text:page-number></text:p></style:footer>
  <style:footer-left><text:p text:style-name="Footer">QZFOOTERLEFT</text:p></style:footer-left>
 </style:master-page>
</office:master-styles></office:document-styles>`;

const odtMeta = meta(`<dc:title>QZMETATITLE</dc:title><dc:subject>QZMETASUBJECT</dc:subject><dc:description>QZMETADESC</dc:description><meta:keyword>QZMETAKEYWORD</meta:keyword><meta:initial-creator>QZMETACREATOR</meta:initial-creator>`);

const odtParts = pack("probe.odt", "application/vnd.oasis.opendocument.text",
  { "content.xml": odtContent, "styles.xml": odtStyles, "meta.xml": odtMeta, "Pictures/img1.png": PNG },
  [["Pictures/img1.png", "image/png"]]);

// ---------------- ODS ----------------
const cellS = (t) => `<table:table-cell office:value-type="string" calcext:value-type="string"><text:p>${t}</text:p></table:table-cell>`;
const odsContent = `${HDR}<office:document-content ${NS} xmlns:calcext="urn:org:documentfoundation:names:experimental:calc:xmlns:calcext:1.0">
<office:automatic-styles>
 <style:style style:name="co1" style:family="table-column"><style:table-column-properties style:column-width="2.258cm"/></style:style>
 <style:style style:name="ro1" style:family="table-row"><style:table-row-properties style:row-height="0.452cm"/></style:style>
 <style:style style:name="ta1" style:family="table" style:master-page-name="Default"><style:table-properties table:display="true" style:writing-mode="lr-tb"/></style:style>
 <style:style style:name="ta2" style:family="table" style:master-page-name="Default"><style:table-properties table:display="false" style:writing-mode="lr-tb"/></style:style>
</office:automatic-styles>
<office:body><office:spreadsheet>
<table:content-validations>
 <table:content-validation table:name="val1" table:condition="of:cell-content-is-whole-number() and cell-content()&gt;0" table:allow-empty-cell="true" table:base-cell-address="QZSHEETONE.A9">
  <table:help-message table:title="QZHELPTITLE" table:display="true"><text:p>QZHELPMSG</text:p></table:help-message>
  <table:error-message table:message-type="stop" table:title="QZERRTITLE" table:display="true"><text:p>QZERRMSG</text:p></table:error-message>
 </table:content-validation>
</table:content-validations>
<table:table table:name="QZSHEETONE" table:style-name="ta1">
 <table:table-column table:style-name="co1" table:default-cell-style-name="Default"/>
 <table:table-column table:style-name="co1" table:default-cell-style-name="Default"/>
 <table:table-column table:style-name="co1" table:visibility="collapse" table:default-cell-style-name="Default"/>
 <table:table-column table:style-name="co1" table:number-columns-repeated="1021" table:default-cell-style-name="Default"/>
 <table:table-row table:style-name="ro1">${cellS("QZSTRING")}<table:table-cell office:value-type="float" office:value="98765.4321" calcext:value-type="float"><text:p>98,765.43</text:p></table:table-cell>${cellS("QZHIDDENCOL")}${cellS("QZCOLD")}<table:table-cell table:number-columns-repeated="1020"/></table:table-row>
 <table:table-row table:style-name="ro1">${cellS("QZDATELABEL")}<table:table-cell office:value-type="date" office:date-value="2031-07-19" calcext:value-type="date"><text:p>19.07.31</text:p></table:table-cell><table:table-cell table:number-columns-repeated="1022"/></table:table-row>
 <table:table-row table:style-name="ro1">${cellS("QZCURRLABEL")}<table:table-cell office:value-type="currency" office:currency="EUR" office:value="4321.5" calcext:value-type="currency"><text:p>4.321,50 €</text:p></table:table-cell><table:table-cell table:number-columns-repeated="1022"/></table:table-row>
 <table:table-row table:style-name="ro1">${cellS("QZPCTLABEL")}<table:table-cell office:value-type="percentage" office:value="0.3712" calcext:value-type="percentage"><text:p>37.12%</text:p></table:table-cell><table:table-cell table:number-columns-repeated="1022"/></table:table-row>
 <table:table-row table:style-name="ro1" table:visibility="collapse">${cellS("QZHIDDENROW")}<table:table-cell table:number-columns-repeated="1023"/></table:table-row>
 <table:table-row table:style-name="ro1"><table:table-cell table:formula="of:=IF(1;&quot;QZFORMULACACHE&quot;;&quot;QZFORMULASRC&quot;)" office:value-type="string" office:string-value="QZFORMULACACHE" calcext:value-type="string"><text:p>QZFORMULACACHE</text:p></table:table-cell><table:table-cell table:formula="of:=[.B1]*0+31337" office:value-type="float" office:value="31337" calcext:value-type="float"><text:p>31,337</text:p></table:table-cell><table:table-cell table:number-columns-repeated="1022"/></table:table-row>
 <table:table-row table:style-name="ro1"><table:table-cell office:value-type="string" calcext:value-type="string"><office:annotation><dc:creator>QZCELLANNAUTHOR</dc:creator><dc:date>2026-01-01T00:00:00</dc:date><text:p>QZCELLANNBODY</text:p></office:annotation><text:p>QZANNOTATEDCELL</text:p></table:table-cell><table:table-cell table:number-columns-repeated="1023"/></table:table-row>
 <table:table-row table:style-name="ro1"><table:table-cell table:number-columns-spanned="2" table:number-rows-spanned="1" office:value-type="string" calcext:value-type="string"><text:p>QZMERGED</text:p></table:table-cell><table:covered-table-cell office:value-type="string" calcext:value-type="string"><text:p>QZCOVERED</text:p></table:covered-table-cell>${cellS("QZAFTERMERGE")}<table:table-cell table:number-columns-repeated="1021"/></table:table-row>
 <table:table-row table:style-name="ro1"><table:table-cell table:content-validation-name="val1" office:value-type="string" calcext:value-type="string"><text:p>QZCELLPARAA</text:p><text:p>QZCELLPARAB</text:p></table:table-cell><table:table-cell table:number-columns-repeated="3" office:value-type="string" calcext:value-type="string"><text:p>QZREPEAT</text:p></table:table-cell><table:table-cell table:number-columns-repeated="1020"/></table:table-row>
 <table:table-row table:style-name="ro1" table:number-rows-repeated="1048567"><table:table-cell table:number-columns-repeated="1024"/></table:table-row>
</table:table>
<table:table table:name="QZHIDDENSHEET" table:style-name="ta2">
 <table:table-column table:style-name="co1" table:default-cell-style-name="Default"/>
 <table:table-row table:style-name="ro1">${cellS("QZHIDDENSHEETCELL")}</table:table-row>
</table:table>
<table:table table:name="QZSHEETTWO" table:style-name="ta1">
 <table:table-column table:style-name="co1" table:number-columns-repeated="2" table:default-cell-style-name="Default"/>
 <table:table-row table:style-name="ro1">${cellS("QZSHEETTWOCELL")}${cellS("QZSHEETTWOB")}</table:table-row>
</table:table>
<table:named-expressions><table:named-range table:name="QZNAMEDRANGE" table:base-cell-address="$QZSHEETONE.$A$1" table:cell-range-address="$QZSHEETONE.$A$1:.$B$2"/></table:named-expressions>
</office:spreadsheet></office:body></office:document-content>`;

const odsStyles = `${HDR}<office:document-styles ${NS}>
<office:styles/>
<office:automatic-styles><style:page-layout style:name="Mpm1"><style:page-layout-properties/><style:header-style/><style:footer-style/></style:page-layout></office:automatic-styles>
<office:master-styles>
 <style:master-page style:name="Default" style:page-layout-name="Mpm1">
  <style:header><style:region-left><text:p>QZSHEADERLEFT</text:p></style:region-left><style:region-center><text:p><text:sheet-name>???</text:sheet-name></text:p></style:region-center></style:header>
  <style:footer><text:p>QZSFOOTER <text:page-number>1</text:page-number></text:p></style:footer>
 </style:master-page>
</office:master-styles></office:document-styles>`;

const odsParts = pack("probe.ods", "application/vnd.oasis.opendocument.spreadsheet",
  { "content.xml": odsContent, "styles.xml": odsStyles, "meta.xml": meta(`<dc:title>QZODSMETATITLE</dc:title>`) });

// ---------------- ODP ----------------
const tb = (cls, text, extra = "") => `<draw:frame presentation:style-name="pr1" draw:layer="layout" svg:width="25cm" svg:height="3cm" svg:x="1cm" svg:y="1cm" presentation:class="${cls}"${extra}><draw:text-box>${text}</draw:text-box></draw:frame>`;
const odpContent = `${HDR}<office:document-content ${NS}>
<office:automatic-styles>
 <style:style style:name="dp1" style:family="drawing-page"><style:drawing-page-properties presentation:display-footer="true" presentation:display-page-number="false" presentation:display-date-time="false"/></style:style>
 <style:style style:name="dp2" style:family="drawing-page"><style:drawing-page-properties presentation:visibility="hidden" presentation:display-footer="true"/></style:style>
 <style:style style:name="pr1" style:family="presentation"/>
</office:automatic-styles>
<office:body><office:presentation>
<presentation:footer-decl presentation:name="ftr1">QZFOOTERDECL</presentation:footer-decl>
<draw:page draw:name="QZPAGENAMEONE" draw:style-name="dp1" draw:master-page-name="Default" presentation:presentation-page-layout-name="AL1T0" presentation:use-footer-name="ftr1">
 <office:forms form:automatic-focus="false" form:apply-design-mode="false"/>
 ${tb("title", `<text:p>QZTITLE</text:p>`)}
 ${tb("subtitle", `<text:p>QZSUBTITLE</text:p>`)}
 <draw:frame draw:name="Image 1" draw:layer="layout" svg:width="3cm" svg:height="3cm" svg:x="20cm" svg:y="10cm"><draw:image xlink:href="Pictures/img1.png" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad" draw:mime-type="image/png"><text:p/></draw:image><svg:title>QZODPALTTITLE</svg:title><svg:desc>QZODPALTDESC</svg:desc></draw:frame>
 <office:annotation svg:x="1cm" svg:y="1cm"><dc:creator>QZSLIDECOMMENTAUTHOR</dc:creator><dc:date>2026-01-01T00:00:00</dc:date><text:p>QZSLIDECOMMENT</text:p></office:annotation>
 <presentation:notes draw:style-name="dp1"><draw:page-thumbnail draw:layer="layout" svg:width="14cm" svg:height="10cm" svg:x="3cm" svg:y="2cm" draw:page-number="1" presentation:class="page"/>${tb("notes", `<text:p>QZNOTES</text:p>`)}</presentation:notes>
</draw:page>
<draw:page draw:name="QZPAGENAMETWO" draw:style-name="dp1" draw:master-page-name="Default" presentation:presentation-page-layout-name="AL2T1" presentation:use-footer-name="ftr1">
 ${tb("title", `<text:p>QZSLIDETWOTITLE</text:p>`)}
 ${tb("outline", `<text:list text:style-name="L1"><text:list-item><text:p>QZOUTLINEONE</text:p><text:list><text:list-item><text:p>QZOUTLINETWO</text:p></text:list-item></text:list></text:list-item></text:list>`)}
 <draw:frame draw:name="TextBox 3" draw:layer="layout" svg:width="8cm" svg:height="2cm" svg:x="2cm" svg:y="12cm"><draw:text-box><text:p>QZTEXTBOX</text:p></draw:text-box></draw:frame>
 <draw:custom-shape draw:layer="layout" svg:width="5cm" svg:height="2cm" svg:x="12cm" svg:y="12cm"><text:p>QZSHAPETEXT</text:p><draw:enhanced-geometry svg:viewBox="0 0 21600 21600" draw:type="rectangle" draw:enhanced-path="M 0 0 L 21600 0 21600 21600 0 21600 0 0 Z N"/></draw:custom-shape>
 <draw:g><draw:frame draw:layer="layout" svg:width="4cm" svg:height="1cm" svg:x="2cm" svg:y="15cm"><draw:text-box><text:p>QZGROUPED</text:p></draw:text-box></draw:frame></draw:g>
 <draw:frame draw:name="Table 1" draw:layer="layout" svg:width="10cm" svg:height="2cm" svg:x="2cm" svg:y="6cm">
  <table:table table:template-name="default" table:use-first-row-styles="true">
   <table:table-column table:number-columns-repeated="2"/>
   <table:table-row><table:table-cell office:value-type="string"><text:p>QZODPCELLA</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>QZODPCELLB</text:p></table:table-cell></table:table-row>
   <table:table-row><table:table-cell office:value-type="string"><text:p>QZODPCELLC</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>QZODPCELLD</text:p></table:table-cell></table:table-row>
  </table:table>
 </draw:frame>
 <draw:frame draw:name="Chart 1" draw:layer="layout" svg:width="10cm" svg:height="7cm" svg:x="14cm" svg:y="4cm"><draw:object draw:notify-on-update-of-ranges="" xlink:href="./Object 1" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/><draw:image xlink:href="./ObjectReplacements/Object 1" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/><svg:title>QZCHARTALT</svg:title></draw:frame>
 <presentation:notes draw:style-name="dp1"><draw:page-thumbnail draw:layer="layout" svg:width="14cm" svg:height="10cm" svg:x="3cm" svg:y="2cm" draw:page-number="2" presentation:class="page"/>${tb("notes", `<text:p>QZNOTESTWO</text:p>`)}</presentation:notes>
</draw:page>
<draw:page draw:name="QZPAGENAMEHIDDEN" draw:style-name="dp2" draw:master-page-name="Default" presentation:presentation-page-layout-name="AL1T0">
 ${tb("title", `<text:p>QZHIDDENSLIDE</text:p>`)}
 <presentation:notes draw:style-name="dp1">${tb("notes", `<text:p>QZHIDDENSLIDENOTES</text:p>`)}</presentation:notes>
</draw:page>
<draw:page draw:name="page4" draw:style-name="dp1" draw:master-page-name="Default" presentation:presentation-page-layout-name="AL1T0">
 ${tb("title", `<text:p>QZLASTSLIDE</text:p>`)}
</draw:page>
<presentation:settings presentation:mouse-visible="false"/>
</office:presentation></office:body></office:document-content>`;

const odpStyles = `${HDR}<office:document-styles ${NS}>
<office:styles/>
<office:automatic-styles><style:page-layout style:name="PM1"><style:page-layout-properties fo:page-width="28cm" fo:page-height="15.75cm"/></style:page-layout><style:style style:name="Mdp1" style:family="drawing-page"/></office:automatic-styles>
<office:master-styles>
 <style:master-page style:name="Default" style:page-layout-name="PM1" draw:style-name="Mdp1">
  <draw:frame presentation:style-name="Default-title" draw:layer="backgroundobjects" svg:width="25cm" svg:height="3cm" svg:x="1cm" svg:y="1cm" presentation:class="title" presentation:placeholder="true"><draw:text-box><text:p>QZMASTERTITLEPROMPT</text:p></draw:text-box></draw:frame>
  <draw:frame draw:layer="backgroundobjects" svg:width="6cm" svg:height="1cm" svg:x="21cm" svg:y="14cm"><draw:text-box><text:p>QZMASTERDECOR</text:p></draw:text-box></draw:frame>
  <draw:frame presentation:style-name="Default-footer" draw:layer="backgroundobjects" svg:width="9cm" svg:height="1cm" svg:x="9cm" svg:y="14.5cm" presentation:class="footer"><draw:text-box><text:p><presentation:footer/></text:p></draw:text-box></draw:frame>
  <presentation:notes><draw:frame presentation:class="notes" presentation:placeholder="true" svg:width="16cm" svg:height="12cm" svg:x="2cm" svg:y="14cm"><draw:text-box><text:p>QZMASTERNOTESPROMPT</text:p></draw:text-box></draw:frame></presentation:notes>
 </style:master-page>
</office:master-styles></office:document-styles>`;

const chartContent = `${HDR}<office:document-content ${NS}>
<office:body><office:chart>
 <chart:chart svg:width="10cm" svg:height="7cm" chart:class="chart:bar">
  <chart:title svg:x="3cm" svg:y="0.2cm"><text:p>QZCHARTTITLE</text:p></chart:title>
  <chart:subtitle><text:p>QZCHARTSUBTITLE</text:p></chart:subtitle>
  <chart:legend chart:legend-position="end"/>
  <chart:plot-area table:cell-range-address="local-table.$A$1:.$B$3" chart:data-source-has-labels="both">
   <chart:axis chart:dimension="x" chart:name="primary-x"><chart:title><text:p>QZCHARTAXISTITLE</text:p></chart:title><chart:categories table:cell-range-address="local-table.$A$2:.$A$3"/></chart:axis>
   <chart:axis chart:dimension="y" chart:name="primary-y"/>
   <chart:series chart:values-cell-range-address="local-table.$B$2:.$B$3" chart:label-cell-address="local-table.$B$1" chart:class="chart:bar"><chart:data-point chart:repeated="2"/></chart:series>
  </chart:plot-area>
  <table:table table:name="local-table">
   <table:table-header-columns><table:table-column/></table:table-header-columns>
   <table:table-columns><table:table-column table:number-columns-repeated="1"/></table:table-columns>
   <table:table-header-rows><table:table-row><table:table-cell><text:p/></table:table-cell><table:table-cell office:value-type="string"><text:p>QZCHARTSERIES</text:p></table:table-cell></table:table-row></table:table-header-rows>
   <table:table-rows>
    <table:table-row><table:table-cell office:value-type="string"><text:p>QZCHARTCATA</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="11"><text:p>11</text:p></table:table-cell></table:table-row>
    <table:table-row><table:table-cell office:value-type="string"><text:p>QZCHARTCATB</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="22"><text:p>22</text:p></table:table-cell></table:table-row>
   </table:table-rows>
  </table:table>
 </chart:chart>
</office:chart></office:body></office:document-content>`;

const odpParts = pack("probe.odp", "application/vnd.oasis.opendocument.presentation",
  {
    "content.xml": odpContent, "styles.xml": odpStyles, "meta.xml": meta(`<dc:title>QZODPMETATITLE</dc:title>`),
    "Pictures/img1.png": PNG, "Object 1/content.xml": chartContent, "ObjectReplacements/Object 1": PNG,
  },
  [["Pictures/img1.png", "image/png"], ["Object 1/content.xml", "text/xml"], ["Object 1/", "application/vnd.oasis.opendocument.chart"], ["ObjectReplacements/Object 1", "application/x-openoffice-gdimetafile;windows_formatname=&quot;GDIMetaFile&quot;"]]);

// emit XML parts for a well-formedness check, when a second directory is given
if (process.argv[3])
for (const [fmt, parts] of [["odt", odtParts], ["ods", odsParts], ["odp", odpParts]])
  for (const [p, v] of Object.entries(parts)) if (typeof v === "string") writeFileSync(`${process.argv[3]}/${fmt}-${p.replace(/[\/ ]/g, "_")}`, v);
console.log("ok");
