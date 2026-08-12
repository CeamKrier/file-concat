import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { DEFAULT_IGNORE_STRING } from "@fileconcat/core";

const SRC = join(__dirname, "..", "src");

/**
 * The production build once shipped with noise filtering silently off.
 *
 * `use-config.ts` held `const DEFAULT_CONFIG = { ignorePatterns:
 * DEFAULT_IGNORE_STRING, … }` at module scope, and `settings-drawer.tsx` did
 * the same in four presets. That captures the imported binding **by value**
 * when the module body runs, and in the built chunk layout those bodies ran
 * before core's `default-ignore` body, so they froze `undefined`. Every
 * visitor got an empty ignore list: node_modules, lockfiles and `dist` all
 * went into the bundle and the result screen said "0 noise files skipped".
 * Dev never reproduced it, because unbundled ESM evaluates the dependency
 * first.
 *
 * A unit test cannot recreate a chunk layout, so this guards the shape that
 * caused it: every read of the constant must sit inside a function, where it
 * happens at call time rather than at module-evaluation time.
 */
describe("default ignore patterns survive the production chunk layout", () => {
  const files = ["hooks/use-config.ts", "components/app/settings-drawer.tsx"];

  it.each(files)("%s only reads DEFAULT_IGNORE_STRING inside a function", (rel) => {
    const path = join(SRC, rel);
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    const isFunctionLike = (n: ts.Node) =>
      ts.isFunctionDeclaration(n) ||
      ts.isFunctionExpression(n) ||
      ts.isArrowFunction(n) ||
      ts.isMethodDeclaration(n);

    const offenders: string[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isIdentifier(node) &&
        node.text === "DEFAULT_IGNORE_STRING" &&
        !ts.isImportSpecifier(node.parent)
      ) {
        let p: ts.Node | undefined = node.parent;
        let insideFunction = false;
        while (p) {
          if (isFunctionLike(p)) {
            insideFunction = true;
            break;
          }
          p = p.parent;
        }
        if (!insideFunction) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart());
          offenders.push(`${rel}:${line + 1}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);

    expect(
      offenders,
      "move the reference inside a function so it reads the binding at call time",
    ).toEqual([]);
  });

  it("still resolves to a real pattern list when read at call time", () => {
    expect(DEFAULT_IGNORE_STRING.length).toBeGreaterThan(100);
    expect(DEFAULT_IGNORE_STRING).toContain("node_modules");
    expect(DEFAULT_IGNORE_STRING).toContain("package-lock.json");
  });
});
