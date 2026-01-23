import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Check,
  X,
  Minus,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileStatus } from "@fileconcat/core";
import { formatSize } from "@/utils";
import { cn } from "@/lib/utils";
import { getSizeSeverity } from "@/lib/file-size";

const LEGEND_DISMISSED_KEY = "fileconcat-legend-dismissed";

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: TreeNode[];
  status?: FileStatus;
  isExpanded?: boolean;
  // Computed properties for tree state
  inclusionState?: "included" | "excluded" | "partial";
  totalSize?: number; // Total size of all files in this directory
}

interface FileTreeProps {
  fileStatuses: FileStatus[];
  onToggleFile: (index: number) => void;
  onToggleMultipleFiles: (indices: number[], shouldInclude: boolean) => void;
  isProcessing?: boolean;
  onOpenFile?: (path: string) => void;
}

const FileTree: React.FC<FileTreeProps> = ({
  fileStatuses,
  onToggleFile,
  onToggleMultipleFiles,
  isProcessing = false,
  onOpenFile,
}) => {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [showLegend, setShowLegend] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(LEGEND_DISMISSED_KEY) !== "true";
  });

  const dismissLegend = useCallback(() => {
    setShowLegend(false);
    localStorage.setItem(LEGEND_DISMISSED_KEY, "true");
  }, []);

  // Build tree structure from file paths
  const treeData = useMemo(() => {
    const root: TreeNode = { name: "root", path: "", type: "directory", children: [] };

    fileStatuses.forEach((status, index) => {
      const pathParts = status.path.split("/").filter((part) => part.length > 0);
      let currentNode = root;

      pathParts.forEach((part, partIndex) => {
        const currentPath = pathParts.slice(0, partIndex + 1).join("/");
        const isFile = partIndex === pathParts.length - 1;

        if (!currentNode.children) {
          currentNode.children = [];
        }

        let existingNode = currentNode.children.find((child) => child.name === part);

        if (!existingNode) {
          existingNode = {
            name: part,
            path: currentPath,
            type: isFile ? "file" : "directory",
            children: isFile ? undefined : [],
            status: isFile ? { ...status, index } : undefined,
            isExpanded: false,
          };
          currentNode.children.push(existingNode);
        }

        if (isFile && existingNode.status) {
          existingNode.status.index = index;
        }

        currentNode = existingNode;
      });
    });

    // Calculate total size for each directory (recursively)
    const calculateDirectorySize = (node: TreeNode): number => {
      if (node.type === "file") {
        return node.status?.size || 0;
      }

      if (!node.children || node.children.length === 0) {
        return 0;
      }

      const totalSize = node.children.reduce((acc, child) => {
        return acc + calculateDirectorySize(child);
      }, 0);

      node.totalSize = totalSize;
      return totalSize;
    };

    // Sort children: directories first, then files, both alphabetically
    const sortChildren = (node: TreeNode) => {
      if (node.children) {
        node.children.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === "directory" ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });
        node.children.forEach(sortChildren);
      }
    };

    sortChildren(root);
    calculateDirectorySize(root);
    return root;
  }, [fileStatuses]);

  // Calculate inclusion state for directories
  const calculateInclusionState = useCallback(
    (node: TreeNode): "included" | "excluded" | "partial" => {
      if (node.type === "file") {
        return node.status?.included ? "included" : "excluded";
      }

      if (!node.children || node.children.length === 0) {
        return "excluded";
      }

      const childStates = node.children.map((child) => calculateInclusionState(child));
      const includedCount = childStates.filter((state) => state === "included").length;
      const partialCount = childStates.filter((state) => state === "partial").length;

      if (includedCount === childStates.length) {
        return "included";
      } else if (includedCount === 0 && partialCount === 0) {
        return "excluded";
      } else {
        return "partial";
      }
    },
    [],
  );

  const toggleExpanded = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const toggleDirectoryInclusion = useCallback(
    (node: TreeNode) => {
      if (node.type === "file") return;

      const currentState = calculateInclusionState(node);
      const shouldInclude = currentState !== "included";

      // Find all file indices under this directory
      const collectFileIndices = (n: TreeNode): number[] => {
        const indices: number[] = [];
        if (n.type === "file" && n.status && typeof n.status.index === "number") {
          indices.push(n.status.index);
        } else if (n.children) {
          n.children.forEach((child) => {
            indices.push(...collectFileIndices(child));
          });
        }
        return indices;
      };

      const fileIndices = collectFileIndices(node);

      // Use batch toggle for better performance
      if (fileIndices.length > 0) {
        onToggleMultipleFiles(fileIndices, shouldInclude);
      }
    },
    [calculateInclusionState, onToggleMultipleFiles],
  );

  const renderInclusionIcon = useCallback(
    (node: TreeNode) => {
      const state = calculateInclusionState(node);
      const size = node.type === "file" ? "w-4 h-4" : "w-4 h-4";

      switch (state) {
        case "included":
          return <Check className={cn(size, "text-green-600")} />;
        case "excluded":
          return <X className={cn(size, "text-red-600")} />;
        case "partial":
          return <Minus className={cn(size, "text-yellow-600")} />;
      }
    },
    [calculateInclusionState],
  );

  const renderNode = useCallback(
    (node: TreeNode, depth = 0) => {
      const isExpanded = expandedPaths.has(node.path);
      const hasChildren = node.children && node.children.length > 0;
      const paddingLeft = depth * 16;

      return (
        <div key={node.path}>
          <div
            className={cn(
              "hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1",
              "min-h-[28px]",
            )}
            style={{ paddingLeft: `${paddingLeft + 8}px` }}
          >
            {/* Expand/Collapse chevron */}
            <div className="flex h-4 w-4 items-center justify-center">
              {hasChildren && (
                <button
                  onClick={() => toggleExpanded(node.path)}
                  className="hover:bg-muted rounded p-0.5"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>
              )}
            </div>

            {/* File/Folder icon */}
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

            {/* Inclusion state icon */}
            <button
              onClick={() => {
                if (node.type === "file" && node.status && typeof node.status.index === "number") {
                  onToggleFile(node.status.index);
                } else {
                  toggleDirectoryInclusion(node);
                }
              }}
              disabled={isProcessing}
              className="hover:bg-muted rounded p-0.5 disabled:opacity-50"
            >
              {renderInclusionIcon(node)}
            </button>

            {/* File/Folder name */}
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
                // Prevent triggering folder expand when clicking on file name
                e.stopPropagation();
                if (node.type === "file") {
                  onOpenFile?.(node.path);
                }
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

            {/* Size display for both files and directories */}
            {node.type === "file" && node.status && (
              <div className="flex items-center gap-3 text-xs">
                <span className={getSizeSeverity(node.status.size)}>
                  {formatSize(node.status.size)}
                </span>
                {node.status.reason && (
                  <span className="max-w-[150px] truncate" title={node.status.reason}>
                    {node.status.reason}
                  </span>
                )}
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

          {/* Render children */}
          {hasChildren && isExpanded && (
            <div>{node.children!.map((child) => renderNode(child, depth + 1))}</div>
          )}
        </div>
      );
    },
    [
      expandedPaths,
      toggleExpanded,
      renderInclusionIcon,
      onToggleFile,
      toggleDirectoryInclusion,
      isProcessing,
      onOpenFile,
    ],
  );

  const stats = useMemo(() => {
    const uploadedCount = fileStatuses.length;
    const uploadedSize = fileStatuses.reduce((acc, status) => acc + status.size, 0);
    const includedCount = fileStatuses.filter((s) => s.included).length;
    const includedSize = fileStatuses
      .filter((s) => s.included)
      .reduce((acc, status) => acc + status.size, 0);
    const excludedCount = fileStatuses.filter((s) => !s.included).length;
    return { includedCount, excludedCount, uploadedCount, uploadedSize, includedSize };
  }, [fileStatuses]);

  const expandAll = useCallback(() => {
    const allDirectoryPaths = new Set<string>();

    const collectDirectoryPaths = (node: TreeNode) => {
      if (node.type === "directory" && node.path) {
        allDirectoryPaths.add(node.path);
      }
      if (node.children) {
        node.children.forEach(collectDirectoryPaths);
      }
    };

    collectDirectoryPaths(treeData);
    setExpandedPaths(allDirectoryPaths);
  }, [treeData]);

  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set());
  }, []);

  // Auto-expand all folders on initial load without affecting later interactions
  const hasAutoExpandedRef = useRef(false);
  useEffect(() => {
    if (hasAutoExpandedRef.current) return;
    if (!treeData.children || treeData.children.length === 0) return;
    expandAll();
    hasAutoExpandedRef.current = true;
  }, [treeData, expandAll]);

  if (fileStatuses.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Header with stats and controls */}
      <div className="flex flex-col items-start justify-between sm:flex-row sm:items-center">
        <div className="space-y-1">
          <h3 className="font-semibold">Files</h3>
          <p className="text-muted-foreground text-sm">
            <span className="text-foreground">{stats.uploadedCount}</span> files uploaded with total
            size of <span className="text-foreground">{formatSize(stats.uploadedSize)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={expandAll} className="text-xs">
            Expand All
          </Button>
          <Button variant="ghost" size="sm" onClick={collapseAll} className="text-xs">
            Collapse All
          </Button>
        </div>
      </div>

      {/* Legend - collapsible after first dismissal */}
      {showLegend ? (
        <div className="bg-muted/50 flex flex-col gap-2 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-xs">
              <div className="text-foreground flex items-center gap-1 font-medium">
                <span>Legend:</span>
              </div>
              <div className="flex items-center gap-1">
                <Check className="h-4 w-4 text-green-600" />
                <span>Included</span>
              </div>
              <div className="flex items-center gap-1">
                <X className="h-4 w-4 text-red-600" />
                <span>Excluded</span>
              </div>
              <div className="flex items-center gap-1">
                <Minus className="h-4 w-4 text-yellow-600" />
                <span>Partially included</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground h-6 px-2 text-xs"
              onClick={dismissLegend}
              title="Hide this tip (you can hover the ? icon to see it again)"
            >
              Got it
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Click icons to toggle inclusion. Click file names to view contents.
          </p>
        </div>
      ) : (
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <button
            onClick={() => setShowLegend(true)}
            className="hover:bg-muted flex items-center gap-1 rounded px-1.5 py-0.5"
            title="Show legend and tips"
          >
            <HelpCircle className="h-3 w-3" />
            <span>Show tips</span>
          </button>
        </div>
      )}

      {/* File tree */}
      <div className="bg-background rounded-lg border">
        <div className="max-h-[50vh] min-h-[200px] overflow-y-auto p-2">
          {treeData.children && treeData.children.map((child) => renderNode(child))}
        </div>
      </div>

      <div>
        <p className="text-muted-foreground text-sm">
          <span className="text-foreground">{stats.includedCount}</span> files included with total
          size of <span className="text-foreground">{formatSize(stats.includedSize)}</span>,{" "}
          <span className="text-foreground">{stats.excludedCount}</span> files excluded
        </p>
      </div>
    </div>
  );
};

export default FileTree;
