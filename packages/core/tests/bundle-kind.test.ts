import { describe, expect, it } from "vitest";
import { classifyBundleKind } from "../src/file-processing/bundle-kind";

// The classifier decides the output's root tag and summary noun (ADR-0005).
// Every file votes CODE, DOC, or OTHER; the tag is the plurality of CODE vs DOC
// by file count, with a tie or all-OTHER bundle falling through to neutral.
describe("classifyBundleKind", () => {
  it("calls a source-dominated bundle a codebase", () => {
    const paths = Array.from({ length: 40 }, (_, i) => `src/mod${i}.ts`);
    paths.push("README.md");
    expect(classifyBundleKind(paths)).toBe("codebase");
  });

  it("calls a single document a set of documents", () => {
    expect(classifyBundleKind(["dava-1-iptal-karar/karar.pdf"])).toBe("documents");
  });

  it("calls a document-dominated bundle a set of documents", () => {
    const paths = ["site/config.ts", "site/build.ts"];
    for (let i = 0; i < 50; i++) paths.push(`docs/page-${i}.md`);
    expect(classifyBundleKind(paths)).toBe("documents");
  });

  it("falls through to neutral files on a code/doc tie", () => {
    const paths = ["a.py", "b.py", "c.py", "one.pdf", "two.pdf", "three.pdf"];
    expect(classifyBundleKind(paths)).toBe("files");
  });

  it("falls through to neutral files when only config/data is present", () => {
    expect(classifyBundleKind(["a.json", "b.yaml", "c.toml", "d.csv"])).toBe("files");
  });

  it("classifies an empty bundle as neutral files", () => {
    expect(classifyBundleKind([])).toBe("files");
  });

  it("counts prose (md, txt, rst) as documents", () => {
    expect(classifyBundleKind(["notes.md", "outline.txt", "spec.rst"])).toBe("documents");
  });

  it("counts every extractable office format as a document", () => {
    const paths = ["a.pdf", "b.docx", "c.xlsx", "d.pptx", "e.odt", "f.ods", "g.odp"];
    expect(classifyBundleKind(paths)).toBe("documents");
  });

  it("counts markup and stylesheets (html, css) as code", () => {
    expect(classifyBundleKind(["index.html", "app.css", "theme.scss"])).toBe("codebase");
  });

  it("counts extensionless Dockerfile and Makefile as code", () => {
    expect(classifyBundleKind(["Dockerfile", "Makefile"])).toBe("codebase");
  });

  it("is a pure function of the file set — order does not change the verdict", () => {
    const a = classifyBundleKind(["x.ts", "y.pdf", "z.md"]);
    const b = classifyBundleKind(["z.md", "y.pdf", "x.ts"]);
    expect(a).toBe(b);
  });
});
