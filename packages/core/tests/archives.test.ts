import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { gzipSync, strToU8, zipSync } from "fflate";
import {
  canExpandArchive,
  expandArchive,
  isTarHeader,
  stripArchiveSuffix,
} from "../src/file-processing/archives";
import { makeTar, plainZip } from "./fixtures/containers";

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("canExpandArchive", () => {
  it("separates the kinds we can open from the ones we only recognize", () => {
    expect(canExpandArchive("zip")).toBe(true);
    expect(canExpandArchive("tar")).toBe(true);
    expect(canExpandArchive("gz")).toBe(true);
    expect(canExpandArchive("rar")).toBe(false);
    expect(canExpandArchive("7z")).toBe(false);
  });
});

describe("stripArchiveSuffix", () => {
  it("strips .tar.gz whole, so logs.tar.gz becomes logs and not logs.tar", () => {
    expect(stripArchiveSuffix("logs.tar.gz")).toBe("logs");
    expect(stripArchiveSuffix("logs.tgz")).toBe("logs");
  });

  it("strips a single container suffix, case-insensitively", () => {
    expect(stripArchiveSuffix("Project.ZIP")).toBe("Project");
    expect(stripArchiveSuffix("dump.tar")).toBe("dump");
    expect(stripArchiveSuffix("notes.txt.gz")).toBe("notes.txt");
  });

  it("leaves a name with no container suffix alone", () => {
    expect(stripArchiveSuffix("report")).toBe("report");
    expect(stripArchiveSuffix("archive.zip.bak")).toBe("archive.zip.bak");
  });
});

describe("isTarHeader", () => {
  it("accepts a ustar header", () => {
    expect(isTarHeader(makeTar({ "a.txt": "one" }))).toBe(true);
  });

  it("accepts a v7 header, which carries no magic at all", () => {
    expect(isTarHeader(makeTar({ "a.txt": "one" }, ""))).toBe(true);
  });

  it("rejects a header whose checksum does not match its bytes", () => {
    const tampered = makeTar({ "a.txt": "one" });
    tampered[0] = "b".charCodeAt(0); // rename the entry, leave the checksum
    expect(isTarHeader(tampered)).toBe(false);
  });

  it("rejects text, zeros, and anything shorter than one block", () => {
    expect(isTarHeader(strToU8("not a tar\n"))).toBe(false);
    expect(isTarHeader(new Uint8Array(512))).toBe(false);
    expect(isTarHeader(new Uint8Array(511).fill(0x41))).toBe(false);
  });
});

describe("expandArchive", () => {
  it("roots zip entries under a folder named after the archive", () => {
    const entries = expandArchive(plainZip(), "zip", "project.zip");
    const paths = entries.map((e) => e.path).sort();
    expect(paths).toEqual(["project/README.md", "project/src/index.ts"]);
    expect(text(entries.find((e) => e.path.endsWith("index.ts"))!.bytes)).toContain("answer = 42");
  });

  it("drops __MACOSX and .DS_Store cruft", () => {
    const paths = expandArchive(plainZip(), "zip", "project.zip").map((e) => e.path);
    expect(paths.some((p) => p.includes("__MACOSX"))).toBe(false);
    expect(paths.some((p) => p.endsWith(".DS_Store"))).toBe(false);
  });

  it("skips directory entries", () => {
    const withDir = zipSync({ "docs/": new Uint8Array(0), "docs/a.md": strToU8("# a\n") });
    expect(expandArchive(withDir, "zip", "bundle.zip").map((e) => e.path)).toEqual([
      "bundle/docs/a.md",
    ]);
  });

  it("unpacks a tar, normalizing the ./ prefix tar writers add", () => {
    const entries = expandArchive(makeTar({ "./a.txt": "one", "b/c.txt": "two" }), "tar", "d.tar");
    expect(entries.map((e) => e.path)).toEqual(["d/a.txt", "d/b/c.txt"]);
    expect(text(entries[1].bytes)).toBe("two");
  });

  it("names an entry from its pax path record and keeps empty files", () => {
    const record = "path=docs/\u00fcbersicht.txt\n";
    const line = `${record.length + 3} ${record}`; // the length counts itself
    const entries = expandArchive(
      makeTar([
        ["PaxHeaders/x", line, "x"],
        ["docs/?bersicht.txt", "hallo", "0"],
        ["empty.txt", "", "0"],
      ]),
      "tar",
      "d.tar",
    );
    expect(entries.map((e) => e.path)).toEqual(["d/docs/\u00fcbersicht.txt", "d/empty.txt"]);
    expect(entries[1].bytes).toHaveLength(0);
  });

  it("unpacks a gzipped tar by looking inside, not at the name", () => {
    const bytes = gzipSync(makeTar({ "a.txt": "one" }));
    // Named `.gz`, not `.tar.gz` — the old name-based check would have emitted
    // one file of raw tar bytes here.
    expect(expandArchive(bytes, "gz", "logs.gz").map((e) => e.path)).toEqual(["logs/a.txt"]);
  });

  it("emits a single root-level file for a gzipped plain file", () => {
    const entries = expandArchive(gzipSync(strToU8("hello\n")), "gz", "notes.txt.gz");
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe("notes.txt");
    expect(text(entries[0].bytes)).toBe("hello\n");
  });

  it("returns nothing for a kind this build cannot open", () => {
    expect(expandArchive(new Uint8Array([0x52, 0x61, 0x72, 0x21]), "rar", "x.rar")).toEqual([]);
  });

  it("returns nothing for an archive that holds only cruft", () => {
    const onlyCruft = zipSync({ "__MACOSX/._x": strToU8("junk") });
    expect(expandArchive(onlyCruft, "zip", "x.zip")).toEqual([]);
  });

  it("throws on corrupt input, so callers can keep the original file", () => {
    expect(() => expandArchive(strToU8("PK\x03\x04 not really"), "zip", "x.zip")).toThrow();
  });
});

