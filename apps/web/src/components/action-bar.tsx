import { forwardRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Copy, Download, Minus, Plus } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import type { OutputFormat, OutputFormatPreference, OutputStyle } from "@fileconcat/core";
import { MULTI_OUTPUT_LIMIT } from "@fileconcat/core";
import { cn } from "~/lib/utils";

// Chunk size is expressed in KB. The +/- steppers walk this ladder of common
// part sizes so a couple of clicks span the whole range; typing still allows
// any value in [CHUNK_MIN, CHUNK_MAX].
const CHUNK_LADDER = [16, 32, 64, 128, 256, 512, 1024] as const;
const CHUNK_MIN = 1;
const CHUNK_MAX = 1024;

function clampChunk(value: number): number {
  if (!Number.isFinite(value)) return 32;
  return Math.min(CHUNK_MAX, Math.max(CHUNK_MIN, Math.round(value)));
}

function chunkStepUp(value: number): number {
  return CHUNK_LADDER.find((step) => step > value) ?? CHUNK_MAX;
}

function chunkStepDown(value: number): number {
  for (let i = CHUNK_LADDER.length - 1; i >= 0; i--) {
    if (CHUNK_LADDER[i] < value) return CHUNK_LADDER[i];
  }
  return CHUNK_MIN;
}

export interface ActionBarProps {
  tokens: number;
  /** What the user has pinned: `"auto"` resolves live to {@link effectiveFormat}. */
  formatPreference: OutputFormatPreference;
  /** The format that will actually be emitted (auto resolved against tokens). */
  effectiveFormat: OutputFormat;
  /** What auto would pick right now — drives the nudge and the Auto hint. */
  recommendedFormat: OutputFormat;
  style: OutputStyle;
  chunkSizeKB: number;
  estimations: { single: string; multiple: string };

  isProcessing: boolean;
  canEmit: boolean;
  isCopied: boolean;

  onSelectFormatPreference: (preference: OutputFormatPreference) => void;
  onSelectStyle: (style: OutputStyle) => void;
  onChangeChunkSize: (value: number) => void;
  onCopy: () => void;
  onDownload: () => void;
}

export function ActionBar({
  tokens,
  formatPreference,
  effectiveFormat,
  recommendedFormat,
  style,
  chunkSizeKB,
  estimations,
  isProcessing,
  canEmit,
  isCopied,
  onSelectFormatPreference,
  onSelectStyle,
  onChangeChunkSize,
  onCopy,
  onDownload,
}: ActionBarProps) {
  const [formatOpen, setFormatOpen] = useState(false);
  const [chunkOpen, setChunkOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);

  const formatLabel = effectiveFormat === "multi" ? "Multi-part" : "Single file";
  const styleLabel = style === "xml" ? "XML" : "Markdown";
  const recommendedLabel = recommendedFormat === "multi" ? "Multi-part" : "Single file";
  const multiPartThreshold = (MULTI_OUTPUT_LIMIT / 1000).toFixed(0);
  // Only nudge when the user has actively pinned single against the recommendation.
  // In auto mode the format already follows the recommendation, so there's nothing to switch.
  const suggestMultiPart = formatPreference === "single" && recommendedFormat === "multi";

  const pickFormat = (preference: OutputFormatPreference) => {
    onSelectFormatPreference(preference);
    setFormatOpen(false);
  };

  const pickStyle = (next: OutputStyle) => {
    onSelectStyle(next);
    setStyleOpen(false);
  };

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
              onClick={() => onSelectFormatPreference("multi")}
              className="border-border/70 hover:border-foreground/40 hover:bg-accent focus-visible:ring-ring ml-auto rounded-md border px-2 py-1 font-mono text-[11.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
            >
              Switch to multi-part
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 px-3 py-2.5">
          <div className="text-foreground flex items-baseline gap-1.5 font-mono text-[12.5px] tabular-nums">
            <span className="font-semibold">{tokens.toLocaleString()}</span>
            <span className="text-muted-foreground">tokens</span>
          </div>

          <span className="bg-border/70 hidden h-4 w-px sm:block" aria-hidden="true" />

          <div className="flex flex-wrap items-center gap-1.5">
            <Popover open={formatOpen} onOpenChange={setFormatOpen}>
              <PopoverTrigger asChild>
                <PropertyPill value={formatLabel} ariaLabel={`Output format: ${formatLabel}`} />
              </PopoverTrigger>
              <PopoverContent align="start" sideOffset={8} className="w-72 p-1.5">
                <PopoverHeading>Format</PopoverHeading>
                <div className="space-y-0.5">
                  <ChoiceRow
                    label="Auto"
                    hint={`Picks by token count, now ${recommendedLabel}`}
                    active={formatPreference === "auto"}
                    onSelect={() => pickFormat("auto")}
                  />
                  <ChoiceRow
                    label="Single file"
                    hint="One blob, paste-ready"
                    detail={estimations.single}
                    active={formatPreference === "single"}
                    onSelect={() => pickFormat("single")}
                  />
                  <ChoiceRow
                    label="Multi-part"
                    hint="Split for large contexts"
                    detail={estimations.multiple}
                    active={formatPreference === "multi"}
                    onSelect={() => pickFormat("multi")}
                  />
                </div>
                <p className="text-muted-foreground px-2 pb-1 pt-2 text-[11px]">
                  Recommendation switches above ~{multiPartThreshold}K tokens.
                </p>
              </PopoverContent>
            </Popover>

            {effectiveFormat === "multi" && (
              <Popover open={chunkOpen} onOpenChange={setChunkOpen}>
                <PopoverTrigger asChild>
                  <PropertyPill
                    value={`${chunkSizeKB} KB / part`}
                    ariaLabel={`Chunk size: ${chunkSizeKB} KB per part`}
                  />
                </PopoverTrigger>
                <PopoverContent align="start" sideOffset={8} className="w-64 space-y-2.5 p-3">
                  <div className="text-foreground text-[11px] font-semibold uppercase tracking-[0.08em]">
                    Chunk size
                  </div>
                  <ChunkStepper value={chunkSizeKB} onChange={onChangeChunkSize} />
                  <p className="text-muted-foreground text-[11px] leading-snug">
                    Target size per part. Files larger than this are split across more parts.
                  </p>
                  <p className="text-foreground/80 font-mono text-[10.5px] tabular-nums">
                    Now: {estimations.multiple}
                  </p>
                </PopoverContent>
              </Popover>
            )}

            <Popover open={styleOpen} onOpenChange={setStyleOpen}>
              <PopoverTrigger asChild>
                <PropertyPill value={styleLabel} ariaLabel={`Output style: ${styleLabel}`} />
              </PopoverTrigger>
              <PopoverContent align="start" sideOffset={8} className="w-60 p-1.5">
                <PopoverHeading>Style</PopoverHeading>
                <div className="space-y-0.5">
                  <ChoiceRow
                    label="XML"
                    hint="Recommended for Claude"
                    active={style === "xml"}
                    onSelect={() => pickStyle("xml")}
                  />
                  <ChoiceRow
                    label="Markdown"
                    hint="Fenced code blocks"
                    active={style === "markdown"}
                    onSelect={() => pickStyle("markdown")}
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {effectiveFormat === "single" && (
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

/**
 * A settings chip that reads as the current value (full ink, never muted) and
 * opens its popover. The trailing chevron marks it as a disclosure rather than
 * an action button.
 */
const PropertyPill = forwardRef<
  HTMLButtonElement,
  { value: string; ariaLabel: string } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ value, ariaLabel, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-label={ariaLabel}
    className="border-border/70 text-foreground hover:border-foreground/40 hover:bg-accent focus-visible:ring-ring data-[state=open]:border-foreground/40 data-[state=open]:bg-accent inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
    {...props}
  >
    <span>{value}</span>
    <ChevronDown className="h-3 w-3 opacity-50" aria-hidden="true" />
  </button>
));
PropertyPill.displayName = "PropertyPill";

function PopoverHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-foreground px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em]">
      {children}
    </div>
  );
}

