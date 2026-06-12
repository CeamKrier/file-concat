import { RotateCcw, SlidersHorizontal } from "lucide-react";

import { cn } from "~/lib/utils";

export interface SourceBarProps {
  projectName: string;
  fileCount: number;
  includedCount: number;
  isProcessing: boolean;
  statusMessage?: string;
  onReset: () => void;
  onOpenFilters?: () => void;
  manualOverrideCount?: number;
}

export function SourceBar({
  projectName,
  fileCount,
  includedCount,
  isProcessing,
  statusMessage,
  onReset,
  onOpenFilters,
  manualOverrideCount = 0,
}: SourceBarProps) {
  return (
    <div className="border-border/60 mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border px-3 py-2.5 sm:px-4">
      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        <h1 className="text-foreground min-w-0 truncate font-mono text-[13.5px] font-semibold tracking-tight">
          {projectName || "untitled"}
        </h1>
        <div className="text-muted-foreground hidden font-mono text-[12px] tabular-nums sm:flex sm:items-baseline sm:gap-2">
          <span>
            <span className="text-foreground tabular-nums">{includedCount.toLocaleString()}</span>
            <span> / </span>
            <span className="tabular-nums">{fileCount.toLocaleString()}</span>
            <span> files</span>
          </span>
          {manualOverrideCount > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>{manualOverrideCount} manual</span>
            </>
          )}
        </div>
      </div>

      {statusMessage && (
        <span
          className={cn(
            "text-muted-foreground hidden font-mono text-[12px] sm:inline",
            isProcessing && "text-foreground",
          )}
          aria-live="polite"
        >
          {statusMessage}
        </span>
      )}

      <div className="flex items-center gap-1.5">
        {onOpenFilters && (
          <button
            type="button"
            onClick={onOpenFilters}
            className="border-border/70 hover:border-foreground/40 hover:bg-accent focus-visible:ring-ring flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 lg:hidden"
            aria-label="Open filters"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
          </button>
        )}
        <button
          type="button"
          onClick={onReset}
          disabled={isProcessing}
          className="text-foreground border-border/70 hover:border-destructive/40 hover:text-destructive focus-visible:ring-ring flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Start over
        </button>
      </div>

      <div className="text-muted-foreground basis-full font-mono text-[11.5px] tabular-nums sm:hidden">
        <span className="text-foreground tabular-nums">{includedCount.toLocaleString()}</span>
        <span> / </span>
        <span className="tabular-nums">{fileCount.toLocaleString()}</span>
        <span> files</span>
        {manualOverrideCount > 0 && <span> · {manualOverrideCount} manual</span>}
      </div>
    </div>
  );
}