/** A zip whose names are these raw bytes with no UTF-8 flag, as macOS and
 * Windows write them: fflate writes ASCII stand-ins, then the bytes go over them. */
function rawNameZip(names: number[][], extra?: Record<number, Uint8Array>): Uint8Array {
  const standIns = names.map((name, i) => String.fromCharCode(97 + i).repeat(name.length));
  const zip = zipSync(Object.fromEntries(standIns.map((s) => [s, [strToU8("x"), { extra }]])));
  standIns.forEach((s, i) => {
    for (let at = 0; at + s.length <= zip.length; at++) {
      if ([...s].every((c, k) => zip[at + k] === c.charCodeAt(0))) zip.set(names[i], at);
    }
  });
  return zip;
}

const bytesOf = (s: string) => [...Buffer.from(s, "utf8")];
// "çalışma.txt" in CP857, the Turkish OEM code page Windows Explorer writes.
const CP857_CALISMA = [0x87, 0x61, 0x6c, 0x8d, 0x9f, 0x6d, 0x61, 0x2e, 0x74, 0x78, 0x74];

describe("zip entry names without the UTF-8 flag", () => {
  const paths = (zip: Uint8Array) => expandArchive(zip, "zip", "a.zip").map((e) => e.path);

  it("reads a macOS zip's unflagged UTF-8, composed", () => {
    expect(paths(rawNameZip([bytesOf("übersicht.txt"), bytesOf("日本語.txt")]))).toEqual([
      "a/übersicht.txt",
      "a/日本語.txt",
    ]);
  });

  it("falls back to CP437 for the whole archive when one name is not UTF-8", () => {
    // E0 A0 A4 is CP866 "рад" and also valid UTF-8 on its own.
    expect(paths(rawNameZip([[0x9a, 0x62, 0x65, 0x72], [0xe0, 0xa0, 0xa4]]))).toEqual([
      "a/Über",
      "a/αáñ",
    ]);
  });

  it("trusts a Unicode Path field only while its CRC matches the name", () => {
    const field = (crc: number) => {
      const name = strToU8("çalışma.txt");
      const out = new Uint8Array(5 + name.length);
      out[0] = 1;
      new DataView(out.buffer).setUint32(1, crc, true);
      out.set(name, 5);
      return out;
    };
    const crc = zlib.crc32(Uint8Array.from(CP857_CALISMA));
    expect(paths(rawNameZip([CP857_CALISMA], { 0x7075: field(crc) }))).toEqual(["a/çalışma.txt"]);
    expect(paths(rawNameZip([CP857_CALISMA], { 0x7075: field(crc ^ 1) }))).toEqual([
      "a/çalìƒma.txt",
    ]);
  });
});
