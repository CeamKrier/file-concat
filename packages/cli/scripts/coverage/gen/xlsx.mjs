// Hand-built SpreadsheetML probe: every construct carries its own QZ marker.
// Usage: node xlsx.mjs <outDir>
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const { zipSync, strToU8 } = createRequire(new URL("../../../../core/package.json", import.meta.url))("fflate");

const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });

const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PR = "http://schemas.openxmlformats.org/package/2006/relationships";
const RT = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const HDR = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const rels = (list) =>
  HDR +
  `<Relationships xmlns="${NS_PR}">` +
  list.map(([id, type, target, mode]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"${mode ? ` TargetMode="${mode}"` : ""}/>`).join("") +
  "</Relationships>";

// shared strings
const sst = [];
const si = (xml) => (sst.push(xml), sst.length - 1);
const S = (text) => si(`<si><t xml:space="preserve">${esc(text)}</t></si>`);

const longStr = "QZLONGSTART " + "lorem ipsum dolor ".repeat(1770) + "QZLONGEND"; // ~31.9k chars, under the 32767 cap
const csvStr = 'QZCSVA, "QZCSVB"\nQZCSVC';

const s = {
  shared: S("QZSHAREDSTR"),
  rich: si('<si><r><t xml:space="preserve">QZRICHA </t></r><r><rPr><b/><sz val="11"/><color theme="1"/><rFont val="Calibri"/><family val="2"/><scheme val="minor"/></rPr><t>QZRICHB</t></r></si>'),
  phon: si('<si><t>QZPHONBASE</t><rPh sb="0" eb="10"><t>QZPHONREADING</t></rPh><phoneticPr fontId="1" type="noConversion"/></si>'),
  hiddenCol: S("QZHIDDENCOL"),
  triple: S("QZTRIPLESEMI"),
  link: S("QZLINKDISPLAY"),
  dv: S("QZDVCELL"),
  csv: S(csvStr),
  long: S(longStr),
  merged: S("QZMERGED"),
  afterMerge: S("QZAFTERMERGE"),
  hiddenRow: S("QZHIDDENROW"),
  outA: S("QZOUTLINEA"),
  outB: S("QZOUTLINEB"),
  outSum: S("QZOUTLINESUM"),
  tblHeadA: S("QZTBLHEADA"),
  tblHeadB: S("QZTBLHEADB"),
  tblRowA: S("QZTBLROWA"),
  tblRowB: S("QZTBLROWB"),
  total: S("QZTOTALLABEL"),
  commented: S("QZCOMMENTEDCELL"),
  threaded: S("QZTHREADEDCELL"),
  offA: S("QZOFFA"),
  offB: S("QZOFFB"),
  offD: S("QZOFFD"),
  hidSheet: S("QZHIDDENCELL"),
  vhSheet: S("QZVHIDDENCELL"),
  pHead: S("QZPSRCHEAD"),
  amount: S("Amount"),
  pA: S("QZPSRCA"),
  pB: S("QZPSRCB"),
  rowLabels: S("Row Labels"),
  sumOf: S("Sum of Amount"),
  grand: S("QZGRANDTOTAL"),
};
const sstXml = HDR + `<sst xmlns="${NS_MAIN}" count="${sst.length}" uniqueCount="${sst.length}">${sst.join("")}</sst>`;

const styles =
  HDR +
  `<styleSheet xmlns="${NS_MAIN}">` +
  '<numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="0&quot; QZUNITLIT&quot;"/><numFmt numFmtId="166" formatCode=";;;"/></numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font><font><sz val="9"/><name val="Yu Gothic"/><family val="2"/><charset val="128"/><scheme val="minor"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="7">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1"/></xf>' +
  "</cellXfs>" +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  "</styleSheet>";

const c = (r, inner, attrs = "") => `<c r="${r}"${attrs}>${inner}</c>`;
const cs = (r, idx, st = "") => c(r, `<v>${idx}</v>`, ` t="s"${st}`);
const cn = (r, v, st = "") => c(r, `<v>${v}</v>`, st);

// Sheet 1: the main construct sheet
const main =
  HDR +
  `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_R}">` +
  '<dimension ref="A1:G16"/>' +
  '<sheetViews><sheetView tabSelected="1" workbookViewId="0"/></sheetViews>' +
  '<sheetFormatPr defaultRowHeight="15" outlineLevelRow="1"/>' +
  '<cols><col min="5" max="5" width="9" hidden="1" customWidth="1"/></cols>' +
  "<sheetData>" +
  `<row r="1">${cs("A1", s.commented)}${c("B1", "<is><t>QZINLINESTR</t></is>", ' t="inlineStr"')}${c("C1", '<f>T("QZFORMULATEXT")</f><v>QZSTRRESULT</v>', ' t="str"')}${cs("D1", s.rich)}${cs("E1", s.hiddenCol)}${cs("F1", s.phon, ' ph="1"')}${cs("G1", s.shared)}</row>` +
  `<row r="2">${cn("A2", "0.4321", ' s="1"')}${cn("B2", "98765.4", ' s="2"')}${cn("C2", "45000", ' s="3"')}${cn("D2", "77", ' s="4"')}${cn("F2", "13579", ' s="5"')}${cs("G2", s.triple, ' s="5"')}</row>` +
  `<row r="3">${c("A3", "<f>SUM(24679,1)</f><v>24680</v>")}${c("B3", "<f>NA()</f><v>#N/A</v>", ' t="e"')}${c("C3", "<v>1</v>", ' t="b"')}${cs("D3", s.link)}${cs("F3", s.dv)}${cs("G3", s.threaded)}</row>` +
  `<row r="4" ht="45" customHeight="1">${cs("A4", s.csv, ' s="6"')}${cs("B4", s.long)}</row>` +
  `<row r="5">${cs("A5", s.merged)}<c r="B5"/><c r="C5"/>${cs("D5", s.afterMerge)}</row>` +
  '<row r="6"><c r="A6"/><c r="B6"/><c r="C6"/></row>' +
  `<row r="7" hidden="1">${cs("A7", s.hiddenRow)}</row>` +
  `<row r="8" hidden="1" outlineLevel="1">${cs("A8", s.outA)}</row>` +
  `<row r="9" hidden="1" outlineLevel="1">${cs("A9", s.outB)}</row>` +
  `<row r="10" collapsed="1">${cs("A10", s.outSum)}</row>` +
  `<row r="11">${c("A11", "<f>[1]Remote!$A$1</f><v>QZEXTRESULT</v>", ' t="str"')}</row>` +
  `<row r="13">${cs("A13", s.tblHeadA)}${cs("B13", s.tblHeadB)}</row>` +
  `<row r="14">${cs("A14", s.tblRowA)}${cn("B14", "5")}</row>` +
  `<row r="15">${cs("A15", s.tblRowB)}${cn("B15", "6")}</row>` +
  `<row r="16">${cs("A16", s.total)}${c("B16", "<f>SUBTOTAL(109,QZTABLENAME[QZTBLHEADB])</f><v>11</v>")}</row>` +
  "</sheetData>" +
  '<mergeCells count="1"><mergeCell ref="A5:C6"/></mergeCells>' +
  '<dataValidations count="1"><dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorTitle="QZDVERRTITLE" error="QZDVERROR" promptTitle="QZDVPTITLE" prompt="QZDVPROMPT" sqref="F3"><formula1>"QZLISTA,QZLISTB"</formula1></dataValidation></dataValidations>' +
  '<hyperlinks><hyperlink ref="D3" r:id="rId5" tooltip="QZLINKTIP" display="QZLINKDISPLAY"/></hyperlinks>' +
  '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
  '<headerFooter><oddHeader>&amp;LQZHDRLEFT&amp;C&amp;P of &amp;N&amp;RQZHDRRIGHT</oddHeader><oddFooter>&amp;CQZFOOTER &amp;D</oddFooter></headerFooter>' +
  '<drawing r:id="rId1"/><legacyDrawing r:id="rId2"/>' +
  '<tableParts count="1"><tablePart r:id="rId3"/></tableParts>' +
  "</worksheet>";
const mainRels = rels([
  ["rId1", `${RT}/drawing`, "../drawings/drawing1.xml"],
  ["rId2", `${RT}/vmlDrawing`, "../drawings/vmlDrawing1.vml"],
  ["rId3", `${RT}/table`, "../tables/table1.xml"],
  ["rId4", `${RT}/comments`, "../comments1.xml"],
  ["rId5", `${RT}/hyperlink`, "https://example.com/QZLINKTARGET", "External"],
  ["rId6", "http://schemas.microsoft.com/office/2017/10/relationships/threadedComment", "../threadedComments/threadedComment1.xml"],
]);

const simpleSheet = (dim, rows) =>
  HDR + `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_R}"><dimension ref="${dim}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${rows}</sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;

const offset = simpleSheet("C5:D7", `<row r="5">${cs("C5", s.offA)}${cs("D5", s.offB)}</row><row r="7">${cs("D7", s.offD)}</row>`);
const hidden = simpleSheet("A1", `<row r="1">${cs("A1", s.hidSheet)}</row>`);
const vhidden = simpleSheet("A1", `<row r="1">${cs("A1", s.vhSheet)}</row>`);

// Pivot sheet: source A1:B3, rendered pivot at D1:E4
const pivotSheet =
  HDR +
  `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_R}"><dimension ref="A1:E4"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>` +
  `<row r="1">${cs("A1", s.pHead)}${cs("B1", s.amount)}${cs("D1", s.rowLabels)}${cs("E1", s.sumOf)}</row>` +
  `<row r="2">${cs("A2", s.pA)}${cn("B2", "10")}${cs("D2", s.pA)}${cn("E2", "10")}</row>` +
  `<row r="3">${cs("A3", s.pB)}${cn("B3", "20")}${cs("D3", s.pB)}${cn("E3", "20")}</row>` +
  `<row r="4">${cs("D4", s.grand)}${cn("E4", "30")}</row>` +
  `</sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
const pivotSheetRels = rels([["rId1", `${RT}/pivotTable`, "../pivotTables/pivotTable1.xml"]]);
const pivotTable =
  HDR +
  `<pivotTableDefinition xmlns="${NS_MAIN}" name="QZPIVOTNAME" cacheId="1" applyNumberFormats="0" applyBorderFormats="0" applyFontFormats="0" applyPatternFormats="0" applyAlignmentFormats="0" applyWidthHeightFormats="1" dataCaption="Values" grandTotalCaption="QZGRANDTOTAL" updatedVersion="8" minRefreshableVersion="3" useAutoFormatting="1" itemPrintTitles="1" createdVersion="8" indent="0" outline="1" outlineData="1" multipleFieldFilters="0">` +
  '<location ref="D1:E4" firstHeaderRow="1" firstDataRow="1" firstDataCol="1"/>' +
  '<pivotFields count="2"><pivotField axis="axisRow" showAll="0"><items count="4"><item x="0"/><item x="1"/><item m="1" x="2"/><item t="default"/></items></pivotField><pivotField dataField="1" showAll="0"/></pivotFields>' +
  '<rowFields count="1"><field x="0"/></rowFields>' +
  '<rowItems count="3"><i><x/></i><i><x v="1"/></i><i t="grand"><x/></i></rowItems>' +
  '<colItems count="1"><i/></colItems>' +
  '<dataFields count="1"><dataField name="Sum of Amount" fld="1" baseField="0" baseItem="0"/></dataFields>' +
  '<pivotTableStyleInfo name="PivotStyleLight16" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="1"/>' +
  "</pivotTableDefinition>";
const pivotTableRels = rels([["rId1", `${RT}/pivotCacheDefinition`, "../pivotCache/pivotCacheDefinition1.xml"]]);
const pivotCacheDef =
  HDR +
  `<pivotCacheDefinition xmlns="${NS_MAIN}" xmlns:r="${NS_R}" r:id="rId1" refreshedBy="QZREFRESHEDBY" refreshedDate="45000.5" createdVersion="8" refreshedVersion="8" minRefreshableVersion="3" recordCount="2">` +
  '<cacheSource type="worksheet"><worksheetSource ref="A1:B3" sheet="QZSHEETPIVOT"/></cacheSource>' +
  '<cacheFields count="2"><cacheField name="QZPSRCHEAD" numFmtId="0"><sharedItems count="3"><s v="QZPSRCA"/><s v="QZPSRCB"/><s v="QZCACHEONLY"/></sharedItems></cacheField>' +
  '<cacheField name="Amount" numFmtId="0"><sharedItems containsSemiMixedTypes="0" containsString="0" containsNumber="1" containsInteger="1" minValue="10" maxValue="20"/></cacheField></cacheFields>' +
  "</pivotCacheDefinition>";
const pivotCacheDefRels = rels([["rId1", `${RT}/pivotCacheRecords`, "pivotCacheRecords1.xml"]]);
const pivotRecords = HDR + `<pivotCacheRecords xmlns="${NS_MAIN}" count="2"><r><x v="0"/><n v="10"/></r><r><x v="1"/><n v="20"/></r></pivotCacheRecords>`;

// Table
const table =
  HDR +
  `<table xmlns="${NS_MAIN}" id="1" name="QZTABLENAME" displayName="QZTABLENAME" ref="A13:B16" totalsRowCount="1"><autoFilter ref="A13:B15"/><tableColumns count="2"><tableColumn id="1" name="QZTBLHEADA" totalsRowLabel="QZTOTALLABEL"/><tableColumn id="2" name="QZTBLHEADB" totalsRowFunction="sum"/></tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`;

// Legacy comments: A1 a plain note, G3 the threaded placeholder Excel writes
const tcGuid = "{6D2B3A10-0000-4000-8000-00000000A001}";
const replyGuid = "{6D2B3A10-0000-4000-8000-00000000A002}";
const personGuid = "{6D2B3A10-0000-4000-8000-00000000B001}";
const comments =
  HDR +
  `<comments xmlns="${NS_MAIN}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="xr" xmlns:xr="http://schemas.microsoft.com/office/spreadsheetml/2014/revision">` +
  `<authors><author>QZAUTHOR</author><author>tc=${tcGuid}</author></authors><commentList>` +
  '<comment ref="A1" authorId="0" shapeId="0"><text><r><rPr><b/><sz val="9"/><color indexed="81"/><rFont val="Tahoma"/><family val="2"/></rPr><t>QZAUTHOR:</t></r><r><rPr><sz val="9"/><color indexed="81"/><rFont val="Tahoma"/><family val="2"/></rPr><t xml:space="preserve">\nQZCOMMENT</t></r></text></comment>' +
  `<comment ref="G3" authorId="1" shapeId="0" xr:uid="${tcGuid}"><text><t xml:space="preserve">[Threaded comment]\n\nYour version of Excel allows you to read this threaded comment; however, any edits to it will get removed if the file is opened in a newer version of Excel. Learn more: https://go.microsoft.com/fwlink/?linkid=870924\n\nComment:\n    QZTHREADTEXT\nReply:\n    QZTHREADREPLY</t></text></comment>` +
  "</commentList></comments>";
const threaded =
  HDR +
  `<ThreadedComments xmlns="http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments" xmlns:x="${NS_MAIN}">` +
  `<threadedComment ref="G3" dT="2026-10-14T10:00:00.00" personId="${personGuid}" id="${tcGuid}"><text>QZTHREADTEXT</text></threadedComment>` +
  `<threadedComment ref="G3" dT="2026-10-14T10:05:00.00" personId="${personGuid}" id="${replyGuid}" parentId="${tcGuid}"><text>QZTHREADREPLY</text></threadedComment>` +
  "</ThreadedComments>";
const persons =
  HDR +
  `<personList xmlns="http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments" xmlns:x="${NS_MAIN}"><person displayName="QZPERSON" id="${personGuid}" userId="qzperson@example.com" providerId="None"/></personList>`;
const vml =
  '<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">' +
  '<o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="1"/></o:shapelayout>' +
  '<v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>' +
  '<v:shape id="_x0000_s1025" type="#_x0000_t202" style="position:absolute;visibility:hidden" fillcolor="#ffffe1" o:insetmode="auto"><v:fill color2="#ffffe1"/><v:textbox style="mso-direction-alt:auto"><div style="text-align:left"></div></v:textbox><x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:AutoFill>False</x:AutoFill><x:Row>0</x:Row><x:Column>0</x:Column></x:ClientData></v:shape>' +
  '<v:shape id="_x0000_s1026" type="#_x0000_t202" style="position:absolute;visibility:hidden" fillcolor="#ffffe1" o:insetmode="auto"><v:fill color2="#ffffe1"/><v:textbox style="mso-direction-alt:auto"><div style="text-align:left"></div></v:textbox><x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:AutoFill>False</x:AutoFill><x:Row>2</x:Row><x:Column>6</x:Column></x:ClientData></v:shape>' +
  "</xml>";

// Drawing: text box, shape with alt text, chart frame
const XDR = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const C = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const anchor = (fromCol, fromRow, inner) =>
  `<xdr:twoCellAnchor><xdr:from><xdr:col>${fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${fromCol + 3}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow + 4}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>${inner}<xdr:clientData/></xdr:twoCellAnchor>`;
const spPr = '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1828800" cy="762000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>';
const drawing1 =
  HDR +
  `<xdr:wsDr xmlns:xdr="${XDR}" xmlns:a="${A}">` +
  anchor(8, 0, `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="2" name="TextBox 1"/><xdr:cNvSpPr txBox="1"/></xdr:nvSpPr>${spPr}<xdr:txBody><a:bodyPr vertOverflow="clip" wrap="square" rtlCol="0" anchor="t"/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1100"/><a:t>QZTEXTBOX</a:t></a:r></a:p></xdr:txBody></xdr:sp>`) +
  anchor(8, 6, `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="3" name="Rectangle 2" descr="QZALTTEXT"/><xdr:cNvSpPr/></xdr:nvSpPr>${spPr}</xdr:sp>`) +
  anchor(
    8,
    12,
    `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="4" name="Chart 3"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${C}"><c:chart xmlns:c="${C}" xmlns:r="${NS_R}" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame>`,
  ) +
  "</xdr:wsDr>";
const drawing1Rels = rels([["rId1", `${RT}/chart`, "../charts/chart1.xml"]]);
const richTitle = (t) => `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${t}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
const chart = (title, withSeries) =>
  HDR +
  `<c:chartSpace xmlns:c="${C}" xmlns:a="${A}" xmlns:r="${NS_R}"><c:roundedCorners val="0"/><c:chart>${richTitle(title)}<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>` +
  `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>` +
  (withSeries
    ? '<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:f>QZSHEETMAIN!$Z$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>QZSERIESNAME</c:v></c:pt></c:strCache></c:strRef></c:tx>' +
      '<c:cat><c:strRef><c:f>QZSHEETMAIN!$Z$2:$Z$3</c:f><c:strCache><c:ptCount val="2"/><c:pt idx="0"><c:v>QZCATA</c:v></c:pt><c:pt idx="1"><c:v>QZCATB</c:v></c:pt></c:strCache></c:strRef></c:cat>' +
      '<c:val><c:numRef><c:f>QZSHEETMAIN!$AA$2:$AA$3</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="2"/><c:pt idx="0"><c:v>31415</c:v></c:pt><c:pt idx="1"><c:v>27182</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser>'
    : "") +
  '<c:gapWidth val="219"/><c:axId val="1"/><c:axId val="2"/></c:barChart>' +
  '<c:catAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>' +
  (withSeries ? richTitle("QZAXISTITLE") : "") +
  '<c:crossAx val="2"/></c:catAx><c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="1"/></c:valAx>' +
  "</c:plotArea><c:plotVisOnly val=\"1\"/></c:chart></c:chartSpace>";

// Chartsheet
const chartsheet =
  HDR + `<chartsheet xmlns="${NS_MAIN}" xmlns:r="${NS_R}"><sheetPr/><sheetViews><sheetView workbookViewId="0"/></sheetViews><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><drawing r:id="rId1"/></chartsheet>`;
const chartsheetRels = rels([["rId1", `${RT}/drawing`, "../drawings/drawing2.xml"]]);
const drawing2 =
  HDR +
  `<xdr:wsDr xmlns:xdr="${XDR}" xmlns:a="${A}"><xdr:absoluteAnchor><xdr:pos x="0" y="0"/><xdr:ext cx="8670000" cy="6300000"/><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Chart 1"/><xdr:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></xdr:cNvGraphicFramePr></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${C}"><c:chart xmlns:c="${C}" xmlns:r="${NS_R}" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:absoluteAnchor></xdr:wsDr>`;
const drawing2Rels = rels([["rId1", `${RT}/chart`, "../charts/chart2.xml"]]);

// External link
const extLink =
  HDR +
  `<externalLink xmlns="${NS_MAIN}" xmlns:r="${NS_R}"><externalBook r:id="rId1"><sheetNames><sheetName val="Remote"/></sheetNames><sheetDataSet><sheetData sheetId="0"><row r="1"><cell r="A1" t="str"><v>QZEXTRESULT</v></cell><cell r="B1" t="str"><v>QZEXTCACHEONLY</v></cell></row></sheetData></sheetDataSet></externalBook></externalLink>`;
const extLinkRels = rels([["rId1", `${RT}/externalLinkPath`, "file:///C:/QZEXTBOOK.xlsx", "External"]]);

// Workbook: sheet order Main, Offset, Hidden, VeryHidden, Pivot, Chartsheet
const workbook =
  HDR +
  `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_R}"><fileVersion appName="xl" lastEdited="7" lowestEdited="7" rupBuild="27328"/><workbookPr defaultThemeVersion="202300"/>` +
  '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="12300" activeTab="0"/></bookViews>' +
  "<sheets>" +
  '<sheet name="QZSHEETMAIN" sheetId="1" r:id="rId1"/>' +
  '<sheet name="QZSHEETOFFSET" sheetId="2" r:id="rId2"/>' +
  '<sheet name="QZHIDDENSHEET" sheetId="3" state="hidden" r:id="rId3"/>' +
  '<sheet name="QZVHIDDENSHEET" sheetId="4" state="veryHidden" r:id="rId4"/>' +
  '<sheet name="QZSHEETPIVOT" sheetId="5" r:id="rId5"/>' +
  '<sheet name="QZCHARTSHEET" sheetId="6" r:id="rId6"/>' +
  "</sheets>" +
  '<externalReferences><externalReference r:id="rId7"/></externalReferences>' +
  '<definedNames><definedName name="QZDEFNAME" comment="QZDEFCOMMENT">QZSHEETMAIN!$A$3</definedName><definedName name="_xlnm.Print_Titles" localSheetId="0">QZSHEETMAIN!$1:$1</definedName></definedNames>' +
  '<calcPr calcId="191029"/>' +
  '<pivotCaches><pivotCache cacheId="1" r:id="rId8"/></pivotCaches>' +
  "</workbook>";
