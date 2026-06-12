import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { matchesAnyPattern, pathMatches } from "../src/path-utils/glob-match";

const SAFE_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789_";
const safeSegment = fc.string({
  minLength: 1,
  maxLength: 10,
  unit: fc.constantFrom(...SAFE_CHARS.split("")),
});
const safePathSegments = fc.array(safeSegment, { minLength: 0, maxLength: 4 });

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

describe("pathMatches — property: bare segment matches anywhere", () => {
  it("a bare segment between any prefix/suffix matches itself", () => {
    fc.assert(
      fc.property(safePathSegments, safeSegment, safePathSegments, (prefix, segment, suffix) => {
        const path = [...prefix, segment, ...suffix].join("/");
        return pathMatches(path, segment) === true;
      }),
    );
  });

  it("a bare glob matches any segment with the corresponding extension", () => {
    fc.assert(
      fc.property(safePathSegments, safeSegment, safePathSegments, (prefix, stem, suffix) => {
        const path = [...prefix, `${stem}.log`, ...suffix].join("/");
        return pathMatches(path, "*.log") === true;
      }),
    );
  });
});

describe("pathMatches — property: slashed pattern depth-invariance", () => {
  it("'src/**/*' matches at every prefix depth", () => {
    fc.assert(
      fc.property(safePathSegments, safeSegment, (prefix, leaf) => {
        const path = [...prefix, "src", `${leaf}.ts`].join("/");
        return pathMatches(path, "src/**/*") === true;
      }),
    );
  });

  it("a deep slashed pattern matches when prefixed", () => {
    fc.assert(
      fc.property(safePathSegments, safeSegment, (prefix, leaf) => {
        const path = [...prefix, "packages", "core", "src", `${leaf}.ts`].join("/");
        return pathMatches(path, "packages/core/src/**/*") === true;
      }),
    );
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

describe("matchesAnyPattern — property: equivalent to some(pathMatches)", () => {
  it("matches the list iff any individual pattern matches", () => {
    const pathGen = fc
      .array(safeSegment, { minLength: 1, maxLength: 5 })
      .map((parts) => parts.join("/"));
    const patternGen = fc.array(safeSegment, { minLength: 0, maxLength: 4 });

    fc.assert(
      fc.property(pathGen, patternGen, (path, patterns) => {
        const joined = patterns.join(",");
        const list = matchesAnyPattern(path, joined);
        const any = patterns.some((p) => pathMatches(path, p));
        return list === any;
      }),
    );
  });

  it("ignores surrounding whitespace around each pattern", () => {
    const pathGen = fc
      .array(safeSegment, { minLength: 1, maxLength: 5 })
      .map((parts) => parts.join("/"));

    fc.assert(
      fc.property(pathGen, safeSegment, (path, pattern) => {
        const padded = `  ${pattern}  `;
        return matchesAnyPattern(path, padded) === pathMatches(path, pattern);
      }),
    );
  });
});