function ChoiceRow({
  label,
  hint,
  detail,
  active,
  onSelect,
}: {
  label: string;
  hint: string;
  detail?: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      role="menuitemradio"
      aria-checked={active}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
        active ? "bg-accent" : "hover:bg-accent/50",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
          active ? "border-foreground bg-foreground text-background" : "border-border",
        )}
      >
        {active && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2 text-[12.5px] font-medium">
          <span className="text-foreground whitespace-nowrap">{label}</span>
          {detail && (
            <span className="text-muted-foreground min-w-0 shrink truncate font-mono text-[10.5px] font-normal tabular-nums">
              {detail}
            </span>
          )}
        </span>
        <span className="text-muted-foreground mt-0.5 block text-[11px] leading-snug">{hint}</span>
      </span>
    </button>
  );
}

/**
 * Inline +/- stepper for the multi-part chunk size. The center field stays
 * directly editable (typed values are committed on blur / Enter and clamped),
 * while the buttons jump along {@link CHUNK_LADDER} for fast coarse changes.
 */
function ChunkStepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? String(value);

  const commit = () => {
    if (draft === null) return;
    onChange(draft.trim() === "" ? value : clampChunk(Number(draft)));
    setDraft(null);
  };

  return (
    <div
      role="group"
      aria-label="Chunk size in kilobytes"
      className="border-border/70 bg-background inline-flex items-center rounded-md border font-mono text-[12px]"
    >
      <button
        type="button"
        aria-label="Decrease chunk size"
        onClick={() => onChange(chunkStepDown(value))}
        disabled={value <= CHUNK_MIN}
        className="text-foreground hover:bg-accent focus-visible:ring-ring flex h-[30px] w-7 items-center justify-center rounded-l-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <div className="border-border/60 flex items-center gap-1 border-x px-1.5 py-1">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={display}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit();
              e.currentTarget.blur();
            }
          }}
          aria-label="Chunk size in kilobytes"
          className="text-foreground w-9 bg-transparent text-center tabular-nums focus:outline-none"
        />
        <span className="text-muted-foreground text-[11px]">KB</span>
      </div>
      <button
        type="button"
        aria-label="Increase chunk size"
        onClick={() => onChange(chunkStepUp(value))}
        disabled={value >= CHUNK_MAX}
        className="text-foreground hover:bg-accent focus-visible:ring-ring flex h-[30px] w-7 items-center justify-center rounded-r-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