const workbookRels = rels([
  ["rId1", `${RT}/worksheet`, "worksheets/sheet1.xml"],
  ["rId2", `${RT}/worksheet`, "worksheets/sheet2.xml"],
  ["rId3", `${RT}/worksheet`, "worksheets/sheet3.xml"],
  ["rId4", `${RT}/worksheet`, "worksheets/sheet4.xml"],
  ["rId5", `${RT}/worksheet`, "worksheets/sheet5.xml"],
  ["rId6", `${RT}/chartsheet`, "chartsheets/sheet1.xml"],
  ["rId7", `${RT}/externalLink`, "externalLinks/externalLink1.xml"],
  ["rId8", `${RT}/pivotCacheDefinition`, "pivotCache/pivotCacheDefinition1.xml"],
  ["rId9", `${RT}/sharedStrings`, "sharedStrings.xml"],
  ["rId10", `${RT}/styles`, "styles.xml"],
  ["rId11", "http://schemas.microsoft.com/office/2017/10/relationships/person", "persons/person.xml"],
]);

const core =
  HDR +
  '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>QZDOCTITLE</dc:title><dc:subject>QZDOCSUBJECT</dc:subject><dc:creator>QZCREATOR</dc:creator><cp:keywords>QZKEYWORDS</cp:keywords><dc:description>QZDOCDESC</dc:description><dcterms:created xsi:type="dcterms:W3CDTF">2026-10-14T00:00:00Z</dcterms:created></cp:coreProperties>';
