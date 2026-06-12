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
};

function buildFixture(specs: FixtureSpec[]): {
  entries: ContentEntry[];
  validations: Record<string, ValidationRecord>;
} {
  const entries: ContentEntry[] = specs.map((s) => ({ path: s.path, content: "stub" }));
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

    // Whitelist exclusivity: with a non-empty include list, the ignore list is
    // skipped. The atomic-swap contract here is that count updates together —
    // dist/* and node_modules/* drop out for missing the include match.
    const included = result.current.fileStatuses
      .filter((s) => s.included)
      .map((s) => s.path)
      .sort();
    expect(included).toEqual(["src/index.test.tsx", "src/index.tsx"]);
  });

  it("treats ignorePatterns as skipped when includePatterns is non-empty (whitelist exclusivity)", () => {
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
    expect(included).toEqual(["src/a.test.tsx", "src/a.tsx", "src/b.tsx"]);
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
});
