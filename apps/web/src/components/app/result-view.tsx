import { Check, Copy, Download, EyeOff, FileQuestion, FileText, FileWarning, Scissors, SlidersHorizontal } from "lucide-react";

import { cn } from "~/lib/utils";
import { InfoCard } from "./info-card";
import { SegmentedControl } from "./segmented-control";

type OutputStyle = "xml" | "markdown" | "plain";
type SplitMode = "single" | "multi";

export type UnsupportedFile = { name: string; why: string };

type ResultViewProps = {
  sourceLabel: string;
  note?: string | null;
  filesCombined: number;
  tokens: number;
  noiseSkipped: number;
  outputStyle: OutputStyle;
  onOutputStyleChange: (style: OutputStyle) => void;
  isCopied: boolean;
  isGenerating: boolean;
  onCopy: () => void;
  onDownload: () => void;
  previewText: string;
  /** Genuinely not combinable as text — binaries, archives, unreadable files. */
  unsupported: UnsupportedFile[];
  /** Readable text held back by a default rule — hidden dotfiles, over the size cap. */
  skippedByDefault: UnsupportedFile[];
  /** Included files that decoded as "ambiguous" — kept in, but worth a look. */
  flaggedFiles: string[];
  /** Included files whose text was extracted from a document (PDF/Office/ODF). */
  extractedFiles: string[];
  /** Open the "Adjust what's included" drawer. */
  onAdjust: () => void;
  bigBundle: boolean;
  splitMode: SplitMode;
  onSplitModeChange: (mode: SplitMode) => void;
};

const fmt = new Intl.NumberFormat("en-US");
const PREVIEW_LIMIT = 4000;

