import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Resolved the way Node resolves them, not read off package.json ranges: core
// asks for officeparser ^8.1.1, so a lockfile refresh can move the pdf.js it
// brings without touching any file in this repo.
const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const fromCore = createRequire(join(web, "../../packages/core/package.json"));
let officeparser = dirname(fromCore.resolve("officeparser"));
const nameAt = (dir: string) =>
  existsSync(join(dir, "package.json")) && JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).name;
while (nameAt(officeparser) !== "officeparser") officeparser = dirname(officeparser);

const version = (from: string) => createRequire(from)("pdfjs-dist/package.json").version as string;

describe("pdf.js worker", () => {
  it("is the version of the pdf.js officeparser runs", () => {
    // The web serves its own pdfjs-dist worker to officeparser (extract-document-client.ts).
    // pdf.js refuses a worker of another version, so a drift fails every PDF that
    // falls back from liteparse to officeparser: from 2026-10-15 to 10-31 every
    // one did, with "The API version 6.2.108 does not match the Worker version 6.1.200".
    expect(version(join(web, "package.json"))).toBe(
      version(join(officeparser, "package.json")),
    );
  });
});
