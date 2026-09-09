import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Check,
  X,
  Minus,
  Lock,
} from "lucide-react";

import { formatSize } from "@fileconcat/core";
import { cn } from "~/lib/utils";

import { calculateInclusionState, type InclusionState, type TreeNode } from "./tree-data";
import { notePress } from "./interaction-tally";

export interface TreeNodeRowProps {
  node: TreeNode;
  depth: number;
  expandedPaths: Set<string>;
  isProcessing: boolean;
  onToggleExpanded: (path: string) => void;
  onToggleFile: (index: number) => void;
  onToggleDirectory: (node: TreeNode) => void;
}

// Warm-dark toggle affordance: green check = in, muted x = left out, amber
// minus = partially in. Matches the drawer's go / info / dimmed semantics.
const ICON_BY_STATE: Record<InclusionState, JSX.Element> = {
  included: <Check className="text-primary h-3 w-3" />,
  excluded: <X className="text-ink-faint h-3 w-3" />,
  partial: <Minus className="text-info h-3 w-3" />,
};

export function TreeNodeRow(props: TreeNodeRowProps): JSX.Element {
  const {
    node,
    depth,
    expandedPaths,
    isProcessing,
    onToggleExpanded,
    onToggleFile,
    onToggleDirectory,
  } = props;

  const isExpanded = expandedPaths.has(node.path);
  const hasChildren = !!node.children && node.children.length > 0;
  const inclusionState = calculateInclusionState(node);
  const dimmed = inclusionState === "excluded";
  // A binary file has no recoverable text, so it is locked out of curation
  // (ADR-0009): its inclusion toggle is disabled.
  const isBinary = node.type === "file" && node.status?.classification === "binary";

  const handleInclusionToggle = (): void => {
    if (isBinary) return;
    if (node.type === "file" && node.status && typeof node.status.index === "number") {
      onToggleFile(node.status.index);
    } else {
      onToggleDirectory(node);
    }
  };

  // One rule for the whole tree: clicking a row puts that node in or out,
  // folder or file. Opening and closing is the chevron's job, so the same
  // gesture never means two things. The chevron carries the folder glyph with
  // it, because `Folder` / `FolderOpen` is already a disclosure indicator.
  const rowInert = isProcessing || isBinary;

  const glyphs = (
    <>
      <span className="flex h-4 w-4 items-center justify-center">
        {hasChildren &&
          (isExpanded ? (
            <ChevronDown className="text-ink-muted h-3 w-3" />
          ) : (
            <ChevronRight className="text-ink-muted h-3 w-3" />
          ))}
      </span>
      <span className="flex h-4 w-4 items-center justify-center">
        {node.type === "directory" ? (
          isExpanded ? (
            <FolderOpen className="text-ink-muted h-4 w-4" />
          ) : (
            <Folder className="text-ink-muted h-4 w-4" />
          )
        ) : (
          <File className="text-ink-faint h-4 w-4" />
        )}
      </span>
    </>
  );

  // A 36x24 target instead of a 12px chevron: the arrow and the folder glyph
  // are one control, since both already say whether the folder is open.
  const disclosure = hasChildren ? (
    <button
      type="button"
      aria-expanded={isExpanded}
      aria-label={`${isExpanded ? "Collapse" : "Expand"} ${node.name}`}
      title={isExpanded ? "Collapse folder" : "Expand folder"}
      onClick={(e) => {
        e.stopPropagation();
        notePress("arrow");
        onToggleExpanded(node.path);
      }}
      className="focus-visible:ring-ring flex shrink-0 items-center gap-1 rounded-sm py-1 hover:bg-[oklch(var(--accent))] focus-visible:outline-none focus-visible:ring-2"
    >
      {glyphs}
    </button>
  ) : (
    <span className="flex shrink-0 items-center gap-1 py-1">{glyphs}</span>
  );

  const inclusionControl = isBinary ? (
    <span
      role="img"
      aria-label="Binary file, nothing to include"
      title="Not text, nothing to include"
      className="flex h-[18px] w-[18px] shrink-0 items-center justify-center"
    >
      <Lock className="text-ink-faint h-3.5 w-3.5" />
    </span>
  ) : (
    <button
      type="button"
      role="checkbox"
      aria-checked={inclusionState === "partial" ? "mixed" : inclusionState === "included"}
      aria-label={`Include ${node.name}`}
      title={inclusionState === "included" ? "Leave out of the bundle" : "Put in the bundle"}
      onClick={(e) => {
        e.stopPropagation();
        notePress(node.type === "directory" ? "box-folder" : "box-file");
        handleInclusionToggle();
      }}
      disabled={isProcessing}
      className="border-border hover:border-border-strong focus-visible:ring-ring flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50"
    >
      {ICON_BY_STATE[inclusionState]}
    </button>
  );

  return (
    <div>
      <div
        className={cn(
          "flex min-h-[28px] items-center gap-2 rounded-sm px-2 py-1 transition-colors",
          rowInert ? "cursor-default" : "cursor-pointer hover:bg-[oklch(var(--surface-inset))]",
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={
          rowInert
            ? undefined
            : () => {
                notePress(node.type === "directory" ? "row-folder" : "row-file");
                handleInclusionToggle();
              }
        }
      >
        {disclosure}

        {inclusionControl}

        <span
          title={node.path}
          className={cn(
            "min-w-0 flex-1 truncate text-sm",
            node.type === "file"
              ? cn("font-mono", dimmed ? "text-ink-faint" : "text-ink-secondary")
              : cn("font-medium", dimmed ? "text-ink-muted" : "text-ink"),
          )}
        >
          {node.name}
        </span>

        {node.type === "file" && node.status && (
          <span className="text-ink-faint shrink-0 font-mono text-[11px] tabular-nums">
            {formatSize(node.status.size)}
          </span>
        )}
        {node.type === "directory" && node.totalSize !== undefined && (
          <span className="text-ink-faint shrink-0 font-mono text-[11px] tabular-nums">
            {formatSize(node.totalSize)}
          </span>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child) => (
            <TreeNodeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              isProcessing={isProcessing}
              onToggleExpanded={onToggleExpanded}
              onToggleFile={onToggleFile}
              onToggleDirectory={onToggleDirectory}
            />
          ))}
        </div>
      )}
    </div>
  );
}
