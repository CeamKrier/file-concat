import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, HelpCircle, Info, Minus, X } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { FileStatus, formatSize } from "@fileconcat/core";

import {
  buildFileTree,
  calculateInclusionState,
  collectDirectoryPaths,
  collectFileIndices,
  type TreeNode,
} from "./tree-data";
import { TreeNodeRow } from "./tree-node-row";

const LEGEND_DISMISSED_KEY = "fileconcat-legend-dismissed";

export interface FileTreeProps {
  fileStatuses: FileStatus[];
  onToggleFile: (index: number) => void;
  onToggleMultipleFiles: (indices: number[], shouldInclude: boolean) => void;
  isProcessing?: boolean;
  onOpenFile?: (path: string) => void;
}

function FileTree({
  fileStatuses,
  onToggleFile,
  onToggleMultipleFiles,
  isProcessing = false,
  onOpenFile,
}: FileTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [showLegend, setShowLegend] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(LEGEND_DISMISSED_KEY) !== "true";
  });

  const treeData = useMemo(() => buildFileTree(fileStatuses), [fileStatuses]);

  const stats = useMemo(() => {
    const uploadedCount = fileStatuses.length;
    const uploadedSize = fileStatuses.reduce((acc, s) => acc + s.size, 0);
    const included = fileStatuses.filter((s) => s.included);

    const excludedBuckets = { binary: 0, oversize: 0, pattern: 0, manual: 0, other: 0 };
    for (const status of fileStatuses) {
      if (status.included) continue;
      const reason = status.reason ?? "";
      if (/binary/i.test(reason)) excludedBuckets.binary++;
      else if (/exceeds|size/i.test(reason)) excludedBuckets.oversize++;
      else if (/(ignore|include) patterns/i.test(reason)) excludedBuckets.pattern++;
      else if (/manually/i.test(reason)) excludedBuckets.manual++;
      else excludedBuckets.other++;
    }

    return {
      uploadedCount,
      uploadedSize,
      includedCount: included.length,
      includedSize: included.reduce((acc, s) => acc + s.size, 0),
      excludedCount: uploadedCount - included.length,
      excludedBuckets,
    };
  }, [fileStatuses]);

  const excludedBreakdown = useMemo(() => {
    const labels: Array<[string, number]> = [
      ["binary", stats.excludedBuckets.binary],
      ["oversize", stats.excludedBuckets.oversize],
      ["pattern", stats.excludedBuckets.pattern],
      ["manual", stats.excludedBuckets.manual],
      ["other", stats.excludedBuckets.other],
    ];
    return labels.filter(([, count]) => count > 0);
  }, [stats.excludedBuckets]);

  const toggleExpanded = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedPaths(new Set(collectDirectoryPaths(treeData)));
  }, [treeData]);

  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set());
  }, []);

  const toggleDirectory = useCallback(
    (node: TreeNode) => {
      const shouldInclude = calculateInclusionState(node) !== "included";
      const indices = collectFileIndices(node);
      if (indices.length > 0) onToggleMultipleFiles(indices, shouldInclude);
    },
    [onToggleMultipleFiles],
  );

  const dismissLegend = useCallback(() => {
    setShowLegend(false);
    localStorage.setItem(LEGEND_DISMISSED_KEY, "true");
  }, []);

  // Auto-expand all folders on initial load, once.
  const hasAutoExpandedRef = useRef(false);
  useEffect(() => {
    if (hasAutoExpandedRef.current) return;
    if (!treeData.children || treeData.children.length === 0) return;
    expandAll();
    hasAutoExpandedRef.current = true;
  }, [treeData, expandAll]);

  if (fileStatuses.length === 0) return null;

  return (
    <div className="space-y-3">
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
            type="button"
            onClick={() => setShowLegend(true)}
            className="hover:bg-muted flex items-center gap-1 rounded px-1.5 py-0.5"
            title="Show legend and tips"
          >
            <HelpCircle className="h-3 w-3" />
            <span>Show tips</span>
          </button>
        </div>
      )}

      <div className="bg-background rounded-lg border">
        <div className="max-h-[50vh] min-h-[200px] overflow-y-auto p-2">
          {treeData.children?.map((child) => (
            <TreeNodeRow
              key={child.path}
              node={child}
              depth={0}
              expandedPaths={expandedPaths}
              isProcessing={isProcessing}
              onToggleExpanded={toggleExpanded}
              onToggleFile={onToggleFile}
              onToggleDirectory={toggleDirectory}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      </div>

      <p className="text-muted-foreground flex flex-wrap items-center gap-x-1 text-sm">
        <span>
          <span className="text-foreground">{stats.includedCount}</span> files included with total
          size of <span className="text-foreground">{formatSize(stats.includedSize)}</span>,{" "}
          <span className="text-foreground">{stats.excludedCount}</span> files excluded
        </span>
        {excludedBreakdown.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="View exclusion breakdown"
                className="text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:ring-ring rounded-sm p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
              >
                <Info className="h-3.5 w-3.5" aria-hidden />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" side="top" className="w-auto min-w-[10rem] p-3">
              <ul className="space-y-1.5 text-xs">
                {excludedBreakdown.map(([label, count]) => (
                  <li key={label} className="flex items-center justify-between gap-6">
                    <span className="text-muted-foreground capitalize">{label}</span>
                    <span className="text-foreground font-medium tabular-nums">{count}</span>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        )}
      </p>
    </div>
  );
}

export default FileTree;
