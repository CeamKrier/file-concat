import { describe, expect, it } from "vitest";
import { assembleOutput } from "../src/file-processing/output";
import { generateFileTree } from "../src/path-utils/file-tree";

const files = [
  { path: "src/index.ts", content: "export const x = 1;\n" },
  { path: "src/util.ts", content: "export function add(a: number, b: number) {\n  return a + b;\n}\n" },
];
const tree = generateFileTree(files.map((f) => f.path));

describe("assembleOutput xml", () => {
  it("wraps the codebase in a single root with summary, directory_structure and files", () => {
    const output = assembleOutput({
      projectName: "demo",
      files,
      tree,
      source: "github:owner/demo",
      style: "xml",
    });

    expect(output.startsWith("<codebase ")).toBe(true);
    expect(output).toContain(`project="demo"`);
    expect(output).toContain(`source="github:owner/demo"`);
    expect(output).toContain("<summary>");
    expect(output).toContain("<directory_structure>");
    expect(output).toContain("<files>");
    expect(output).toContain(`<file path="src/index.ts" language="typescript">`);
    expect(output.trimEnd().endsWith("</codebase>")).toBe(true);
  });

  it("does not emit markdown code fences inside file blocks", () => {
    const output = assembleOutput({
      projectName: "demo",
      files,
      tree,
      style: "xml",
    });
    expect(output).not.toContain("```");
  });

  it("emits file content verbatim while escaping only attributes", () => {
    const output = assembleOutput({
      projectName: "a&b",
      files: [{ path: "x<y>.ts", content: "const a = 1 < 2 && 3 > 1;\n" }],
      tree: "x<y>.ts\n",
      style: "xml",
    });

    // Attributes stay escaped: a stray quote/angle there breaks the tag itself.
    expect(output).toContain(`project="a&amp;b"`);
    expect(output).toContain(`path="x&lt;y&gt;.ts"`);
    // Content is verbatim: the code the user pastes must not be entity-corrupted.
    expect(output).toContain("const a = 1 < 2 && 3 > 1;");
  });

  it("keeps angle brackets, ampersands, and arrows intact in content", () => {
    const output = assembleOutput({
      projectName: "demo",
      files: [{ path: "g.ts", content: "const f = (x: Record<string, number>) => x && true;\n" }],
      tree: "g.ts\n",
      style: "xml",
    });
    expect(output).toContain("const f = (x: Record<string, number>) => x && true;");
    expect(output).not.toContain("&lt;string");
    expect(output).not.toContain("=&gt;");
  });

  it("emits literal tag-like sequences in content verbatim (delimiter, not strict XML)", () => {
    const output = assembleOutput({
      projectName: "demo",
      files: [{ path: "doc.md", content: 'Example: <file path="foo">bar</file>' }],
      tree: "doc.md\n",
      style: "xml",
    });
    expect(output).toContain('Example: <file path="foo">bar</file>');
    expect(output).not.toContain("&lt;file");
  });

  it("declares part metadata in summary when part is set", () => {
    const output = assembleOutput({
      projectName: "demo",
      files,
      tree,
      style: "xml",
      part: { index: 2, total: 5 },
    });
    expect(output).toContain("Part 2 of 5.");
  });

  it("renders an empty files list without crashing", () => {
    const output = assembleOutput({
      projectName: "empty",
      files: [],
      tree: "",
      style: "xml",
    });
    expect(output).toContain("File count: 0.");
    expect(output).toContain("<files>");
    expect(output).toContain("</files>");
  });
});

describe("assembleOutput markdown", () => {
  it("starts with a heading and renders each file as a fenced block", () => {
    const output = assembleOutput({
      projectName: "demo",
      files,
      tree,
      source: "local",
      style: "markdown",
    });

    expect(output.startsWith("# Codebase: demo")).toBe(true);
    expect(output).toContain("**Source:** local");
    expect(output).toContain("## Directory structure");
    expect(output).toContain("## Files");
    expect(output).toContain("### src/index.ts");
    expect(output).toContain("```typescript");
    expect(output).toContain("export const x = 1;");
  });

  it("does not emit XML tags", () => {
    const output = assembleOutput({
      projectName: "demo",
      files,
      tree,
      style: "markdown",
    });
    expect(output).not.toContain("<file ");
    expect(output).not.toContain("<codebase ");
    expect(output).not.toContain("<directory_structure>");
  });

  it("annotates the heading with part metadata when part is set", () => {
    const output = assembleOutput({
      projectName: "demo",
      files,
      tree,
      style: "markdown",
      part: { index: 1, total: 3 },
    });
    expect(output.startsWith("# Codebase: demo (Part 1 of 3)")).toBe(true);
  });
});
