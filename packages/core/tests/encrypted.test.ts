import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";

import { epubEncryptedPaths, isEncryptedContainer } from "../src/file-processing/encrypted";

/** Set general purpose bit 0 on every local and central header, as ZipCrypto does. */
function withEncryptionFlag(zip: Uint8Array): Uint8Array {
  const out = zip.slice();
  const view = new DataView(out.buffer);
  for (let at = 0; at + 4 <= out.length; at++) {
    const sig = view.getUint32(at, true);
    if (sig === 0x04034b50) out[at + 6] |= 1;
    if (sig === 0x02014b50) out[at + 8] |= 1;
  }
  return out;
}

const encryptionXml = (algorithm: string, uri: string) =>
  `<?xml version="1.0"?><encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:EncryptionMethod Algorithm="${algorithm}"/><enc:CipherData><enc:CipherReference URI="${uri}"/></enc:CipherData></enc:EncryptedData></encryption>`;

function epub(xml?: string): Uint8Array {
  return zipSync({
    mimetype: strToU8("application/epub+zip"),
    ...(xml ? { "META-INF/encryption.xml": strToU8(xml) } : {}),
    "OEBPS/ch1.xhtml": strToU8("<html><body>chapter</body></html>"),
  });
}

/** An OLE2 header followed by directory names, which is all the check reads. */
function cfb(...names: string[]): Uint8Array {
  const magic = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  const utf16 = names.flatMap((name) => [...Array.from(name).flatMap((ch) => [ch.charCodeAt(0), 0]), 0, 0]);
  return Uint8Array.from([...magic, ...new Array(504).fill(0), ...utf16]);
}

describe("isEncryptedContainer", () => {
  it("reads the zip encryption flag", () => {
    const zip = zipSync({ "notes.txt": strToU8("hello") });
    expect(isEncryptedContainer(zip)).toBe(false);
    expect(isEncryptedContainer(withEncryptionFlag(zip))).toBe(true);
  });

  it("calls a DRM book encrypted and a book with obfuscated fonts readable", () => {
    expect(isEncryptedContainer(epub())).toBe(false);
    expect(isEncryptedContainer(epub(encryptionXml("http://www.idpf.org/2008/embedding", "fonts/a.otf")))).toBe(false);
    expect(isEncryptedContainer(epub(encryptionXml("http://ns.adobe.com/pdf/enc#RC", "fonts/a.otf")))).toBe(false);
    expect(isEncryptedContainer(epub(encryptionXml("http://www.w3.org/2001/04/xmlenc#aes128-cbc", "OEBPS/ch1.xhtml")))).toBe(true);
  });

  it("names a password-protected or rights-managed Office file by its streams", () => {
    expect(isEncryptedContainer(cfb("EncryptionInfo", "EncryptedPackage"))).toBe(true);
    expect(isEncryptedContainer(cfb("\u0006DataSpaces", "DRMEncryptedDataSpace"))).toBe(true);
    expect(isEncryptedContainer(cfb("Workbook"))).toBe(false);
    // One of the pair alone is not the encrypted-package layout.
    expect(isEncryptedContainer(cfb("EncryptedPackage"))).toBe(false);
  });

  it("leaves everything else alone", () => {
    expect(isEncryptedContainer(strToU8("%PDF-1.7\n/Encrypt 5 0 R"))).toBe(false);
    expect(isEncryptedContainer(new Uint8Array(0))).toBe(false);
    expect(isEncryptedContainer(strToU8("PK\u0003\u0004"))).toBe(false);
  });
});

describe("epubEncryptedPaths", () => {
  it("lists only what a non-font method encrypts, decoded", () => {
    const xml =
      encryptionXml("http://www.idpf.org/2008/embedding", "fonts/a.otf") +
      encryptionXml("http://www.w3.org/2001/04/xmlenc#aes256-cbc", "OEBPS/chapter%201.xhtml");
    expect(epubEncryptedPaths(xml)).toEqual(["OEBPS/chapter 1.xhtml"]);
  });

  it("reads a hostile megabyte in linear time", () => {
    // Each of these took 8-23 s under the regex that matched whole blocks.
    const hostile = [
      "<EncryptedData ".repeat(70_000),
      `<EncryptedData>${"<EncryptionMethod ".repeat(58_000)}</EncryptedData>`,
      `<EncryptedData><EncryptionMethod Algorithm='x'/>${"<CipherReference URI=".repeat(50_000)}</EncryptedData>`,
    ];
    const started = performance.now();
    for (const xml of hostile) expect(epubEncryptedPaths(xml)).toEqual([]);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
