import {
  BookOpen,
  Captions,
  FileSpreadsheet,
  FileText,
  Mail,
  NotebookPen,
  Presentation,
  type LucideIcon,
} from "lucide-react";

import { cn } from "~/lib/utils";
import {
  BandGrid,
  BandIntro,
  BandLink,
  BandLinks,
  FigureTitle,
  MarketingSection,
} from "./section";

/** Band 3: documents become text here, and the ledger says what did not. */
export function DocumentsSection() {
  return (
    <MarketingSection tone="alt" labelledBy="documents-read-here">
      <BandIntro
        id="documents-read-here"
        title="Documents are read here, and what gets lost is written down."
      >
        PDF, Word, Excel and slides become text in the tab. The ledger names what was not read
        in full.
      </BandIntro>

      <BandGrid className="mt-10">
        <PaneDiff />
        <div className="min-w-0">
          <Ledger />
          <Formats />
        </div>
      </BandGrid>

      <BandLinks className="mt-5">
        <BandLink to="/blog/what-gets-lost-converting-documents-to-text">
          What gets lost converting documents to text
        </BandLink>
      </BandLinks>
    </MarketingSection>
  );
}

/** Which column of the page a line came from. Left is green, right is blue. */
type Origin = "left" | "right";

const OURS: [Origin, string][] = [
  ["left", "Quarterly results were ahead of plan in both regions."],
  ["left", "Margins held despite freight costs."],
  ["right", "Outlook: guidance is unchanged for the full year."],
  ["right", "Hiring resumes in the third quarter."],
];

const THEIRS: [Origin, string][] = [
  ["left", "Quarterly results were ahead of plan in"],
  ["right", "Outlook: guidance is unchanged for the"],
  ["left", "both regions. Margins held despite"],
  ["right", "full year. Hiring resumes in the third"],
];

const TINT: Record<Origin, string> = {
  left: "bg-[oklch(var(--primary)/0.10)]",
  right: "bg-[oklch(var(--neutral-info)/0.10)]",
};

/**
 * One two-column PDF page read by our reader and by an independent one. Every
 * line is tinted by the column it came from, so "ours keeps the columns,
 * theirs interleaves them" is a shape before it is a sentence. Two outputs of
 * the same bytes: no arrow between them, and no order beyond top and bottom.
 */
function PaneDiff() {
  return (
    <div className="min-w-0">
      <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <FigureTitle>The same PDF page, two readers</FigureTitle>
        <span className="text-ink-muted inline-flex gap-3.5 font-mono text-[11.5px]">
          <Swatch tone="left">left column</Swatch>
          <Swatch tone="right">right column</Swatch>
        </span>
      </div>
      <div className="grid gap-3">
        <Pane reader="FileConcat" verdict="in reading order" lines={OURS} ours />
        <Pane reader="independent reader" verdict="columns interleaved" lines={THEIRS} />
      </div>
    </div>
  );
}

function Swatch({ tone, children }: { tone: Origin; children: string }) {
  return (
    <span>
      <span
        className={cn(
          "mr-1.5 inline-block h-2 w-2 rounded-[2px] align-middle",
          tone === "left" ? "bg-[oklch(var(--primary)/0.6)]" : "bg-[oklch(var(--neutral-info)/0.6)]",
        )}
      />
      {children}
    </span>
  );
}

