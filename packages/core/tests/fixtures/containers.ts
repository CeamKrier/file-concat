import { strToU8, zipSync } from "fflate";

/** Build a minimal but valid .docx (OOXML zip) carrying a single line of text. */
export function minimalDocx(text: string): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        `</Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
        `</Relationships>`,
    ),
    "word/document.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
        `<w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body>` +
        `</w:document>`,
    ),
  });
}

/**
 * Build a minimal OpenDocument text file. The `mimetype` entry must be first
 * and stored uncompressed — that is exactly what tells an `.odt` apart from a
 * plain zip, so storing it any other way would defeat the fixture.
 */
export function minimalOdt(): Uint8Array {
  return zipSync(
    {
      mimetype: strToU8("application/vnd.oasis.opendocument.text"),
      "content.xml": strToU8(`<office:document-content xmlns:office="urn:odf"/>`),
    },
    { level: 0 },
  );
}

/** A minimal EPUB. Same `mimetype`-first trick as OpenDocument. */
export function minimalEpub(): Uint8Array {
  return zipSync(
    {
      mimetype: strToU8("application/epub+zip"),
      "META-INF/container.xml": strToU8(`<container version="1.0"/>`),
    },
    { level: 0 },
  );
}

/** A plain zip of source files — the container `.docx` must not be confused with. */
export function plainZip(): Uint8Array {
  return zipSync({
    "src/index.ts": strToU8(`export const answer = 42;\n`),
    "README.md": strToU8(`# Project\n`),
    "__MACOSX/._junk": strToU8("cruft"),
    ".DS_Store": strToU8("cruft"),
  });
}

/**
 * One 512-byte tar header with a valid checksum. `magic` is the `ustar` field;
 * pass an empty string to build a pre-POSIX v7 header, which carries none.
 */
function tarHeader(name: string, size: number, magic: string): Uint8Array {
  const block = new Uint8Array(512);
  const enc = new TextEncoder();
  const put = (offset: number, value: string) => block.set(enc.encode(value), offset);

  put(0, name);
  put(100, "0000644\0"); // mode
  put(108, "0000000\0"); // uid
  put(116, "0000000\0"); // gid
  put(124, size.toString(8).padStart(11, "0") + "\0");
  put(136, "00000000000\0"); // mtime
  put(148, "        "); // checksum, summed as spaces
  block[156] = 0x30; // typeflag '0' — regular file
  if (magic) put(257, magic);

  let sum = 0;
  for (let i = 0; i < 512; i++) sum += block[i];
  put(148, sum.toString(8).padStart(6, "0") + "\0 ");
  return block;
}

/** Assemble a tar from `name -> content`, with the two trailing zero blocks. */
export function makeTar(files: Record<string, string>, magic = "ustar\x0000"): Uint8Array {
  const enc = new TextEncoder();
  const blocks: Uint8Array[] = [];
  for (const [name, content] of Object.entries(files)) {
    const data = enc.encode(content);
    blocks.push(tarHeader(name, data.length, magic));
    const padded = new Uint8Array(Math.ceil(data.length / 512) * 512);
    padded.set(data);
    blocks.push(padded);
  }
  blocks.push(new Uint8Array(1024)); // end-of-archive

  const total = blocks.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const block of blocks) {
    out.set(block, offset);
    offset += block.length;
  }
  return out;
}
