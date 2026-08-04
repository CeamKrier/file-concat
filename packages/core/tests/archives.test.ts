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