function Pane({
  reader,
  verdict,
  lines,
  ours,
}: {
  reader: string;
  verdict: string;
  lines: [Origin, string][];
  ours?: boolean;
}) {
  return (
    <div className="border-border bg-surface rounded-chip overflow-hidden border">
      <div
        className={cn(
          "border-border flex justify-between gap-3 border-b px-4 py-2.5 font-mono text-[11.5px]",
          ours ? "text-primary" : "text-ink-secondary",
        )}
      >
        {reader}
        <span className="text-ink-muted">{verdict}</span>
      </div>
      <div className="grid gap-1.5 px-4 py-3.5 text-[14px] leading-[1.5] text-[#e7e0d2]">
        {lines.map(([origin, text]) => (
          <div key={text} className={cn("rounded-[4px] px-2.5 py-[7px]", TINT[origin])}>
            {text}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The result screen's ledger, opened. A tinted mark is a gap, a bare one is a
 * note; the header counts them without being opened. Five rows here so the
 * layout is designed for the busiest drop, not the quietest.
 */
const LEDGER = [
  { label: "extracted", count: 31, tone: "go", gap: false, note: "text pulled from pdf, docx, xlsx, pptx" },
  { label: "partly read", count: 2, tone: "warn", gap: true, note: "dates as serial numbers; a footnote out of order" },
  { label: "held back", count: 1, tone: "warn", gap: true, note: "over the size cap, add it from the review list" },
  { label: "left out", count: 3, tone: "muted", gap: false, note: "two images and a lockfile" },
  { label: "flagged", count: 1, tone: "info", gap: false, note: "scanned page, recognised in the browser (en)" },
] as const;

const COUNT_TONE = {
  go: "text-primary",
  warn: "text-info",
  muted: "text-ink-muted",
  info: "text-neutral-info",
} as const;

function Ledger() {
  const gaps = LEDGER.filter((r) => r.gap).length;
  const notes = LEDGER.length - gaps;
  return (
    <div className="border-border-strong bg-surface rounded-chip border px-[18px] py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <FigureTitle>What happened to your files</FigureTitle>
        <span className="text-ink-muted font-mono text-[11.5px] tabular-nums">
          {gaps} {gaps === 1 ? "gap" : "gaps"}, {notes} {notes === 1 ? "note" : "notes"}
        </span>
      </div>
      <div className="mt-2 grid">
        {LEDGER.map((row) => (
          <div
            key={row.label}
            className="border-border grid grid-cols-[16px_minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 border-t py-3"
          >
            <span
              className={cn(
                "h-3 w-3 self-center rounded-[3px] border",
                row.gap
                  ? "border-[oklch(var(--info)/0.6)] bg-[oklch(var(--info)/0.18)]"
                  : "border-ink-faint bg-transparent",
              )}
            />
            <span className="text-ink text-[15px]">{row.label}</span>
            <span
              className={cn(
                "min-w-[3ch] text-right font-mono text-[16px] tracking-[-0.01em] tabular-nums",
                COUNT_TONE[row.tone],
              )}
            >
              {row.count}
            </span>
            <span className="text-ink-muted col-start-2 col-end-[-1] font-mono text-[11.5px] leading-[1.5]">
              {row.note}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The formats the tab reads, grouped by what the file is rather than listed
 * one extension per pill: a reader recognises a spreadsheet icon faster than
 * "ods", and seven chips wrap where sixteen pills did not.
 */
const FORMATS: { icon: LucideIcon; kind: string; ext: string[] }[] = [
  { icon: FileText, kind: "documents", ext: ["pdf", "doc", "docx", "odt", "rtf"] },
  { icon: FileSpreadsheet, kind: "spreadsheets", ext: ["xls", "xlsx", "ods"] },
  { icon: Presentation, kind: "slides", ext: ["ppt", "pptx", "odp"] },
  { icon: BookOpen, kind: "ebooks", ext: ["epub"] },
  { icon: Mail, kind: "email", ext: ["eml"] },
  { icon: NotebookPen, kind: "notebooks", ext: ["ipynb"] },
  { icon: Captions, kind: "subtitles", ext: ["vtt", "srt"] },
];

function Formats() {
  return (
    <div className="mt-[18px] flex flex-wrap items-center gap-1.5">
      <span className="text-ink-faint mr-1.5 py-1 font-mono text-[11.5px]">read in the tab</span>
      {FORMATS.map((f) => (
        <span
          key={f.kind}
          className="border-border bg-surface text-code inline-flex items-center gap-1.5 rounded-[6px] border py-[3px] pl-1.5 pr-2 font-mono text-[11.5px]"
        >
          <f.icon className="text-ink-muted h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
          <span className="sr-only">{f.kind}: </span>
          {f.ext.join(" ")}
        </span>
      ))}
    </div>
  );
}