const app =
  HDR +
  '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Excel</Application><Company>QZCOMPANY</Company></Properties>';

const ct =
  HDR +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  [1, 2, 3, 4, 5].map((n) => `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
  '<Override PartName="/xl/chartsheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.chartsheet+xml"/>' +
  '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' +
  '<Override PartName="/xl/drawings/drawing2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' +
  '<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>' +
  '<Override PartName="/xl/charts/chart2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>' +
  '<Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>' +
  '<Override PartName="/xl/comments1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/>' +
  '<Override PartName="/xl/threadedComments/threadedComment1.xml" ContentType="application/vnd.ms-excel.threadedcomments+xml"/>' +
  '<Override PartName="/xl/persons/person.xml" ContentType="application/vnd.ms-excel.person+xml"/>' +
  '<Override PartName="/xl/pivotTables/pivotTable1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotTable+xml"/>' +
  '<Override PartName="/xl/pivotCache/pivotCacheDefinition1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheDefinition+xml"/>' +
  '<Override PartName="/xl/pivotCache/pivotCacheRecords1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheRecords+xml"/>' +
  '<Override PartName="/xl/externalLinks/externalLink1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.externalLink+xml"/>' +
  '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
  '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
  "</Types>";

const parts = {
  "[Content_Types].xml": ct,
  "_rels/.rels": rels([
    ["rId1", `${RT}/officeDocument`, "xl/workbook.xml"],
    ["rId2", "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties", "docProps/core.xml"],
    ["rId3", `${RT}/extended-properties`, "docProps/app.xml"],
  ]),
  "docProps/core.xml": core,
  "docProps/app.xml": app,
  "xl/workbook.xml": workbook,
  "xl/_rels/workbook.xml.rels": workbookRels,
  "xl/sharedStrings.xml": sstXml,
  "xl/styles.xml": styles,
  "xl/worksheets/sheet1.xml": main,
  "xl/worksheets/_rels/sheet1.xml.rels": mainRels,
  "xl/worksheets/sheet2.xml": offset,
  "xl/worksheets/sheet3.xml": hidden,
  "xl/worksheets/sheet4.xml": vhidden,
  "xl/worksheets/sheet5.xml": pivotSheet,
  "xl/worksheets/_rels/sheet5.xml.rels": pivotSheetRels,
  "xl/chartsheets/sheet1.xml": chartsheet,
  "xl/chartsheets/_rels/sheet1.xml.rels": chartsheetRels,
  "xl/drawings/drawing1.xml": drawing1,
  "xl/drawings/_rels/drawing1.xml.rels": drawing1Rels,
  "xl/drawings/drawing2.xml": drawing2,
  "xl/drawings/_rels/drawing2.xml.rels": drawing2Rels,
  "xl/drawings/vmlDrawing1.vml": vml,
  "xl/charts/chart1.xml": chart("QZCHARTTITLE", true),
  "xl/charts/chart2.xml": chart("QZCSTITLE", false),
  "xl/tables/table1.xml": table,
  "xl/comments1.xml": comments,
  "xl/threadedComments/threadedComment1.xml": threaded,
  "xl/persons/person.xml": persons,
  "xl/pivotTables/pivotTable1.xml": pivotTable,
  "xl/pivotTables/_rels/pivotTable1.xml.rels": pivotTableRels,
  "xl/pivotCache/pivotCacheDefinition1.xml": pivotCacheDef,
  "xl/pivotCache/_rels/pivotCacheDefinition1.xml.rels": pivotCacheDefRels,
  "xl/pivotCache/pivotCacheRecords1.xml": pivotRecords,
  "xl/externalLinks/externalLink1.xml": extLink,
  "xl/externalLinks/_rels/externalLink1.xml.rels": extLinkRels,
};

// write the parts out for an xmllint well-formedness pass when a second directory is given, then zip
const partsDir = process.argv[3];
if (partsDir) for (const [name, xml] of Object.entries(parts)) {
  const p = path.join(partsDir, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, xml);
}
fs.writeFileSync(path.join(out, "probe-xlsx-all.xlsx"), zipSync(Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, strToU8(v)]))));
console.log("wrote", path.join(out, "probe-xlsx-all.xlsx"), "long string length", longStr.length);
