import { ChevronDown, ChevronRight, File, Folder, FolderOpen, Check, X, Minus } from "lucide-react";

import { formatSize } from "@fileconcat/core";
import { cn } from "~/lib/utils";
import { getSizeSeverity } from "~/lib/file-size";

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

const ICON_BY_STATE: Record<InclusionState, JSX.Element> = {
  included: <Check className="h-4 w-4 text-green-600" />,
  excluded: <X className="h-4 w-4 text-red-600" />,
  partial: <Minus className="h-4 w-4 text-yellow-600" />,
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
        className="hover:bg-muted/50 flex min-h-[28px] cursor-pointer items-center gap-2 rounded-sm px-2 py-1"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <div className="flex h-4 w-4 items-center justify-center">
          {hasChildren && (
            <button
              type="button"
              onClick={() => onToggleExpanded(node.path)}
              className="hover:bg-muted rounded p-0.5"
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
              <FolderOpen className="h-4 w-4 text-blue-500" />
            ) : (
              <Folder className="h-4 w-4 text-blue-500" />
            )
          ) : (
            <File className="h-4 w-4 text-gray-500" />
          )}
        </div>

        <button
          type="button"
          onClick={handleInclusionToggle}
          disabled={isProcessing}
          className="hover:bg-muted rounded p-0.5 disabled:opacity-50"
          aria-label={`Toggle inclusion: ${inclusionState}`}
        >
          {ICON_BY_STATE[inclusionState]}
        </button>

        <span
          className={cn(
            "flex-1 truncate text-sm",
            node.type === "file"
              ? "text-foreground cursor-pointer font-mono hover:underline"
              : "font-medium",
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
          <div className="flex items-center gap-3 text-xs">
            <span className={getSizeSeverity(node.status.size)}>
              {formatSize(node.status.size)}
            </span>
          </div>
        )}
        {node.type === "directory" && node.totalSize !== undefined && (
          <div className="flex items-center gap-3 text-xs">
            <span className={getSizeSeverity(node.totalSize)}>
              [ {formatSize(node.totalSize)} ]
            </span>
          </div>
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
