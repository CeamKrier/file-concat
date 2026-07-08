import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { extractZipballFiles } from "../src/sources/adapters/github";

const zip = (files: Record<string, string>): Uint8Array => {
  const entries: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(files)) entries[k] = strToU8(v);
  return zipSync(entries);
};

describe("extractZipballFiles (GitHub zipball fallback)", () => {
  it("strips the top-level owner-repo-sha/ prefix and returns files", () => {
    const bytes = zip({
      "owner-repo-abc123/README.md": "# hi",
      "owner-repo-abc123/src/index.ts": "export const x = 1;",
    });

    const files = extractZipballFiles(bytes);

    expect(files.map((f) => f.path).sort()).toEqual(["README.md", "src/index.ts"]);
    const readme = files.find((f) => f.path === "README.md")!;
    expect(readme.content).toBe("# hi");
    expect(readme.name).toBe("README.md");
  });

  it("skips the bare top-level directory entry", () => {
    const bytes = zip({
      "owner-repo-abc123/": "",
      "owner-repo-abc123/a.ts": "a",
    });

    const files = extractZipballFiles(bytes);

    expect(files.map((f) => f.path)).toEqual(["a.ts"]);
  });

  it("filters to a subPath and strips it from display paths", () => {
    const bytes = zip({
      "owner-repo-abc123/README.md": "root",
      "owner-repo-abc123/src/index.ts": "idx",
      "owner-repo-abc123/src/util/help.ts": "help",
    });

    const files = extractZipballFiles(bytes, "src");

    expect(files.map((f) => f.path).sort()).toEqual(["index.ts", "util/help.ts"]);
  });
});
