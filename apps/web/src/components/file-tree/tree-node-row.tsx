import { ChevronDown, ChevronRight, File, Folder, FolderOpen, Check, X, Minus } from "lucide-react";

import { formatSize } from "@fileconcat/core";
import { cn } from "~/lib/utils";

import { calculateInclusionState, type InclusionState, type TreeNode } from "./tree-data";

export interface TreeNodeRowProps {
  node: TreeNode;
  depth: number;
  expandedPaths: Set<string>;
  isProcessing: boolean;
  onToggleExpanded: (path: string) => void;
  onToggleFile: (index: number) => void;
  onToggleDirectory: (node: TreeNode) => void;
  onOpenFile?: (path: string) => void;
}

// Warm-dark toggle affordance: green check = in, muted x = left out, amber
// minus = partially in. Matches the drawer's go / info / dimmed semantics.
const ICON_BY_STATE: Record<InclusionState, JSX.Element> = {
  included: <Check className="text-primary h-4 w-4" />,
  excluded: <X className="text-ink-faint h-4 w-4" />,
  partial: <Minus className="text-info h-4 w-4" />,
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
    onOpenFile,
  } = props;

  const isExpanded = expandedPaths.has(node.path);
  const hasChildren = !!node.children && node.children.length > 0;
  const inclusionState = calculateInclusionState(node);
  const dimmed = inclusionState === "excluded";

  const handleInclusionToggle = (): void => {
    if (node.type === "file" && node.status && typeof node.status.index === "number") {
      onToggleFile(node.status.index);
    } else {
      onToggleDirectory(node);
    }
  };

  return (
    <div>
      <div
        className="flex min-h-[28px] cursor-pointer items-center gap-2 rounded-sm px-2 py-1 transition-colors hover:bg-[oklch(var(--surface-inset))]"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <div className="flex h-4 w-4 items-center justify-center">
          {hasChildren && (
            <button
              type="button"
              onClick={() => onToggleExpanded(node.path)}
              className="text-ink-muted hover:text-ink rounded p-0.5 hover:bg-[oklch(var(--surface-inset))]"
              aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          )}
        </div>

        <div className="flex h-4 w-4 items-center justify-center">
          {node.type === "directory" ? (
            isExpanded ? (
              <FolderOpen className="text-ink-muted h-4 w-4" />
            ) : (
              <Folder className="text-ink-muted h-4 w-4" />
            )
          ) : (
            <File className="text-ink-faint h-4 w-4" />
          )}
        </div>

        <button
          type="button"
          onClick={handleInclusionToggle}
          disabled={isProcessing}
          className="rounded p-0.5 hover:bg-[oklch(var(--surface-inset))] disabled:opacity-50"
          aria-label={`Toggle inclusion: ${inclusionState}`}
        >
          {ICON_BY_STATE[inclusionState]}
        </button>

        <span
          className={cn(
            "flex-1 truncate text-sm",
            node.type === "file"
              ? cn(
                  "cursor-pointer font-mono hover:underline",
                  dimmed ? "text-ink-faint" : "text-ink-secondary",
                )
              : cn("font-medium", dimmed ? "text-ink-muted" : "text-ink"),
          )}
          title={node.path}
          role={node.type === "file" ? "button" : undefined}
          tabIndex={node.type === "file" ? 0 : -1}
          onClick={(e) => {
            e.stopPropagation();
            if (node.type === "file") onOpenFile?.(node.path);
          }}
          onKeyDown={(e) => {
            if (node.type === "file" && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              onOpenFile?.(node.path);
            }
          }}
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
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}
