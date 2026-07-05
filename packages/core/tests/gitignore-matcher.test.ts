import { describe, expect, it } from "vitest";
import {
  collectGitignoreSources,
  createGitignoreMatcher,
} from "../src/path-utils/gitignore-matcher";

describe("createGitignoreMatcher", () => {
  it("ignores a path matched by a single root .gitignore", () => {
    const matcher = createGitignoreMatcher([{ dir: "", content: "node_modules/\n" }]);

    expect(matcher.ignores("node_modules/react/index.js")).toBe(true);
    expect(matcher.ignores("src/app.ts")).toBe(false);
  });

  it("honors a negation that re-includes a file within the same .gitignore", () => {
    const matcher = createGitignoreMatcher([{ dir: "", content: "*.log\n!keep.log\n" }]);

    expect(matcher.ignores("debug.log")).toBe(true);
    expect(matcher.ignores("keep.log")).toBe(false);
  });

  it("matches a bare directory name at any depth (git semantics)", () => {
    const matcher = createGitignoreMatcher([{ dir: "", content: "dist\n" }]);

    expect(matcher.ignores("dist/bundle.js")).toBe(true);
    expect(matcher.ignores("packages/x/dist/bundle.js")).toBe(true);
    expect(matcher.ignores("src/index.ts")).toBe(false);
  });

  it("lets a nested .gitignore re-include what a parent ignored", () => {
    const matcher = createGitignoreMatcher([
      { dir: "", content: "*.txt\n" },
      { dir: "docs", content: "!notes.txt\n" },
    ]);

    expect(matcher.ignores("readme.txt")).toBe(true);
    expect(matcher.ignores("docs/notes.txt")).toBe(false);
    expect(matcher.ignores("docs/scratch.txt")).toBe(true);
  });

  it("scopes each .gitignore to its own directory (drop-root prefix)", () => {
    // A folder drop prefixes every path with the project dir, so the root
    // .gitignore lives at `myproject/.gitignore` and must not leak sideways.
    const matcher = createGitignoreMatcher([{ dir: "myproject", content: "node_modules/\n" }]);

    expect(matcher.ignores("myproject/node_modules/x.js")).toBe(true);
    expect(matcher.ignores("myproject/src/app.ts")).toBe(false);
    expect(matcher.ignores("other/node_modules/x.js")).toBe(false);
  });

  it("returns false when there are no sources", () => {
    const matcher = createGitignoreMatcher([]);
    expect(matcher.ignores("anything.ts")).toBe(false);
  });
});

describe("collectGitignoreSources", () => {
  it("picks .gitignore entries and derives each governing directory", () => {
    const sources = collectGitignoreSources([
      { path: ".gitignore", content: "dist/\n" },
      { path: "src/app.ts", content: "export const x = 1;" },
      { path: "packages/x/.gitignore", content: "build/\n" },
    ]);

    expect(sources).toEqual([
      { dir: "", content: "dist/\n" },
      { dir: "packages/x", content: "build/\n" },
    ]);
  });

  it("ignores files that merely end in .gitignore but are not named exactly", () => {
    const sources = collectGitignoreSources([{ path: "config/foo.gitignore", content: "x\n" }]);
    expect(sources).toEqual([]);
  });

  it("feeds straight into the matcher for a drop-root folder", () => {
    const entries = [
      { path: "myproject/.gitignore", content: "dist/\n" },
      { path: "myproject/dist/bundle.js", content: "" },
      { path: "myproject/src/app.ts", content: "" },
    ];
    const matcher = createGitignoreMatcher(collectGitignoreSources(entries));

    expect(matcher.ignores("myproject/dist/bundle.js")).toBe(true);
    expect(matcher.ignores("myproject/src/app.ts")).toBe(false);
  });
});
