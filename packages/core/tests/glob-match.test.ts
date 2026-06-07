import { describe, expect, it } from "vitest";
import { matchesAnyPattern, pathMatches } from "../src/path-utils/glob-match";

describe("pathMatches — bare pattern (no slash)", () => {
  it("matches the same directory name anywhere in the path", () => {
    expect(pathMatches("app/node_modules/react/index.js", "node_modules")).toBe(true);
    expect(pathMatches("node_modules/foo.js", "node_modules")).toBe(true);
    expect(pathMatches("packages/core/node_modules/x.ts", "node_modules")).toBe(true);
  });

  it("matches glob patterns against any segment", () => {
    expect(pathMatches("src/foo.log", "*.log")).toBe(true);
    expect(pathMatches("logs/today/error.log", "*.log")).toBe(true);
    expect(pathMatches("dist/bundle.min.js", "*.min.js")).toBe(true);
  });

  it("does not match when no segment matches", () => {
    expect(pathMatches("src/foo.ts", "node_modules")).toBe(false);
    expect(pathMatches("src/foo.ts", "*.log")).toBe(false);
  });
});

describe("pathMatches — slashed pattern", () => {
  it("matches at the root", () => {
    expect(pathMatches("src/index.ts", "src/**/*")).toBe(true);
    expect(pathMatches("src/sub/file.ts", "src/**/*")).toBe(true);
  });

  it("matches at any depth (fixes the silent-drop bug)", () => {
    expect(pathMatches("myrepo/src/index.ts", "src/**/*")).toBe(true);
    expect(pathMatches("packages/core/src/index.ts", "src/**/*")).toBe(true);
    expect(pathMatches("a/b/c/src/d/e.ts", "src/**/*")).toBe(true);
  });

  it("does not match unrelated paths", () => {
    expect(pathMatches("unrelated/dir/file.ts", "src/**/*")).toBe(false);
    expect(pathMatches("dist/bundle.js", "src/**/*")).toBe(false);
  });

  it("respects brace expansion in slashed patterns", () => {
    expect(pathMatches("packages/core/src/index.ts", "src/**/*.{ts,tsx}")).toBe(true);
    expect(pathMatches("packages/core/src/index.css", "src/**/*.{ts,tsx}")).toBe(false);
  });
});

describe("pathMatches — edge cases", () => {
  it("returns false for empty inputs", () => {
    expect(pathMatches("", "src/**/*")).toBe(false);
    expect(pathMatches("src/index.ts", "")).toBe(false);
  });

  it("matches dotfiles (dot: true is on)", () => {
    expect(pathMatches("project/.env", ".env")).toBe(true);
    expect(pathMatches(".env.local", ".env.*")).toBe(true);
  });
});

describe("matchesAnyPattern — comma-separated list", () => {
  it("returns true when any pattern in the list matches", () => {
    expect(matchesAnyPattern("src/index.ts", "*.log, src/**/*, dist/*")).toBe(true);
    expect(matchesAnyPattern("src/index.ts", "*.log, dist/*")).toBe(false);
  });

  it("tolerates whitespace and empty entries", () => {
    expect(matchesAnyPattern("src/index.ts", " , src/**/* , ")).toBe(true);
  });

  it("returns false for an empty list", () => {
    expect(matchesAnyPattern("src/index.ts", "")).toBe(false);
    expect(matchesAnyPattern("src/index.ts", "   ")).toBe(false);
  });
});
