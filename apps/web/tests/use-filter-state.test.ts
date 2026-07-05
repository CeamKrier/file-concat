import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useFilterState } from "~/hooks/use-filter-state";
import type { ContentEntry, ValidationRecord } from "~/hooks/use-file-ingestion";

type FixtureSpec = {
  path: string;
  included?: boolean;
  reason?: string;
  size?: number;
  type?: string;
  content?: string;
};

function buildFixture(specs: FixtureSpec[]): {
  entries: ContentEntry[];
  validations: Record<string, ValidationRecord>;
} {
  const entries: ContentEntry[] = specs.map((s) => ({ path: s.path, content: s.content ?? "stub" }));
  const validations: Record<string, ValidationRecord> = {};
  for (const s of specs) {
    validations[s.path] = {
      included: s.included ?? true,
      reason: s.reason,
      size: s.size ?? 1,
      type: s.type ?? "text/plain",
    };
  }
  return { entries, validations };
}

describe("useFilterState", () => {
  it("returns N statuses for N entries with default patterns", () => {
    const { entries, validations } = buildFixture([
      { path: "src/a.ts" },
      { path: "src/b.ts" },
      { path: "README.md" },
    ]);

    const { result } = renderHook(() =>
      useFilterState({ entries, validations, includePatterns: "", ignorePatterns: "" }),
    );

    expect(result.current.fileStatuses).toHaveLength(3);
    expect(result.current.includedFileCount).toBe(3);
    expect(result.current.manualOverrideCount).toBe(0);
  });

  it("narrows includedFileCount live when ignorePatterns rerenders", () => {
    const { entries, validations } = buildFixture([
      { path: "src/a.ts" },
      { path: "src/a.test.ts" },
      { path: "src/b.ts" },
      { path: "src/b.test.ts" },
    ]);

    const { result, rerender } = renderHook(
      ({ ignorePatterns }: { ignorePatterns: string }) =>
        useFilterState({ entries, validations, includePatterns: "", ignorePatterns }),
      { initialProps: { ignorePatterns: "" } },
    );

    expect(result.current.includedFileCount).toBe(4);

    rerender({ ignorePatterns: "**/*.test.ts" });

    expect(result.current.includedFileCount).toBe(2);
    const excluded = result.current.fileStatuses.filter((s) => !s.included).map((s) => s.path);
    expect(excluded).toEqual(["src/a.test.ts", "src/b.test.ts"]);
    expect(result.current.fileStatuses.find((s) => s.path === "src/a.test.ts")?.reason).toBe(
      "Matched ignore patterns",
    );
  });

  it("applies include + ignore swap atomically when both rerender together (preset apply)", () => {
    const { entries, validations } = buildFixture([
      { path: "src/index.tsx" },
      { path: "src/index.test.tsx" },
      { path: "dist/bundle.js" },
      { path: "node_modules/react/index.js" },
    ]);

    const { result, rerender } = renderHook(
      ({
        includePatterns,
        ignorePatterns,
      }: {
        includePatterns: string;
        ignorePatterns: string;
      }) => useFilterState({ entries, validations, includePatterns, ignorePatterns }),
      { initialProps: { includePatterns: "", ignorePatterns: "" } },
    );

    expect(result.current.includedFileCount).toBe(4);

    rerender({ includePatterns: "**/*.tsx", ignorePatterns: "**/*.test.*" });

    // Compose: the include list narrows to *.tsx, then the ignore list still
    // subtracts *.test.* on top — so the test file drops out too, and dist/*
    // and node_modules/* drop out for missing the include match.
    const included = result.current.fileStatuses
      .filter((s) => s.included)
      .map((s) => s.path)
      .sort();
    expect(included).toEqual(["src/index.tsx"]);
  });

  it("applies ignorePatterns on top of a non-empty includePatterns (compose, not whitelist-exclusive)", () => {
    const { entries, validations } = buildFixture([
      { path: "src/a.tsx" },
      { path: "src/a.test.tsx" },
      { path: "src/b.tsx" },
    ]);

    const { result } = renderHook(() =>
      useFilterState({
        entries,
        validations,
        includePatterns: "**/*.tsx",
        ignorePatterns: "**/*.test.tsx",
      }),
    );

    const included = result.current.fileStatuses
      .filter((s) => s.included)
      .map((s) => s.path)
      .sort();
    expect(included).toEqual(["src/a.tsx", "src/b.tsx"]);
    expect(result.current.fileStatuses.find((s) => s.path === "src/a.test.tsx")?.reason).toBe(
      "Matched ignore patterns",
    );
  });

  it("toggleFile to exclude bumps manualOverrideCount and labels reason as manual", () => {
    const { entries, validations } = buildFixture([
      { path: "src/a.ts" },
      { path: "src/b.ts" },
    ]);

    const { result } = renderHook(() =>
      useFilterState({ entries, validations, includePatterns: "", ignorePatterns: "" }),
    );

    act(() => result.current.toggleFile(0));

    expect(result.current.manualOverrideCount).toBe(1);
    expect(result.current.fileStatuses[0].included).toBe(false);
    expect(result.current.fileStatuses[0].reason).toBe("Excluded manually");
    expect(result.current.includedFileCount).toBe(1);
  });

  it("preserves a manual exclude across a later ignorePatterns rerender", () => {
    const { entries, validations } = buildFixture([
      { path: "src/a.ts" },
      { path: "src/b.ts" },
      { path: "src/c.md" },
    ]);

    const { result, rerender } = renderHook(
      ({ ignorePatterns }: { ignorePatterns: string }) =>
        useFilterState({ entries, validations, includePatterns: "", ignorePatterns }),
      { initialProps: { ignorePatterns: "" } },
    );

    act(() => result.current.toggleFile(0));
    expect(result.current.manualOverrideCount).toBe(1);

    rerender({ ignorePatterns: "**/*.md" });

    expect(result.current.manualOverrideCount).toBe(1);
    expect(result.current.fileStatuses[0].included).toBe(false);
    expect(result.current.fileStatuses[0].reason).toBe("Excluded manually");
    expect(result.current.fileStatuses.find((s) => s.path === "src/c.md")?.included).toBe(false);
  });

  it("clearOverrides drops manual overrides but keeps pattern filtering intact", () => {
    const { entries, validations } = buildFixture([
      { path: "src/a.ts" },
      { path: "src/b.ts" },
      { path: "src/c.test.ts" },
    ]);

    const { result } = renderHook(() =>
      useFilterState({
        entries,
        validations,
        includePatterns: "",
        ignorePatterns: "**/*.test.ts",
      }),
    );

    expect(result.current.includedFileCount).toBe(2);

    act(() => result.current.toggleFile(0));
    expect(result.current.manualOverrideCount).toBe(1);
    expect(result.current.includedFileCount).toBe(1);

    act(() => result.current.clearOverrides());

    expect(result.current.manualOverrideCount).toBe(0);
    expect(result.current.includedFileCount).toBe(2);
    expect(result.current.fileStatuses.find((s) => s.path === "src/c.test.ts")?.included).toBe(
      false,
    );
  });

  it("includes baseIncluded=false files in the excluded set with the validation reason intact", () => {
    const { entries, validations } = buildFixture([
      { path: "src/a.ts" },
      { path: "assets/icon.png", included: false, reason: "Binary file" },
      { path: "data/big.json", included: false, reason: "File size exceeds 32MB limit" },
    ]);

    const { result } = renderHook(() =>
      useFilterState({ entries, validations, includePatterns: "", ignorePatterns: "" }),
    );

    expect(result.current.includedFileCount).toBe(1);
    const excluded = result.current.fileStatuses.filter((s) => !s.included);
    expect(excluded.map((s) => s.reason)).toEqual([
      "Binary file",
      "File size exceeds 32MB limit",
    ]);
  });

  it("excludes files matched by a .gitignore riding along in entries", () => {
    const { entries, validations } = buildFixture([
      { path: ".gitignore", content: "build/\n" },
      { path: "build/bundle.js" },
      { path: "src/app.ts" },
    ]);

    const { result } = renderHook(() =>
      useFilterState({ entries, validations, includePatterns: "", ignorePatterns: "" }),
    );

    const build = result.current.fileStatuses.find((s) => s.path === "build/bundle.js");
    expect(build?.included).toBe(false);
    expect(build?.reason).toBe("Matched .gitignore");
    expect(result.current.fileStatuses.find((s) => s.path === "src/app.ts")?.included).toBe(true);
  });

  it("scopes a nested .gitignore to its subtree under the drop-root prefix", () => {
    const { entries, validations } = buildFixture([
      { path: "myproj/.gitignore", content: "dist/\n" },
      { path: "myproj/dist/out.js" },
      { path: "myproj/src/app.ts" },
    ]);

    const { result } = renderHook(() =>
      useFilterState({ entries, validations, includePatterns: "", ignorePatterns: "" }),
    );

    expect(result.current.fileStatuses.find((s) => s.path === "myproj/dist/out.js")?.included).toBe(
      false,
    );
    expect(result.current.fileStatuses.find((s) => s.path === "myproj/src/app.ts")?.included).toBe(
      true,
    );
  });

  it("still applies .gitignore when an include list is present (compose, not whitelist-exclusive)", () => {
    // The trap this fixes: an include list used to disable every ignore source,
    // so a gitignored path would re-appear the moment the user narrowed by type.
    const { entries, validations } = buildFixture([
      { path: ".gitignore", content: "generated/\n" },
      { path: "src/app.ts" },
      { path: "generated/schema.ts" },
      { path: "README.md" },
    ]);

    const { result } = renderHook(() =>
      useFilterState({
        entries,
        validations,
        includePatterns: "**/*.ts",
        ignorePatterns: "",
      }),
    );

    const included = result.current.fileStatuses
      .filter((s) => s.included)
      .map((s) => s.path)
      .sort();
    expect(included).toEqual(["src/app.ts"]);
    expect(
      result.current.fileStatuses.find((s) => s.path === "generated/schema.ts")?.reason,
    ).toBe("Matched .gitignore");
  });
});
