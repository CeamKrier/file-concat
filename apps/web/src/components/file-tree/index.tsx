import { memo, useCallback, useMemo, useState } from "react";
import type { FileStatus } from "@fileconcat/core";

import {
  buildFileTree,
  calculateInclusionState,
  collectDirectoryPaths,
  collectFileIndices,
  type TreeNode,
  type TreeOrder,
} from "./tree-data";
import { focusSibling, TreeNodeRow } from "./tree-node-row";
import { noteSweep } from "./interaction-tally";

/**
 * Up to this many files every folder opens; past it only the lone folders from
 * the top down to the first fork. Mounting all 8,473 rows of the 7,792-file
 * test drop took one 0.5 s frame; 287 rows take under 50 ms.
 */
const EXPAND_ALL_LIMIT = 300;

/** The folders open before anyone touches one. */
function openByDefault(tree: TreeNode, files: number): Set<string> {
  if (files <= EXPAND_ALL_LIMIT) return new Set(collectDirectoryPaths(tree));
  const open = new Set<string>();
  let node = tree;
  while (node.children?.length === 1 && node.children[0].type === "directory") {
    node = node.children[0];
    open.add(node.path);
  }
  return open;
}

export interface FileTreeProps {
  /** The files to draw, possibly a filtered subset; each keeps its own `index`. */
  fileStatuses: FileStatus[];
  /** Text length per file index, for each row's share. */
  chars: readonly number[];
  /** Readable text in the whole drop, the share's denominator. */
  total: number;
  order: TreeOrder;
  /** The filter-box text `fileStatuses` was narrowed by, "" for none. */
  query: string;
  onToggleFile: (index: number) => void;
  onToggleMultipleFiles: (indices: number[], shouldInclude: boolean) => void;
}

/**
 * The rows of the Files pane. The pane owns the scroll, the filter and the
 * totals; this owns which folders are open and the keyboard (WAI-ARIA tree).
 */
function FileTree({
  fileStatuses,
  chars,
  total,
  order,
  query,
  onToggleFile,
  onToggleMultipleFiles,
}: FileTreeProps) {
  const treeData = useMemo(
    () => buildFileTree(fileStatuses, chars, order),
    [fileStatuses, chars, order],
  );

  const filtering = query !== "";
  const mark = /[*?]/.test(query) ? "" : query;

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() =>
    openByDefault(treeData, fileStatuses.length),
  );
  // A filter opens the folders holding its matches, by the same limit. Folders
  // opened or closed by hand while it is on are remembered only until the
  // filter text changes.
  const [filterFlipped, setFilterFlipped] = useState({ query, paths: new Set<string>() });
  if (filterFlipped.query !== query) setFilterFlipped({ query, paths: new Set() });
  const filterExpanded = useMemo(() => {
    const open = openByDefault(treeData, fileStatuses.length);
    for (const p of filterFlipped.paths) {
      if (open.has(p)) open.delete(p);
      else open.add(p);
    }
    return open;
  }, [treeData, fileStatuses.length, filterFlipped]);

  const shown = filtering ? filterExpanded : expandedPaths;
  const toggleExpanded = useCallback(
    (path: string) => {
      const flip = (prev: Set<string>) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      };
      if (filtering) setFilterFlipped((prev) => ({ ...prev, paths: flip(prev.paths) }));
      else setExpandedPaths(flip);
    },
    [filtering],
  );

  // The one funnel every folder sweep goes through, from the row and from the
  // checkbox alike, so the reversal check sees them all.
  const toggleDirectory = useCallback(
    (node: TreeNode) => {
      const shouldInclude = calculateInclusionState(node) !== "included";
      const indices = collectFileIndices(node);
      if (indices.length === 0) return;
      noteSweep(node.path, shouldInclude, indices.length);
      onToggleMultipleFiles(indices, shouldInclude);
    },
    [onToggleMultipleFiles],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const keys: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, Home: -1e9, End: 1e9 };
    const step = keys[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const from = e.target as HTMLElement;
    if (from.getAttribute("role") === "treeitem") focusSibling(from, step);
    else e.currentTarget.querySelector<HTMLElement>('[role="treeitem"]')?.focus();
  };

  if (fileStatuses.length === 0) return null;

  return (
    <div
      role="tree"
      aria-label="Files"
      aria-multiselectable
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="focus-visible:ring-ring rounded-sm focus-visible:outline-none focus-visible:ring-2"
    >
      {treeData.children?.map((child) => (
        <TreeNodeRow
          key={child.path}
          node={child}
          depth={0}
          expandedPaths={shown}
          total={total}
          mark={mark}
          onToggleExpanded={toggleExpanded}
          onToggleFile={onToggleFile}
          onToggleDirectory={toggleDirectory}
        />
      ))}
    </div>
  );
}

// Memoised so a keystroke in the pane's filter box, which re-renders the pane
// before the deferred query reaches here, does not re-render every row.
export default memo(FileTree);
