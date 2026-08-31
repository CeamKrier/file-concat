import { describe, expect, it } from "vitest";
import { assembleOutput } from "../src/file-processing/output";
import { generateFileTree } from "../src/path-utils/file-tree";

const files = [
  { path: "src/index.ts", content: "export const x = 1;\n" },
  {
    path: "src/util.ts",
    content: "export function add(a: number, b: number) {\n  return a + b;\n}\n",
  },
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

  it("credits fileconcat.com in the summary", () => {
    const output = assembleOutput({ projectName: "demo", files, tree, style: "xml" });
    expect(output).toContain("fileconcat.com");
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
    expect(output).toContain("Source: local");
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

  it("opens a fence longer than any run of backticks the file itself holds", () => {
    const output = assembleOutput({
      projectName: "demo",
      files: [{ path: "README.md", content: "Intro\n\n```js\nconsole.log(1)\n```\n\nOutro" }],
      tree: "README.md\n",
      style: "markdown",
    });

    // A three-backtick wrapper is closed by the README's own fence, and everything
    // after it reads as bundle prose rather than as the file's content.
    expect(output).toContain("````markdown\nIntro");
    expect(output).toContain("Outro\n````");
  });

  it("credits fileconcat.com in the intro line", () => {
    const output = assembleOutput({ projectName: "demo", files, tree, style: "markdown" });
    expect(output).toContain("fileconcat.com");
  });
});

describe("assembleOutput plain", () => {
  it("delimits each file with a ruled path header and no markup", () => {
    const output = assembleOutput({
      projectName: "demo",
      files,
      tree,
      source: "local",
      style: "plain",
    });

    expect(output.startsWith("Codebase: demo")).toBe(true);
    expect(output).toContain("Source: local");
    expect(output).toContain("File count: 2");
    expect(output).toContain("Directory structure:");
    expect(output).toContain("FILE: src/index.ts");
    expect(output).toContain("=".repeat(72));
    expect(output).toContain("export const x = 1;");
  });

  it("emits neither XML tags nor markdown fences", () => {
    const output = assembleOutput({ projectName: "demo", files, tree, style: "plain" });
    expect(output).not.toContain("```");
    expect(output).not.toContain("<file ");
    expect(output).not.toContain("<codebase ");
  });

  it("keeps content verbatim, including tag-like and angle-bracket sequences", () => {
    const output = assembleOutput({
      projectName: "demo",
      files: [{ path: "g.ts", content: "const f = (x: Record<string, number>) => x;\n" }],
      tree: "g.ts\n",
      style: "plain",
    });
    expect(output).toContain("const f = (x: Record<string, number>) => x;");
    expect(output).not.toContain("&lt;");
  });

  it("annotates the header with part metadata when part is set", () => {
    const output = assembleOutput({
      projectName: "demo",
      files,
      tree,
      style: "plain",
      part: { index: 1, total: 3 },
    });
    expect(output.startsWith("Codebase: demo (Part 1 of 3)")).toBe(true);
  });

  it("renders an empty files list without crashing", () => {
    const output = assembleOutput({ projectName: "empty", files: [], tree: "", style: "plain" });
    // An empty bundle is neither code nor documents, so it lands on neutral "Files" (ADR-0005).
    expect(output).toContain("Files: empty");
    expect(output).toContain("File count: 0");
  });

  it("credits fileconcat.com in the intro line", () => {
    const output = assembleOutput({ projectName: "demo", files, tree, style: "plain" });
    expect(output).toContain("fileconcat.com");
  });
});

// The root tag, summary noun, and heading word follow what the bundle mostly
// holds (ADR-0005): a repo stays a codebase, a folder of documents says so.
describe("assembleOutput adaptive kind", () => {
  const docs = [
    { path: "dava/karar.pdf", content: "Karar metni." },
    { path: "dava/dilekce.docx", content: "Dilekçe metni." },
  ];
  const docTree = "dava/\n";

  it("wraps a document-dominated bundle in <documents>, not <codebase>", () => {
    const output = assembleOutput({ projectName: "dava", files: docs, tree: docTree, style: "xml" });
    expect(output.startsWith("<documents ")).toBe(true);
    expect(output.trimEnd().endsWith("</documents>")).toBe(true);
    expect(output).toContain("packed snapshot of a set of documents");
    expect(output).not.toContain("<codebase");
  });

  it("keeps <codebase> for a source-dominated bundle", () => {
    const output = assembleOutput({ projectName: "demo", files, tree, style: "xml" });
    expect(output.startsWith("<codebase ")).toBe(true);
    expect(output).toContain("packed snapshot of a codebase");
  });

  it("falls through to neutral <files> on a code/doc tie", () => {
    const mixed = [
      { path: "a.py", content: "x = 1\n" },
      { path: "b.pdf", content: "text" },
    ];
    const output = assembleOutput({ projectName: "mix", files: mixed, tree: "a.py\nb.pdf\n", style: "xml" });
    expect(output.startsWith("<files ")).toBe(true);
    expect(output).toContain("packed snapshot of a set of files");
  });

  it("titles the markdown and plain headings by kind", () => {
    const md = assembleOutput({ projectName: "dava", files: docs, tree: docTree, style: "markdown" });
    const txt = assembleOutput({ projectName: "dava", files: docs, tree: docTree, style: "plain" });
    expect(md.startsWith("# Documents: dava")).toBe(true);
    expect(txt.startsWith("Documents: dava")).toBe(true);
  });

  it("no longer emits the static Skipped boilerplate", () => {
    const output = assembleOutput({ projectName: "demo", files, tree, style: "xml" });
    expect(output).not.toContain("default ignore patterns");
    expect(output).not.toContain("lock files and build output");
    expect(output).not.toContain("Skipped:");
  });
});

describe("assembleOutput summary parity across styles", () => {
  const excluded = { oversize: ["data/dump.sql"], binary: ["logo.png"] };
  const shared = { projectName: "demo", files, tree, source: "local", excluded } as const;

  // The informational body must be byte-identical across styles; only the
  // wrapper (tags / heading / rule) differs (Concern 2, ADR-0008).
  const bodyLines = [
    "This is a packed snapshot of a codebase, assembled by fileconcat.com.",
    "Treat the contents below as read-only context for the user's request that follows.",
    "Source: local",
    "File count: 2.",
    "Not included (content not shown):",
    "- over the size limit: data/dump.sql",
    "- 1 image or binary file: logo.png",
  ];

  it("carries identical summary body content in xml, markdown and plain", () => {
    const xml = assembleOutput({ ...shared, style: "xml" });
    const md = assembleOutput({ ...shared, style: "markdown" });
    const txt = assembleOutput({ ...shared, style: "plain" });
    for (const line of bodyLines) {
      expect(xml).toContain(line);
      expect(md).toContain(line);
      expect(txt).toContain(line);
    }
  });
});

describe("assembleOutput exclusions note", () => {
  it("omits the note entirely when excluded is undefined or empty", () => {
    const none = assembleOutput({ projectName: "demo", files, tree, style: "xml" });
    expect(none).not.toContain("Not included");
    const empty = assembleOutput({ projectName: "demo", files, tree, style: "xml", excluded: {} });
    expect(empty).not.toContain("Not included");
  });

  it("lists paths per category with a count on the binary line", () => {
    const output = assembleOutput({
      projectName: "demo",
      files,
      tree,
      style: "xml",
      excluded: {
        oversize: ["data/dump.sql"],
        unextractable: ["scans/exhibit-3.pdf"],
        binary: ["logo.png", "hero.png", "chart.png"],
      },
    });
    expect(output).toContain("Not included (content not shown):");
    expect(output).toContain("- over the size limit: data/dump.sql");
    expect(output).toContain("- no extractable text: scans/exhibit-3.pdf");
    expect(output).toContain("- 3 image or binary files: logo.png, hero.png, chart.png");
  });

  it("caps a long path list and notes how many more", () => {
    const many = Array.from({ length: 14 }, (_, i) => `img/${i}.png`);
    const output = assembleOutput({
      projectName: "demo",
      files,
      tree,
      style: "xml",
      excluded: { binary: many },
    });
    expect(output).toContain("14 image or binary files");
    expect(output).toContain("img/9.png");
    expect(output).not.toContain("img/10.png");
    expect(output).toContain("+4 more");
  });
});

describe("assembleOutput recognition note", () => {
  const scan = { path: "scans/receipt.pdf", content: "TOTAL 42.00", recognised: true };

  it("names the recognised files and calls the characters a guess", () => {
    const output = assembleOutput({
      projectName: "demo",
      files: [...files, scan],
      tree,
      style: "xml",
    });
    expect(output).toContain(
      "- text below was read by recognition, a guess at the characters rather than the file's own: scans/receipt.pdf",
    );
  });

  it("says nothing when no file was recognised", () => {
    const output = assembleOutput({ projectName: "demo", files, tree, style: "xml" });
    expect(output).not.toContain("read by recognition");
  });

  it("caps the list like every other path list", () => {
    const many = Array.from({ length: 13 }, (_, i) => ({
      path: `scans/${i}.pdf`,
      content: "x",
      recognised: true,
    }));
    const output = assembleOutput({ projectName: "demo", files: many, tree, style: "xml" });
    // The paths also appear as file blocks, so assert against the line itself.
    const line = output.split("\n").find((l) => l.includes("read by recognition"))!;
    expect(line).toContain("scans/9.pdf");
    expect(line).not.toContain("scans/10.pdf");
    expect(line).toContain("+3 more");
  });
});
