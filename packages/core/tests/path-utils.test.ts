import { describe, expect, it } from "vitest";
import {
  generateFileTree,
  generateProjectName,
  getLanguageFromPath,
  shouldSkipPath,
} from "../src/path-utils";

describe("generateFileTree", () => {
  it("builds a tree from file paths, sorted", () => {
    const output = generateFileTree(["src/index.ts", "src/utils/math.ts", "README.md"]);

    expect(output).toBe(
      "├── README.md\n" +
        "└── src\n" +
        "    ├── index.ts\n" +
        "    └── utils\n" +
        "        └── math.ts\n",
    );
  });

  it("renders the same tree whatever order the walk returned it in", () => {
    const paths = ["src/utils/math.ts", "README.md", "src/index.ts"];

    expect(generateFileTree([...paths].reverse())).toBe(generateFileTree(paths));
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

  it("skips test files by each ecosystem's own naming convention", () => {
    // Matched on the file name at any depth. The list used to carry
    // `__tests__` alone, so a project grouping tests in a folder lost all of
    // them and one naming them by suffix kept all of them.
    expect(shouldSkipPath("src/index.test.ts")).toBe(true);
    expect(shouldSkipPath("src/__tests__/deep.test.ts")).toBe(true);
    expect(shouldSkipPath("tests/unit/api.spec.js")).toBe(true);
    expect(shouldSkipPath("pkg/handler_test.go")).toBe(true);
    expect(shouldSkipPath("tests/test_parser.py")).toBe(true);
    expect(shouldSkipPath("app/models/user_test.py")).toBe(true);
    expect(shouldSkipPath("tests/conftest.py")).toBe(true);
    expect(shouldSkipPath("spec/parser_spec.rb")).toBe(true);
    expect(shouldSkipPath("src/main/UserServiceTest.java")).toBe(true);
    expect(shouldSkipPath("Api/OrderTests.cs")).toBe(true);
    expect(shouldSkipPath("tests/PaymentTest.php")).toBe(true);
    expect(shouldSkipPath("Sources/ParserTests.swift")).toBe(true);
    expect(shouldSkipPath("src/util_test.cc")).toBe(true);
  });

  it("keeps what the test conventions deliberately do not name", () => {
    // Nothing here matches a directory, so a helper beside a suite survives
    // and so does Rust's `tests/*.rs`, whose files carry no naming convention.
    expect(shouldSkipPath("src/__tests__/helpers.ts")).toBe(false);
    expect(shouldSkipPath("tests/helpers.ts")).toBe(false);
    expect(shouldSkipPath("tests/integration.rs")).toBe(false);

    // Extensions are spelled out rather than left as `*.test.*`, so a fixture
    // that borrows the suffix is not swept up by a pattern aimed at source.
    expect(shouldSkipPath("fixtures/schema.test.json")).toBe(false);

    // Source that merely mentions the word survives, and the match is
    // case-sensitive so a lowercase name is not read as the Java convention.
    expect(shouldSkipPath("src/test-utils.ts")).toBe(false);
    expect(shouldSkipPath("src/testing.ts")).toBe(false);
    expect(shouldSkipPath("test.ts")).toBe(false);
    expect(shouldSkipPath("src/footest.cs")).toBe(false);
  });

  it("skips go.sum but keeps go.mod", () => {
    // go.sum was the one lockfile the list missed. go.mod is the dependency
    // list a reader actually wants, so it must survive.
    expect(shouldSkipPath("go.sum")).toBe(true);
    expect(shouldSkipPath("modules/redis/go.sum")).toBe(true);
    expect(shouldSkipPath("go.mod")).toBe(false);
    expect(shouldSkipPath("modules/redis/go.mod")).toBe(false);
  });

  it("skips Godot sidecars but keeps scenes and resources", () => {
    // The sidecars are regenerated metadata and a single project brings
    // hundreds of them. Scenes and resources are the project's content, so
    // their absence from the ignore list is a decision, not an oversight.
    expect(shouldSkipPath("game/player.gd.uid")).toBe(true);
    expect(shouldSkipPath("game/assets/icon.png.import")).toBe(true);
    expect(shouldSkipPath("game/.godot/uid_cache.bin")).toBe(true);
    expect(shouldSkipPath("game/scenes/main.tscn")).toBe(false);
    expect(shouldSkipPath("game/scenes/theme.tres")).toBe(false);
    expect(shouldSkipPath("game/player.gd")).toBe(false);
  });
});
