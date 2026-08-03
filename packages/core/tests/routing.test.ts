import { describe, expect, it } from "vitest";
import { gzipSync, strToU8 } from "fflate";
import { routeBytes } from "../src/file-processing/routing";
import { makeTar, minimalDocx, minimalEpub, minimalOdt, plainZip } from "./fixtures/containers";

const utf8 = (s: string) => strToU8(s);

describe("routeBytes", () => {
  it("routes the OOXML family to the office parser", async () => {
    expect(await routeBytes(minimalDocx("hello"))).toEqual({
      kind: "extract",
      parserId: "office",
      format: "docx",
    });
  });

  it("routes OpenDocument to the office parser", async () => {
    expect(await routeBytes(minimalOdt())).toEqual({
      kind: "extract",
      parserId: "office",
      format: "odt",
    });
  });

  it("routes a PDF by its own bytes, with no filename involved", async () => {
    const pdf = utf8("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n");
    expect(await routeBytes(pdf)).toEqual({
      kind: "extract",
      parserId: "office",
      format: "pdf",
    });
  });

  it("routes RTF to extraction even though its bytes are legible ASCII", async () => {
    const rtf = utf8(`{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times;}}\\f0 Hello.\\par}`);
    expect(await routeBytes(rtf)).toEqual({
      kind: "extract",
      parserId: "office",
      format: "rtf",
    });
  });

  it("routes EPUB to its own parser, which no platform registers yet", async () => {
    // Membership is a property of the format, not of the reader inventory
    // (ADR-0011): the route exists before any loader does, and a build without
    // one answers "couldn't extract" rather than reclassifying the file.
    expect(await routeBytes(minimalEpub())).toEqual({
      kind: "extract",
      parserId: "epub",
      format: "epub",
    });
  });

  it("tells a plain zip apart from the documents that share its signature", async () => {
    expect(await routeBytes(plainZip())).toEqual({ kind: "expand", archive: "zip" });
  });

  it("routes a tar", async () => {
    expect(await routeBytes(makeTar({ "a.txt": "one" }))).toEqual({
      kind: "expand",
      archive: "tar",
    });
  });

  it("routes a pre-POSIX v7 tar, which carries no ustar magic", async () => {
    const v7 = makeTar({ "a.txt": "one" }, "");
    expect(await routeBytes(v7)).toEqual({ kind: "expand", archive: "tar" });
  });

  it("routes gzip without needing to know whether a tar is inside", async () => {
    expect(await routeBytes(gzipSync(utf8("plain text\n")))).toEqual({
      kind: "expand",
      archive: "gz",
    });
    expect(await routeBytes(gzipSync(makeTar({ "a.txt": "one" })))).toEqual({
      kind: "expand",
      archive: "gz",
    });
  });

  it("reports archives it cannot open rather than calling them opaque", async () => {
    const rar = new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00, ...Array(64).fill(0)]);
    expect(await routeBytes(rar)).toEqual({ kind: "expand", archive: "rar" });

    const sevenZip = new Uint8Array([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, ...Array(64).fill(0)]);
    expect(await routeBytes(sevenZip)).toEqual({ kind: "expand", archive: "7z" });
  });

  it("settles known media containers without loading a parser", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(32).fill(7)]);
    expect(await routeBytes(png)).toEqual({ kind: "binary" });
  });

  it("abstains on plain source, leaving the byte classifier to decide", async () => {
    expect(await routeBytes(utf8(`import { a } from "./b";\n`))).toEqual({ kind: "unknown" });
    expect(await routeBytes(utf8("# Title\n\nSome prose.\n"))).toEqual({ kind: "unknown" });
    expect(await routeBytes(new Uint8Array(0))).toEqual({ kind: "unknown" });
  });

  it("abstains on XML and SVG rather than calling recognized-but-textual binary", async () => {
    const xml = utf8(`<?xml version="1.0"?><root><item>text</item></root>`);
    expect(await routeBytes(xml)).toEqual({ kind: "unknown" });

    const svg = utf8(`<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>`);
    expect(await routeBytes(svg)).toEqual({ kind: "unknown" });
  });

  it("ignores the filename entirely — the same bytes always route the same way", async () => {
    const docx = minimalDocx("renamed");
    // The historical bug: this file named `.zip` used to be unpacked into
    // word/document.xml fragments instead of being read.
    expect(await routeBytes(docx)).toEqual({
      kind: "extract",
      parserId: "office",
      format: "docx",
    });
  });
});
