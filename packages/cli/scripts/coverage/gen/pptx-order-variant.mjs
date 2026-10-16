// Variant of the PPTX probe: sldIdLst in file-name order and the notes' cached slide number set to 1,
// to separate the slide-order defect from the notes slide-number drop.
import { createRequire } from "node:module";
const { unzipSync, zipSync, strFromU8, strToU8 } = createRequire(new URL("../../../../core/package.json", import.meta.url))("fflate");
import { readFileSync, writeFileSync } from "node:fs";
const [src, dst] = process.argv.slice(2);
const parts = unzipSync(readFileSync(src));
const edit = (name, f) => (parts[name] = strToU8(f(strFromU8(parts[name]))));
edit("ppt/presentation.xml", (x) =>
  x.replace(/<p:sldIdLst>.*<\/p:sldIdLst>/, '<p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/><p:sldId id="258" r:id="rId4"/><p:sldId id="259" r:id="rId5"/><p:sldId id="260" r:id="rId6"/></p:sldIdLst>'));
edit("ppt/notesSlides/notesSlide1.xml", (x) => x.replace(/(type="slidenum"><a:rPr lang="en-US"\/><a:t>)2</, "$11<"));
writeFileSync(dst, zipSync(parts));
