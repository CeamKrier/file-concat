// Hand-built EPUB 3.3 package (with an EPUB 2 NCX), one marker per construct.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const { zipSync, strToU8 } = createRequire(new URL("../../../../core/package.json", import.meta.url))("fflate");
const out = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "probes", "epub", "probe.epub");

const xhtml = (title, body) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head><title>${title}</title><style>.QZEPSTYLE { color: red; }</style></head>
<body>
${body}
</body>
</html>
`;

const files = {
  "META-INF/container.xml": `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
`,
  "OEBPS/content.opf": `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="en">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:12345678-1234-1234-1234-123456789abc</dc:identifier>
    <dc:title>QZEPTITLE</dc:title>
    <dc:creator>QZEPCREATOR</dc:creator>
    <dc:description>QZEPDESCRIPTION</dc:description>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-10-14T00:00:00Z</meta>
    <meta name="cover" content="cover-img"/>
  </metadata>
  <manifest>
    <item id="chap3" href="chap3.xhtml" media-type="application/xhtml+xml"/>
    <item id="chap2" href="chap2.xhtml" media-type="application/xhtml+xml"/>
    <item id="notes" href="notes.xhtml" media-type="application/xhtml+xml"/>
    <item id="orphan" href="orphan.xhtml" media-type="application/xhtml+xml"/>
    <item id="chap1" href="chap1.xhtml" media-type="application/xhtml+xml"/>
    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="cover-img" href="cover.png" media-type="image/png" properties="cover-image"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="cover"/>
    <itemref idref="chap1"/>
    <itemref idref="notes" linear="no"/>
    <itemref idref="chap2"/>
    <itemref idref="chap3"/>
  </spine>
</package>
`,
  "OEBPS/toc.ncx": `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="urn:uuid:12345678-1234-1234-1234-123456789abc"/></head>
  <docTitle><text>QZNCXDOCTITLE</text></docTitle>
  <navMap>
    <navPoint id="np1" playOrder="1"><navLabel><text>QZNCXLABEL</text></navLabel><content src="chap1.xhtml"/></navPoint>
  </navMap>
</ncx>
`,
  "OEBPS/nav.xhtml": xhtml("QZNAVHEADTITLE", `<nav epub:type="toc" id="toc"><h1>QZNAVHEADING</h1><ol><li><a href="chap1.xhtml">QZNAVTOCENTRY</a></li></ol></nav>
<nav epub:type="landmarks" hidden=""><ol><li><a epub:type="bodymatter" href="chap1.xhtml">QZNAVLANDMARK</a></li></ol></nav>`),
  "OEBPS/cover.xhtml": xhtml("Cover", `<section epub:type="cover"><img src="cover.png" alt="QZCOVERALT"/></section>`),
  "OEBPS/chap1.xhtml": xhtml("QZCH1HEADTITLE", `<section epub:type="chapter">
<h1>QZCH1HEADING</h1>
<p>First chapter prose QZCH1PARA with a note<a epub:type="noteref" href="#fn1" role="doc-noteref">1</a>.</p>
<p><img src="cover.png" alt="QZCH1IMGALT"/></p>
<aside epub:type="footnote" id="fn1" role="doc-footnote"><p>QZFOOTNOTEASIDE</p></aside>
<p>After the note QZCH1AFTER.</p>
</section>`),
  "OEBPS/notes.xhtml": xhtml("Notes", `<section epub:type="endnotes"><p>Auxiliary content QZLINEARNO.</p></section>`),
  "OEBPS/chap2.xhtml": xhtml("Two", `<section epub:type="chapter"><h1>QZCH2HEADING</h1><p>Second QZCH2PARA.</p></section>`),
  "OEBPS/chap3.xhtml": xhtml("Three", `<section epub:type="chapter"><h1>QZCH3HEADING</h1><p>Third QZCH3PARA.</p></section>`),
  "OEBPS/orphan.xhtml": xhtml("Orphan", `<p>Manifest only QZNOTINSPINE.</p>`),
};

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const entries = { mimetype: [strToU8("application/epub+zip"), { level: 0 }] };
for (const [name, text] of Object.entries(files)) entries[name] = strToU8(text);
entries["OEBPS/cover.png"] = new Uint8Array(png);
fs.writeFileSync(out, zipSync(entries));
console.log("wrote", out);
