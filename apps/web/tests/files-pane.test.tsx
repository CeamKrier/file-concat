import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_IGNORE_STRING, type FileStatus, type UserConfig } from "@fileconcat/core";

import { FilesPane } from "~/components/app/files-pane";
import FileTree from "~/components/file-tree";
import {
  buildFileTree,
  queryMatcher,
  shareLabel,
  typeFacets,
} from "~/components/file-tree/tree-data";
import { useFilterState } from "~/hooks/use-filter-state";
import type { ContentEntry, ValidationRecord } from "~/hooks/use-file-ingestion";

function status(path: string, index: number, extra: Partial<FileStatus> = {}): FileStatus {
  return { path, index, included: true, size: 1, type: "text/plain", ...extra } as FileStatus;
}

describe("tree data", () => {
  it("keeps each file's own index in a filtered subset", () => {
    const all = [status("a/x.ts", 0), status("a/y.md", 1), status("b/z.ts", 2)];
    const tree = buildFileTree([all[2]], [5, 5, 9]);
    const file = tree.children![0].children![0];
    expect(file.status!.index).toBe(2);
    expect(file.weight).toBe(9);
  });

  it("puts the heaviest node first in size order, folders and files mixed", () => {
    const tree = buildFileTree(
      [status("small/a.ts", 0), status("big.ts", 1)],
      [10, 500],
      "size",
    );
    expect(tree.children!.map((c) => c.name)).toEqual(["big.ts", "small"]);
    // A-Z keeps folders first.
    const az = buildFileTree([status("small/a.ts", 0), status("big.ts", 1)], [10, 500], "name");
    expect(az.children!.map((c) => c.name)).toEqual(["small", "big.ts"]);
  });

  it("weighs a binary at nothing", () => {
    const tree = buildFileTree([status("p.png", 0, { classification: "binary" })], [999]);
    expect(tree.weight).toBe(0);
  });

  it("matches plain text anywhere in the path, case-folded, and globs as globs", () => {
    const glob = (path: string, pattern: string) => pattern === "**/*.md" && path.endsWith(".md");
    expect(queryMatcher("", glob)).toBeNull();
    const plain = queryMatcher("Docs", glob)!;
    expect(plain("src/docs/a.ts")).toBe(true);
    expect(plain("src/a.ts")).toBe(false);
    const g = queryMatcher("**/*.md", glob)!;
    expect(g("x/readme.md")).toBe(true);
    expect(g("x/docs.ts")).toBe(false);
  });

  it("builds one facet per readable extension, heaviest first", () => {
    const facets = typeFacets(
      [
        status("a.json", 0),
        status("b.json", 1, { included: false }),
        status("c.ts", 2),
        status("Makefile", 3),
        status("d.png", 4, { classification: "binary" }),
      ],
      [100, 300, 50, 10, 1000],
    );
    expect(facets.map((f) => [f.ext, f.count, f.included, f.weight])).toEqual([
      [".json", 2, 1, 400],
      [".ts", 1, 1, 50],
      ["", 1, 1, 10],
    ]);
  });

  it("states a share without a bare zero", () => {
    expect(shareLabel(0, 100)).toBe("0%");
    expect(shareLabel(1, 10_000)).toBe("<0.1%");
    expect(shareLabel(55, 1000)).toBe("5.5%");
    expect(shareLabel(380, 1000)).toBe("38%");
  });
});

describe("the tree on a big drop", () => {
  it("opens the lone folders down to the first fork, not every folder", () => {
    const statuses = Array.from({ length: 301 }, (_, i) => status(`repo/apps/pkg${i % 3}/f${i}.ts`, i));
    render(
      <FileTree
        fileStatuses={statuses}
        chars={statuses.map(() => 1)}
        total={301}
        order="name"
        query=""
        onToggleFile={() => {}}
        onToggleMultipleFiles={() => {}}
      />,
    );
    const names = screen.getAllByRole("treeitem").map((r) => r.getAttribute("aria-label")!.split(",")[0]);
    expect(names).toEqual(["repo", "apps", "pkg0", "pkg1", "pkg2"]);
  });
});

