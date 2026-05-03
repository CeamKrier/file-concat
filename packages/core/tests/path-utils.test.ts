import { describe, expect, it } from "vitest";
import {
  generateFileTree,
  generateProjectName,
  getLanguageFromPath,
  shouldSkipPath,
} from "../src/path-utils";

describe("generateFileTree", () => {
  it("builds a tree from file paths", () => {
    const output = generateFileTree(["src/index.ts", "src/utils/math.ts", "README.md"]);

    expect(output).toBe(
      "├── src\n" +
        "│   ├── index.ts\n" +
        "│   └── utils\n" +
        "│       └── math.ts\n" +
        "└── README.md\n",
    );
  });
});

describe("getLanguageFromPath", () => {
  it("detects known extensions", () => {
    expect(getLanguageFromPath("app.tsx")).toBe("tsx");
    expect(getLanguageFromPath("script.py")).toBe("python");
  });

  it("handles special filenames", () => {
    expect(getLanguageFromPath("Dockerfile")).toBe("dockerfile");
    expect(getLanguageFromPath("Makefile")).toBe("makefile");
  });
});

describe("generateProjectName", () => {
  it("uses filename for single file", () => {
    expect(generateProjectName(["README.md"])).toBe("readme");
  });

  it("uses common root directory", () => {
    expect(generateProjectName(["project/src/index.ts", "project/README.md"])).toBe("project");
  });

  it("combines multiple top-level dirs", () => {
    expect(generateProjectName(["api/index.ts", "web/app.tsx"]).includes("api")).toBe(true);
  });
});

describe("shouldSkipPath", () => {
  it("skips default ignore patterns", () => {
    expect(shouldSkipPath("node_modules/react/index.js")).toBe(true);
    expect(shouldSkipPath(".git/config")).toBe(true);
  });

  it("allows normal source files", () => {
    expect(shouldSkipPath("src/index.ts")).toBe(false);
  });
});