export function ResultView({
  sourceLabel,
  note,
  filesCombined,
  tokens,
  noiseSkipped,
  outputStyle,
  onOutputStyleChange,
  isCopied,
  isGenerating,
  onCopy,
  onDownload,
  previewText,
  unsupported,
  skippedByDefault,
  flaggedFiles,
  extractedFiles,
  onAdjust,
  bigBundle,
  splitMode,
  onSplitModeChange,
}: ResultViewProps) {
  const truncated = previewText.length > PREVIEW_LIMIT;
  const preview = truncated ? previewText.slice(0, PREVIEW_LIMIT) + "\n…" : previewText;

  return (
    <section className="animate-fade-up mx-auto w-full max-w-[720px] px-4 pt-12 motion-reduce:animate-none">
      <div className="flex flex-col items-center text-center">
        <span className="border-primary flex h-12 w-12 items-center justify-center rounded-full border-2 bg-[oklch(var(--primary)/0.12)]">
          <Check className="text-primary h-6 w-6" strokeWidth={2.5} />
        </span>
        <h2 className="font-display text-ink mt-4 text-[30px] font-bold tracking-[-0.02em]">
          Your file&apos;s ready
        </h2>
        <p className="text-ink-muted mt-2 font-mono text-[13px]">
          <span className="text-ink-secondary">{sourceLabel}</span> → one document
        </p>
        {note && (
          <span className="text-go-fg rounded-pill mt-3 inline-flex items-center gap-2 border border-[oklch(var(--primary)/0.25)] bg-[oklch(var(--primary)/0.08)] px-3 py-1 text-[12px]">
            <Check className="text-primary h-3 w-3 shrink-0" strokeWidth={2.5} />
            {note}
          </span>
        )}
      </div>

      {/* One readout, three figures — not three metric cards. */}
      <div className="border-border bg-surface rounded-card mt-7 grid grid-cols-3 divide-x divide-[oklch(var(--hairline))] border">
        <Stat value={fmt.format(filesCombined)} label="files combined" />
        <Stat value={fmt.format(tokens)} label="tokens" />
        <Stat value={fmt.format(noiseSkipped)} label="noise files skipped" />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onCopy}
          className={cn(
            "rounded-input focus-visible:ring-ring focus-visible:ring-offset-background inline-flex flex-1 items-center justify-center gap-2 px-5 py-3 text-sm font-semibold transition-[filter,background-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
            isCopied
              ? "text-go-fg border-primary border bg-[oklch(var(--primary)/0.16)]"
              : "bg-primary text-primary-foreground hover:brightness-110",
          )}
        >
          {isCopied ? (
            <>
              <Check className="h-4 w-4" strokeWidth={2.5} /> Copied to clipboard
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" /> Copy
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onDownload}
          disabled={isGenerating}
          className="bg-secondary text-ink border-border-strong rounded-input focus-visible:ring-ring focus-visible:ring-offset-background hover:bg-accent inline-flex items-center justify-center gap-2 border px-5 py-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          {isGenerating ? "Preparing…" : "Download"}
        </button>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <span className="text-ink-faint font-mono text-[11px] uppercase tracking-[0.12em]">
          Format
        </span>
        <SegmentedControl
          ariaLabel="Output format"
          value={outputStyle}
          onChange={onOutputStyleChange}
          options={[
            { value: "xml", label: "XML" },
            { value: "markdown", label: "Markdown" },
            { value: "plain", label: "Plain" },
          ]}
        />
      </div>

      {(flaggedFiles.length > 0 ||
        extractedFiles.length > 0 ||
        unsupported.length > 0 ||
        skippedByDefault.length > 0 ||
        bigBundle) && (
        <div className="mt-5 flex flex-col gap-3">
          {extractedFiles.length > 0 && (
            <InfoCard
              tone="info"
              icon={FileText}
              title={`Text extracted from ${extractedFiles.length} ${extractedFiles.length === 1 ? "document" : "documents"}`}
            >
              <p>
                {extractedFiles.length === 1 ? "It was" : "They were"} included as extracted text —
                the readable content pulled out of the document, not the original file bytes.
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {extractedFiles.slice(0, 6).map((name) => (
                  <li key={name} className="text-ink font-mono text-[11px]">
                    {name}
                  </li>
                ))}
                {extractedFiles.length > 6 && (
                  <li className="text-ink-faint font-mono text-[11px]">
                    +{extractedFiles.length - 6} more
                  </li>
                )}
              </ul>
            </InfoCard>
          )}
          {flaggedFiles.length > 0 && (
            <InfoCard
              tone="info"
              icon={FileQuestion}
              title={`${flaggedFiles.length} ${flaggedFiles.length === 1 ? "file" : "files"} might not be plain text`}
            >
              <p>
                {flaggedFiles.length === 1 ? "It was" : "They were"} kept in, but we couldn&apos;t
                read {flaggedFiles.length === 1 ? "it" : "them"} cleanly. If the preview below looks
                garbled, drop {flaggedFiles.length === 1 ? "it" : "them"} from the bundle.
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {flaggedFiles.slice(0, 6).map((name) => (
                  <li key={name} className="text-ink font-mono text-[11px]">
                    {name}
                  </li>
                ))}
                {flaggedFiles.length > 6 && (
                  <li className="text-ink-faint font-mono text-[11px]">
                    +{flaggedFiles.length - 6} more
                  </li>
                )}
              </ul>
              <button
                type="button"
                onClick={onAdjust}
                className="text-ink focus-visible:ring-ring focus-visible:ring-offset-background rounded-input mt-2.5 inline-flex items-center gap-1.5 text-[13px] font-medium underline decoration-[oklch(var(--hairline))] underline-offset-4 transition-colors hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Adjust what&apos;s included
              </button>
            </InfoCard>
          )}
          {unsupported.length > 0 && (
            <InfoCard
              tone="info"
              icon={FileWarning}
              title={`${unsupported.length} ${unsupported.length === 1 ? "file isn't" : "files aren't"} text, left out`}
            >
              <p>
                These can&apos;t be combined as text, so they were skipped. Everything else made it
                in.
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {unsupported.slice(0, 6).map((f) => (
                  <li key={f.name} className="flex items-baseline gap-2 font-mono text-[11px]">
                    <span className="text-ink">{f.name}</span>
                    <span className="text-ink-faint">· {f.why}</span>
                  </li>
                ))}
                {unsupported.length > 6 && (
                  <li className="text-ink-faint font-mono text-[11px]">
                    +{unsupported.length - 6} more
                  </li>
                )}
              </ul>
            </InfoCard>
          )}
          {skippedByDefault.length > 0 && (
            <InfoCard
              tone="neutral"
              icon={EyeOff}
              title={`${skippedByDefault.length} text ${skippedByDefault.length === 1 ? "file" : "files"} left out by default`}
            >
              <p>
                {skippedByDefault.length === 1 ? "It's" : "They're"} readable text, just kept out by
                default: hidden dotfiles like <span className="text-ink">.gitignore</span>, or files
                over the size cap. Add {skippedByDefault.length === 1 ? "it" : "any"} back if you
                need {skippedByDefault.length === 1 ? "it" : "them"}.
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {skippedByDefault.slice(0, 6).map((f) => (
                  <li key={f.name} className="flex items-baseline gap-2 font-mono text-[11px]">
                    <span className="text-ink">{f.name}</span>
                    <span className="text-ink-faint">· {f.why}</span>
                  </li>
                ))}
                {skippedByDefault.length > 6 && (
                  <li className="text-ink-faint font-mono text-[11px]">
                    +{skippedByDefault.length - 6} more
                  </li>
                )}
              </ul>
              <button
                type="button"
                onClick={onAdjust}
                className="text-ink focus-visible:ring-ring focus-visible:ring-offset-background rounded-input mt-2.5 inline-flex items-center gap-1.5 text-[13px] font-medium underline decoration-[oklch(var(--hairline))] underline-offset-4 transition-colors hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Adjust what&apos;s included
              </button>
            </InfoCard>
          )}
          {bigBundle && (
            <InfoCard
              tone="neutral"
              icon={Scissors}
              title="Big bundle: splitting is optional, just easier to paste"
            >
              <p>One paste can be a lot for a chat box. Split it into parts, or keep it as one.</p>
              <div className="mt-2.5">
                <SegmentedControl
                  ariaLabel="Split mode"
                  size="sm"
                  value={splitMode}
                  onChange={onSplitModeChange}
                  options={[
                    { value: "single", label: "Keep as one file" },
                    { value: "multi", label: "Split into parts" },
                  ]}
                />
              </div>
            </InfoCard>
          )}
        </div>
      )}

      <div className="mt-6">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h3 className="text-ink-secondary text-sm font-medium">What your AI receives</h3>
          {truncated && (
            <span className="text-ink-faint font-mono text-[11px]">
              preview · first {fmt.format(PREVIEW_LIMIT)} chars
            </span>
          )}
        </div>
        <pre className="border-border bg-surface-inset text-code rounded-card max-h-[420px] overflow-auto border p-4 font-mono text-xs leading-relaxed">
          {preview}
        </pre>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-3 py-5">
      <span className="font-display text-ink text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-ink-muted text-center text-xs">{label}</span>
    </div>
  );
}