const PATHS = ["src/app.ts", "src/util.ts", "docs/guide.md", "docs/api.md", "logo.png"];

function Harness() {
  const entries: ContentEntry[] = PATHS.map((path) => ({ path, content: "x".repeat(10) }));
  const validations: Record<string, ValidationRecord> = Object.fromEntries(
    PATHS.map((path) => [
      path,
      path.endsWith(".png")
        ? { included: false, reason: "Binary file", size: 1, type: "image/png", classification: "binary" }
        : { included: true, size: 1, type: "text/plain" },
    ]),
  );
  const [config, setConfigState] = useState({
    includePatterns: "",
    ignorePatterns: DEFAULT_IGNORE_STRING,
  } as UserConfig);
  const filter = useFilterState({
    entries,
    validations,
    includePatterns: config.includePatterns,
    ignorePatterns: config.ignorePatterns,
  });
  return (
    <FilesPane
      fileStatuses={filter.fileStatuses}
      chars={entries.map((e) => e.content.length)}
      onToggleFile={filter.toggleFile}
      onToggleMany={filter.toggleMany}
      overrides={filter.overrides}
      restoreOverrides={filter.restoreOverrides}
      config={config}
      setConfig={(u) => setConfigState((c) => ({ ...c, ...u }))}
      tokens={1234}
      fit={null}
      onClose={() => {}}
    />
  );
}

const countLine = () => screen.getByText(/files in,/).textContent;

describe("the Files pane", () => {
  it("takes out what the filter matches, and Undo puts it back", () => {
    render(<Harness />);
    expect(countLine()).toContain("4 of 5 files in");

    fireEvent.change(screen.getByLabelText("Filter by name or folder"), {
      target: { value: "docs" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Take out 2" }));
    expect(countLine()).toContain("2 of 5 files in");
    expect(screen.getByRole("status").textContent).toContain("Took out 2 files.");

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(countLine()).toContain("4 of 5 files in");
  });

  it("keeps only the matches", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Filter by name or folder"), {
      target: { value: "app" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Keep only these 1" }));
    expect(countLine()).toContain("1 of 5 files in");
  });

  it("says when nothing matches", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Filter by name or folder"), {
      target: { value: "zzz" },
    });
    expect(screen.getByText('No file matches "zzz".')).toBeTruthy();
  });

  it("takes a whole type out with its chip, never touching the locked binary", () => {
    render(<Harness />);
    const chip = screen.getByRole("button", { name: /^\.md/ });
    fireEvent.click(chip);
    expect(countLine()).toContain("2 of 5 files in");
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(chip);
    expect(countLine()).toContain("4 of 5 files in");
    // There is no chip for the binary to put back.
    expect(screen.queryByRole("button", { name: /^\.png/ })).toBeNull();
  });

  it("resets to the defaults, with Undo", () => {
    render(<Harness />);
    const reset = screen.getByRole("button", { name: "Reset to defaults" });
    expect((reset as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^\.ts/ }));
    expect((reset as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(reset);
    expect(countLine()).toContain("4 of 5 files in");
  });

  it("toggles a focused row with Space and moves with the arrows", () => {
    render(<Harness />);
    const tree = screen.getByRole("tree");
    act(() => tree.focus());
    fireEvent.keyDown(tree, { key: "ArrowDown" });
    const first = document.activeElement as HTMLElement;
    expect(first.getAttribute("role")).toBe("treeitem");
    fireEvent.keyDown(first, { key: " " });
    expect(countLine()).not.toContain("4 of 5 files in");
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(document.activeElement).not.toBe(first);
    expect(within(tree).getAllByRole("treeitem").length).toBeGreaterThan(1);
  });
});
