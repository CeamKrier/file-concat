import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, Copy, Download, Sliders } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import type { OutputFormat, OutputStyle } from "@fileconcat/core";
import { MULTI_OUTPUT_LIMIT } from "@fileconcat/core";
import { cn } from "~/lib/utils";

export interface ActionBarProps {
  tokens: number;
  format: OutputFormat;
  style: OutputStyle;
  recommendedFormat: OutputFormat;
  chunkSizeKB: number;
  estimations: { single: string; multiple: string };

  isProcessing: boolean;
  canEmit: boolean;
  isCopied: boolean;

  onSelectFormat: (format: OutputFormat) => void;
  onSelectStyle: (style: OutputStyle) => void;
  onChangeChunkSize: (value: number) => void;
  onCopy: () => void;
  onDownload: () => void;
}

export function ActionBar({
  tokens,
  format,
  style,
  recommendedFormat,
  chunkSizeKB,
  estimations,
  isProcessing,
  canEmit,
  isCopied,
  onSelectFormat,
  onSelectStyle,
  onChangeChunkSize,
  onCopy,
  onDownload,
}: ActionBarProps) {
  const [optionsOpen, setOptionsOpen] = useState(false);

  const formatLabel = format === "single" ? "single file" : "multi-part";
  const styleLabel = style === "xml" ? "XML" : "Markdown";
  const suggestMultiPart = recommendedFormat === "multi" && format === "single";
  const multiPartThreshold = (MULTI_OUTPUT_LIMIT / 1000).toFixed(0);

  return (
    <div className="sticky bottom-0 z-30 -mx-4 mt-6 sm:mx-0">
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 border-border/60 mx-4 rounded-lg border shadow-sm backdrop-blur-md sm:mx-0">
        {suggestMultiPart && (
          <div className="border-border/60 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b px-3 py-2 text-[12px]">
            <AlertTriangle
              className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden="true"
            />
            <span className="text-foreground font-medium">Over {multiPartThreshold}K tokens.</span>
            <span className="text-muted-foreground">Multi-part is easier to paste into a chat.</span>
            <button
              type="button"
              onClick={() => onSelectFormat("multi")}
              className="border-border/70 hover:border-foreground/40 hover:bg-accent focus-visible:ring-ring ml-auto rounded-md border px-2 py-1 font-mono text-[11.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
            >
              Switch to multi-part
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 px-3 py-2.5 sm:flex-nowrap">
          <div className="text-foreground flex min-w-0 flex-1 items-baseline gap-2 font-mono text-[12.5px] tabular-nums">
            <span className="font-semibold">{tokens.toLocaleString()}</span>
            <span className="text-muted-foreground">tokens</span>
            <span className="text-muted-foreground hidden sm:inline" aria-hidden="true">
              ·
            </span>
            <span className="text-muted-foreground hidden truncate sm:inline">
              {formatLabel} · {styleLabel}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
          <Popover open={optionsOpen} onOpenChange={setOptionsOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="border-border/70 hover:border-foreground/40 hover:bg-accent focus-visible:ring-ring flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2"
                aria-label="Output options"
              >
                <Sliders className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Options</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={8} className="w-72 space-y-4 text-sm">
              <div className="space-y-2">
                <div className="text-foreground text-[11px] font-semibold uppercase tracking-[0.08em]">
                  Format
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <FormatChoice
                    label="Single file"
                    description="One blob, paste-ready"
                    active={format === "single"}
                    recommended={recommendedFormat === "single"}
                    onSelect={() => onSelectFormat("single")}
                    detail={estimations.single}
                  />
                  <FormatChoice
                    label="Multi-part"
                    description="Split for large contexts"
                    active={format === "multi"}
                    recommended={recommendedFormat === "multi"}
                    onSelect={() => onSelectFormat("multi")}
                    detail={estimations.multiple}
                  />
                </div>
                <p className="text-muted-foreground text-[11px]">
                  Recommendation switches above ~{(MULTI_OUTPUT_LIMIT / 1000).toFixed(0)}K tokens.
                </p>
              </div>

              <div className="space-y-2">
                <div className="text-foreground text-[11px] font-semibold uppercase tracking-[0.08em]">
                  Style
                </div>
                <div
                  role="group"
                  aria-label="Output style"
                  className="border-border/60 flex rounded-md border p-0.5"
                >
                  <StyleChoice
                    label="XML"
                    hint="Recommended for Claude"
                    active={style === "xml"}
                    onSelect={() => onSelectStyle("xml")}
                  />
                  <StyleChoice
                    label="Markdown"
                    hint="Fenced code blocks"
                    active={style === "markdown"}
                    onSelect={() => onSelectStyle("markdown")}
                  />
                </div>
              </div>

              {format === "multi" && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="actionbar-chunk-size"
                    className="text-foreground text-[11px] font-semibold uppercase tracking-[0.08em]"
                  >
                    Chunk size (KB)
                  </label>
                  <input
                    id="actionbar-chunk-size"
                    type="number"
                    min={1}
                    max={1024}
                    value={chunkSizeKB}
                    onChange={(e) => onChangeChunkSize(Number(e.target.value))}
                    className="bg-background border-border/70 focus-visible:border-foreground/40 focus-visible:ring-ring w-full max-w-[8rem] rounded-md border px-2.5 py-1 font-mono text-[12px] tabular-nums focus-visible:outline-none focus-visible:ring-2"
                  />
                  <p className="text-muted-foreground text-[11px]">
                    Target size per part. Files larger than this are split.
                  </p>
                </div>
              )}
            </PopoverContent>
          </Popover>

          {format === "single" && (
            <button
              type="button"
              onClick={onCopy}
              disabled={!canEmit || isProcessing}
              className="border-border/70 hover:border-foreground/40 hover:bg-accent focus-visible:ring-ring flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCopied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onDownload}
            disabled={!canEmit || isProcessing}
            className="bg-foreground text-background hover:bg-foreground/90 focus-visible:ring-foreground flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormatChoice({
  label,
  description,
  detail,
  active,
  recommended,
  onSelect,
}: {
  label: string;
  description: string;
  detail: string;
  active: boolean;
  recommended: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "border-border/70 hover:border-foreground/40 group rounded-md border px-2.5 py-2 text-left transition-colors",
        active
          ? "border-foreground/60 bg-accent"
          : "hover:bg-accent/40",
      )}
    >
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-foreground text-[12.5px] font-semibold">{label}</span>
        {recommended && !active && (
          <span className="text-muted-foreground text-[10px] uppercase tracking-wide">rec</span>
        )}
      </div>
      <div className="text-muted-foreground text-[11px] leading-snug">{description}</div>
      <div className="text-muted-foreground mt-1 font-mono text-[10.5px] tabular-nums">
        {detail}
      </div>
    </button>
  );
}

function StyleChoice({
  label,
  hint,
  active,
  onSelect,
}: {
  label: string;
  hint: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      title={hint}
      className={cn(
        "flex-1 rounded-sm px-2 py-1 text-[12px] font-medium transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
