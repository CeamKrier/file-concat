import { describe, expect, it } from "vitest";
import {
  assembleOutput,
  generateFileTree,
  generateProjectName,
  type OutputFile,
  type OutputStyle,
} from "@fileconcat/core";
import { splitBundle, type Component } from "../scripts/bundle-parts.js";

const STYLES: OutputStyle[] = ["xml", "markdown", "plain"];

// Content chosen to break a naive split: a fenced markdown block forces a longer
// wrapper fence, and the XML-looking lines are exactly the delimiters the split
// searches for.
const FILES: OutputFile[] = [
  { path: "src/index.ts", content: "export const a = 1;\n" },
  {
    path: "README.md",
    content: "# Title\n\n```ts\nconst x = 1;\n```\n\nSee <directory_structure>.\n",
  },
  { path: "docs/notes.txt", content: "</file>\n</files>\nplain text with a trailing newline\n" },
  { path: "empty.txt", content: "" },
];

function split(style: OutputStyle, files: OutputFile[] = FILES) {
  const paths = files.map((f) => f.path);
  const options = {
    projectName: generateProjectName(paths),
    files,
    tree: generateFileTree(paths),
    style,
    source: "local:fixture",
  };
  return { options, ...splitBundle(options) };
}

const textOf = (pieces: { component: Component; text: string }[], component: Component) =>
  pieces.filter((p) => p.component === component).map((p) => p.text);

describe("splitBundle", () => {
  for (const style of STYLES) {
    describe(style, () => {
      it("reassembles the bundle the product would have produced", () => {
        const { options, bundle, pieces } = split(style);
        expect(bundle).toBe(assembleOutput(options));
        expect(pieces.map((p) => p.text).join("")).toBe(bundle);
      });

      it("attributes every file's content to content, verbatim and in order", () => {
        const { pieces } = split(style);
        expect(textOf(pieces, "content")).toEqual(FILES.map((f) => f.content));
      });

      it("keeps the preamble and the file list out of each other", () => {
        const { pieces } = split(style);
        const header = textOf(pieces, "header").join("");
        expect(header).toContain("packed snapshot");
        expect(header).toContain("local:fixture");
        expect(header).not.toContain("src/index.ts");
      });

      it("puts the whole tree section, wrapper included, in tree", () => {
        const { options, pieces } = split(style);
        const tree = textOf(pieces, "tree").join("");
        expect(tree).toContain(options.tree.trimEnd());
        expect(tree.startsWith(options.tree.trimEnd())).toBe(false);
      });

      it("names every file in the markers", () => {
        const { pieces } = split(style);
        const markers = textOf(pieces, "markers").join("");
        for (const file of FILES) expect(markers).toContain(file.path);
      });
    });
  }

  it("charges xml for the root close tag it actually opened, and plain for no chrome", () => {
    // The root tag follows the bundle kind (ADR-0005), so this fixture closes
    // </documents> rather than </codebase>. Read it back off the bundle.
    const { bundle, pieces } = split("xml");
    const tag = /^<([A-Za-z_][\w-]*)[ >]/.exec(bundle)![1];
    expect(textOf(pieces, "chrome").join("")).toBe(`<files>\n</files>\n</${tag}>\n`);
    expect(textOf(split("plain").pieces, "chrome").join("")).toBe("");
  });

  it("survives a bundle with no files", () => {
    for (const style of STYLES) {
      const { bundle, pieces } = split(style, []);
      expect(pieces.map((p) => p.text).join("")).toBe(bundle);
      expect(textOf(pieces, "content")).toEqual([]);
    }
  });
});
