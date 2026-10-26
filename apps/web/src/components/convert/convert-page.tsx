import type { CSSProperties } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleMinus,
  Download,
  BookOpen,
  FileText,
  Globe,
  Image as ImageIcon,
  Lock,
  Mail,
  Paperclip,
  Presentation,
  Table2,
  type LucideIcon,
} from "lucide-react";

import { AppFlow } from "~/components/app/app-flow";
import { DropZone, type DropZoneProps } from "~/components/app/drop-zone";
import { MarketingSection } from "~/components/app/marketing/section";
import { ProseLink } from "~/components/app/marketing";
import { Columns } from "~/components/benchmark-charts";
import { benchmarksForConvert } from "~/lib/benchmarks";
import whiteboardUrl from "../../../scripts/convert-samples/whiteboard.jpg";

import {
  CONVERT_FORMATS,
  SAMPLES,
  readsAndLoses,
  type ConvertFormat,
  type ConvertKey,
} from "./convert-formats";

/**
 * /convert/<format>-to-text: one template for every format with a page here.
 * The searcher wants the conversion done, so the drop zone leads and the
 * page then shows, on a real sample, exactly what comes back. The result card
 * is drawn from `convert-samples.json`, an engine run, never typed numbers.
 * Hosts the real app flow via AppFlow's renderLanding slot.
 */
export function ConvertPage({ format }: { format: ConvertFormat }) {
  return (
    <AppFlow
      renderLanding={(dropProps) => (
        <>
          <Hero format={format} dropProps={dropProps} />
          <Sample format={format} />
          <Reads format={format} />
          <ManyFiles format={format} />
          <OtherFormats format={format} />
          <Faq format={format} />
          <Closing format={format} dropProps={dropProps} />
        </>
      )}
    />
  );
}

const h2Class =
  "font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2.1rem)] font-bold leading-[1.1] tracking-[-0.02em]";
const leadClass = "text-ink-secondary mt-3 max-w-[62ch] text-pretty text-[16px] leading-relaxed";
const linkLine = "text-ink-secondary mt-7 text-[15px]";

function Hero({ format, dropProps }: { format: ConvertFormat; dropProps: DropZoneProps }) {
  return (
    <section className="mx-auto w-full max-w-[1040px] px-4 pb-16 pt-14 sm:px-6 md:pt-16">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_minmax(340px,400px)] lg:gap-14">
        <div className="min-w-0">
          <span className="text-go-fg rounded-pill inline-flex items-center gap-2 border border-[oklch(var(--primary)/0.25)] bg-[oklch(var(--primary)/0.08)] px-3 py-1 font-mono text-[11px]">
            <Lock className="text-primary h-3 w-3" strokeWidth={2.5} />
            Runs in your browser. Files not uploaded to us.
          </span>
          <h1 className="font-display text-ink mt-6 max-w-[15ch] text-balance text-[clamp(2.1rem,5vw,3.1rem)] font-bold leading-[1.04] tracking-[-0.028em]">
            {format.h1}
          </h1>
          <p className="text-ink-secondary mt-5 max-w-[46ch] text-pretty text-[17px] leading-relaxed">
            {format.para}
          </p>
          <ul className="mt-6 space-y-2.5">
            {[...format.trust, "No sign-up, no account"].map((t) => (
              <li key={t} className="text-ink-secondary flex items-center gap-2.5 text-[15px]">
                <Check className="text-primary h-4 w-4 shrink-0" strokeWidth={2.6} />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0">
          <DropZone {...dropProps} title={format.dropTitle} hint={format.dropHint} />
        </div>
      </div>
    </section>
  );
}

function Sample({ format }: { format: ConvertFormat }) {
  const s = SAMPLES.samples[format.key];
  const version = SAMPLES.version.split(".").slice(0, 2).join(".");
  return (
    <MarketingSection tone="alt" labelledBy="convert-sample">
      <div className="mx-auto max-w-[720px]">
        <h2 id="convert-sample" className={h2Class}>
          {format.sampleHeading}
        </h2>
        <p className={leadClass}>{format.sampleSummary}</p>
      </div>

      <div className="mx-auto mt-10 flex max-w-[880px] flex-wrap items-start gap-7">
        <div className="flex min-w-0 flex-[1_1_260px] justify-center">
          <SourceDrawing kind={format.key} />
        </div>

        {/* The result screen, cut down to what the sample needs. */}
        <div
          role="img"
          aria-label={`FileConcat's result for ${s.file}: ${s.tokens} tokens, ${s.characters} characters.`}
          className="bg-background border-border min-w-0 flex-[1.8_1_420px] rounded-lg border p-5"
        >
          <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
            <Check className="text-primary h-[17px] w-[17px] shrink-0" strokeWidth={2.8} />
            <span className="font-display text-ink text-[19px] font-semibold tracking-[-0.02em]">
              Your bundle is ready
            </span>
            <span className="text-ink-muted bg-surface border-border ml-auto rounded-md border px-2.5 py-1 font-mono text-[11.5px]">
              {s.files} file
            </span>
          </div>

          <div className="bg-surface border-border rounded-lg border">
            <div className="grid grid-cols-2 gap-x-[18px] gap-y-4 px-[18px] pb-3.5 pt-4 sm:grid-cols-4">
              <Figure value={s.tokens} label={"tokens \u00b7 estimated"} strong />
              <Figure value={s.files} label="file combined" />
              <Figure value={s.share} label={`of ${s.model} context`} />
              <Figure value={s.cost} label="to send once" />
            </div>
            <div className="border-hairline flex items-center gap-2.5 border-t px-[18px] py-3">
              <span className="text-ink-muted text-[12.5px]">Format</span>
              <span className="bg-surface-inset border-border flex rounded-lg border p-[3px] font-mono text-[11.5px]">
                <span className="bg-border text-ink rounded-md px-[11px] py-1.5">XML</span>
                <span className="text-ink-muted px-[11px] py-1.5">Markdown</span>
                <span className="text-ink-muted px-[11px] py-1.5">Plain</span>
              </span>
            </div>
            <div className="border-hairline flex flex-wrap gap-2.5 border-t px-[18px] pb-4 pt-3">
              <span className="bg-primary text-primary-foreground flex h-11 flex-[1_1_200px] items-center justify-center rounded-lg text-[15px] font-semibold">
                Copy
              </span>
              <span className="bg-surface-alt text-ink border-border flex h-11 flex-[0_1_150px] items-center justify-center gap-2 rounded-lg border text-[14.5px]">
                <Download className="h-[15px] w-[15px]" />
                Download
              </span>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
              <span className="text-ink text-[13.5px]">What your AI receives</span>
              <span className="text-ink-muted ml-auto font-mono text-[11px]">
                {`xml \u00b7 ${s.characters} characters`}
              </span>
            </div>
            <pre className="bg-surface-inset border-border text-code m-0 whitespace-pre-wrap break-words rounded-lg border px-4 py-3.5 font-mono text-[11.5px] leading-[1.65] [overflow-wrap:anywhere]">
              {s.excerpt}
            </pre>
          </div>

          <div className="bg-surface-alt border-border mt-3.5 overflow-hidden rounded-lg border">
            <div className="flex items-center gap-2.5 px-4 py-3">
              {format.key === "image" ? (
                <ChevronDown className="text-ink-muted h-[15px] w-[15px] shrink-0" />
              ) : (
                <ChevronRight className="text-ink-muted h-[15px] w-[15px] shrink-0" />
              )}
              <span className="text-ink-secondary text-[13.5px]">What happened to your files</span>
              <span className="text-ink-muted ml-auto font-mono text-[11px]">{s.ledger}</span>
            </div>
            {format.key === "image" && (
              <div className="border-hairline flex flex-wrap items-start gap-3 border-t px-4 py-3.5">
                <ImageIcon className="text-ink-muted mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-[1_1_220px]">
                  <div className="text-ink text-[14px] leading-normal">Read the image.</div>
                  <div className="text-ink-muted mt-1 text-[13px] leading-[1.55]">
                    Recognition guesses at characters, so the words in the bundle are close rather
                    than exact. Check them before you trust them.
                  </div>
                </div>
                <span className="text-ink-secondary border-border ml-7 shrink-0 rounded-lg border px-[11px] py-[7px] text-[12.5px]">
                  Check the reading
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="text-ink-muted mx-auto mt-[18px] max-w-[880px] font-mono text-[11.5px] leading-relaxed">
        Sample {format.sampleNoun}, read by FileConcat {version}.
      </p>
    </MarketingSection>
  );
}

function Figure({ value, label, strong }: { value: string; label: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <div
        className={`font-display text-[26px] font-semibold leading-none tracking-[-0.03em] tabular-nums ${strong ? "text-ink" : "text-ink-secondary"}`}
      >
        {value}
      </div>
      <div className="text-ink-muted mt-2 font-mono text-[11px] leading-snug">{label}</div>
    </div>
  );
}

/* The source drawings: each one is the sample file in scripts/convert-samples/,
 * drawn so the reader can set it beside the text that came out of it. Paper
 * colours are part of the drawing, not the theme. */

const paper: CSSProperties = { background: "#ebe4d6", color: "#2b251c", fontFamily: "Georgia, 'Times New Roman', serif" };
const sheet: CSSProperties = { background: "#f3efe6", color: "#2b251c" };
const bar = (h: string, accent?: boolean): CSSProperties => ({
  flex: 1,
  height: h,
  background: accent ? "#4f7a5c" : "#9a8d74",
});
const axes: CSSProperties = { borderBottom: "1px solid #9c907a", borderLeft: "1px solid #9c907a" };

function SourceDrawing({ kind }: { kind: ConvertKey }) {
  if (kind === "pdf") {
    return (
      <div aria-hidden className="flex w-full max-w-[290px] flex-col gap-3">
        <div className="aspect-[8.5/11] rounded-[2px] px-[30px] py-8" style={paper}>
          <div className="text-[19px] font-bold">Q3 report</div>
          <div className="mt-2.5 max-w-[170px] text-[11px] leading-[1.6]">
            Revenue was ahead of plan in both regions. Margins held despite freight costs.
          </div>
          <div className="mt-[26px] flex h-24 items-end gap-3 px-2" style={axes}>
            <span style={bar("42%")} />
            <span style={bar("58%")} />
            <span style={bar("51%")} />
            <span style={bar("86%", true)} />
          </div>
        </div>
        <div
          className="h-32 overflow-hidden rounded-t-[2px] px-[30px] pt-8"
          style={{ ...paper, maskImage: "linear-gradient(#000 70%, transparent)" }}
        >
          <div className="text-[15px] font-bold">Outlook</div>
          <div className="mt-2 max-w-[190px] text-[11px] leading-[1.6]">
            Guidance is unchanged for the full year. Hiring resumes in the third quarter.
          </div>
        </div>
      </div>
    );
  }

  if (kind === "docx") {
    const cell = { borderColor: "#9c907a" };
    return (
      <div
        aria-hidden
        className="flex aspect-[8.5/11] w-full max-w-[290px] flex-col rounded-[2px] px-[30px] pb-6 pt-8"
        style={paper}
      >
        <div className="text-[19px] font-bold">Offer letter</div>
        <div className="mt-2.5 text-[11px] leading-[1.6]">
          Dear Sam, we are pleased to offer you the role below.<sup className="text-[8px]">1</sup>
        </div>
        <div className="mt-3.5 grid grid-cols-[auto_1fr] border text-[10.5px]" style={cell}>
          <span className="border-b border-r px-[9px] py-1.5 font-bold" style={cell}>Role</span>
          <span className="border-b px-[9px] py-1.5" style={cell}>Analyst</span>
          <span className="border-r px-[9px] py-1.5 font-bold" style={cell}>Start</span>
          <span className="px-[9px] py-1.5">3 November</span>
        </div>
        <Picture className="mt-4 h-[74px]" />
        <div className="mt-auto pt-2.5">
          <div className="mb-[5px] w-11 border-t" style={cell} />
          <div className="text-[9px] leading-[1.4]">
            <sup className="text-[7px]">1</sup> Subject to references.
          </div>
        </div>
      </div>
    );
  }

  if (kind === "excel") {
    return (
      <SheetDrawing
        formula="=SUM(C2:C3)"
        head={["Item", "Budget", "Actual"]}
        rows={[
          ["Travel", "4,000", "3,650"],
          ["Software", "2,500", "2,710"],
          ["Total", "6,500", "6,360"],
        ]}
        tabs={["Q3", "Q4"]}
      />
    );
  }

  if (kind === "ods") {
    return (
      <SheetDrawing
        formula="=SUM(C2:C3)"
        head={["Item", "Count", "Value"]}
        rows={[
          ["Rope, 50 m", "40", "320.00"],
          ["Fenders", "12", "540.00"],
          ["Total", "52", "860.00"],
        ]}
        tabs={["October", "Notes"]}
      />
    );
  }

  if (kind === "pptx") {
    return (
      <SlidesDrawing
        slides={[
          { title: "Project kickoff", sub: "Design and engineering" },
          { title: "Budget by team", chart: ["48%", "80%", "34%", "62%"] },
          { title: "Next steps", lines: ["Agree scope", "Book review"] },
        ]}
      />
    );
  }

  if (kind === "odp") {
    return (
      <SlidesDrawing
        slides={[
          { title: "Welcome week", sub: "Your first five days at Harbor Supplies" },
          { title: "Day one", lines: ["Collect your badge at reception", "Laptop setup with IT at 10:00", "Lunch with your team"] },
          { title: "Who to ask", lines: ["Pay and leave: Priya Shah", "Orders and stock: Dana Ruiz"] },
        ]}
      />
    );
  }

  if (kind === "rtf") {
    return (
      <div aria-hidden className="flex aspect-[8.5/11] w-full max-w-[290px] flex-col rounded-[2px] px-[30px] pb-6 pt-5" style={paper}>
        <div className="text-right text-[9px]" style={{ color: "#6b6150" }}>
          Harbor Supplies, board minutes
        </div>
        <div className="mt-4 text-[16px] font-bold leading-[1.25]">Board minutes, 9 October 2026</div>
        <div className="mt-2 text-[11px] leading-[1.6]">Present: Dana Ruiz, Sam Lee, Priya Shah.</div>
        <div className="mt-3.5 text-[13px] font-bold">Decisions</div>
        <ol className="mt-1.5 space-y-1 text-[11px] leading-[1.5]">
          <li>1. The 2027 price list is approved as drafted.</li>
          <li>2. The Thursday delivery trial runs until the end of January.</li>
          <li>3. Priya will report on the Monday backlog at the next meeting.</li>
        </ol>
        <div className="mt-auto text-[11px]">Next meeting: 13 November, 10:00.</div>
      </div>
    );
  }

  if (kind === "odt") {
    return (
      <div aria-hidden className="flex aspect-[8.5/11] w-full max-w-[290px] flex-col rounded-[2px] px-[30px] pb-5 pt-8" style={paper}>
        <div className="text-[19px] font-bold">Leave policy</div>
        <div className="mt-2.5 text-[11px] leading-[1.6]">Everyone gets 25 days of paid leave a year, plus public holidays.</div>
        <ol className="mt-3 space-y-1.5 text-[11px] leading-[1.5]">
          <li>1. Ask your manager at least two weeks ahead.</li>
          <li>2. Up to five unused days carry over to next year.</li>
          <li>3. Sick leave is separate and does not count against the 25.</li>
        </ol>
        <Picture className="mt-4 h-[60px]" />
        <div className="mt-auto border-t pt-1.5 text-[9px]" style={{ borderColor: "#9c907a" }}>
          Staff handbook, section 4
        </div>
      </div>
    );
  }

  if (kind === "email") {
    const field = (name: string, value: string) => (
      <div className="flex gap-2 text-[10.5px] leading-[1.7]">
        <span className="w-[44px] shrink-0" style={{ color: "#6b6150" }}>
          {name}
        </span>
        <span className="min-w-0 truncate">{value}</span>
      </div>
    );
    return (
      <div aria-hidden className="w-full max-w-[330px] overflow-hidden rounded-[3px]" style={sheet}>
        <div className="px-4 pb-3 pt-3.5" style={{ borderBottom: "1px solid #d6cdbb" }}>
          <div className="mb-2 text-[14px] font-semibold">Renewal terms for 2027</div>
          {field("From", "Dana Ruiz")}
          {field("To", "Sam Lee")}
          {field("Cc", "Orders")}
          {field("Date", "14 Oct 2026, 09:12")}
        </div>
        <div className="px-4 py-3.5 text-[11px] leading-[1.6]" style={{ fontFamily: paper.fontFamily }}>
          <p>Hi Sam,</p>
          <p className="mt-2">
            The renewal keeps this year&apos;s price for 2027. Two things change: deliveries move to Thursdays,
            and the notice period drops to 30 days.
          </p>
          <p className="mt-2">The full terms are attached.</p>
          <p className="mt-2">Dana</p>
        </div>
        <div className="px-4 pb-4">
          <span className="inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1.5 text-[10.5px]" style={{ borderColor: "#c5baa5", background: "#ebe4d6" }}>
            <Paperclip className="h-3 w-3" strokeWidth={2} />
            terms-2027.pdf
          </span>
        </div>
      </div>
    );
  }

  if (kind === "html") {
    const muted = { background: "#e4dccb", color: "#6b6150" };
    return (
      <div aria-hidden className="w-full max-w-[330px] overflow-hidden rounded-[3px] text-[10px]" style={sheet}>
        <div className="flex items-center gap-2 px-2.5 py-2" style={{ borderBottom: "1px solid #d6cdbb" }}>
          <span className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-[7px] w-[7px] rounded-full" style={{ background: "#c5baa5" }} />
            ))}
          </span>
          <span className="min-w-0 flex-1 truncate rounded-[3px] px-2 py-1 font-mono text-[9px]" style={muted}>
            blog.harbor-supplies.example/four-days
          </span>
        </div>
        <div className="px-3 py-1.5" style={muted}>
          We use cookies to improve this site. <span className="underline">Accept</span>
        </div>
        <div className="flex gap-3 px-3 py-1.5" style={{ color: "#6b6150", borderBottom: "1px solid #ddd4c2" }}>
          <span className="font-semibold">Harbor Supplies blog</span>
          <span>Home</span>
          <span>Products</span>
          <span>Careers</span>
        </div>
        <div className="flex gap-3 px-3 py-3">
          <div className="min-w-0 flex-1" style={{ fontFamily: paper.fontFamily }}>
            <div className="text-[13px] font-bold leading-[1.25]">What a four-day week did to our support queue</div>
            <div className="mt-1 text-[8.5px]" style={{ color: "#6b6150" }}>
              By Dana Ruiz, 2 October 2026
            </div>
            <p className="mt-2 leading-[1.55]">
              In March we moved the support team to a four-day week. Nobody&apos;s hours went down.
            </p>
            <p className="mt-1.5 leading-[1.55]">Three months on, the first reply time went from 4 hours 10 minutes to 3 hours 40 minutes.</p>
          </div>
          <div className="w-[84px] shrink-0 self-start rounded-[3px] px-2 py-2" style={muted}>
            <div className="font-semibold">Spring sale</div>
            <div className="mt-1 leading-[1.4]">20% off rope and fenders this week only.</div>
          </div>
        </div>
        <div className="px-3 py-1.5 text-[8.5px]" style={{ ...muted, borderTop: "1px solid #d6cdbb" }}>
          Copyright 2026 Harbor Supplies. Privacy
        </div>
      </div>
    );
  }

  if (kind === "epub") {
    const page = "min-w-0 flex-1 px-3.5 py-4 text-[9.5px] leading-[1.6]";
    return (
      <div aria-hidden className="flex w-full max-w-[340px] overflow-hidden rounded-[3px]" style={paper}>
        <div className={page} style={{ borderRight: "1px solid #c5baa5" }}>
          <div className="text-[12.5px] font-bold">1. Getting there</div>
          <p className="mt-2">
            The harbour sits at the end of the coast road, an hour from the city by the 42 bus. The last bus back
            leaves at ten past eleven.
          </p>
          <p className="mt-2">If you drive, park on the hill above the slipway.</p>
        </div>
        <div className={page}>
          <div className="text-[12.5px] font-bold">2. Where to eat</div>
          <p className="mt-2">The fish market opens at six and sells breakfast from a hatch at the back.</p>
          <Picture className="mt-2.5 h-[52px]" />
          <p className="mt-2.5">For dinner, arrive before seven.</p>
        </div>
      </div>
    );
  }

  // The image page shows the sample itself: the reading is only honest beside the photo it came from.
  return (
    <img
      src={whiteboardUrl}
      alt="A whiteboard photo: Launch plan, fix signup bug, new pricing page, ship Friday, and a box between two arrows."
      width={800}
      height={600}
      loading="lazy"
      className="h-auto w-full max-w-[330px] rounded-[3px]"
    />
  );
}

/** A picture in a drawn file: hatched, because the text never describes it. */
function Picture({ className }: { className: string }) {
  return (
    <div
      className={`flex items-center justify-center border ${className}`}
      style={{
        borderColor: "#c5baa5",
        background: "repeating-linear-gradient(135deg,#ddd4c2 0 6px,#e6dece 6px 12px)",
      }}
    >
      <ImageIcon className="h-[22px] w-[22px]" style={{ color: "#8a7e68" }} strokeWidth={1.8} />
    </div>
  );
}

/** A spreadsheet with its formula bar on the total and its sheet tabs, the first one open. */
function SheetDrawing({ formula, head, rows, tabs }: { formula: string; head: string[]; rows: string[][]; tabs: string[] }) {
  const line = "1px solid #ddd4c2";
  return (
    <div aria-hidden className="w-full max-w-[330px] overflow-hidden rounded-[3px] text-[11.5px]" style={sheet}>
      <div className="px-2.5 py-2 font-mono text-[10.5px]" style={{ color: "#5c5446", borderBottom: "1px solid #d6cdbb" }}>
        {formula}
      </div>
      <div className="grid grid-cols-[1.3fr_1fr_1fr]">
        {head.map((h, i) => (
          <span
            key={h}
            className={`px-[9px] py-[7px] font-semibold ${i ? "text-right" : ""}`}
            style={{ background: "#e4dccb", borderBottom: "1px solid #d6cdbb", borderRight: i < 2 ? "1px solid #d6cdbb" : undefined }}
          >
            {h}
          </span>
        ))}
        {rows.flatMap((row, r) =>
          row.map((v, i) => {
            const last = r === rows.length - 1;
            const selected = last && i === 2;
            return (
              <span
                key={`${r}-${i}`}
                className={`px-[9px] py-[7px] ${i ? "text-right" : ""} ${last ? "font-semibold" : ""}`}
                style={
                  selected
                    ? { border: "2px solid #3f7a52", padding: "6px 8px" }
                    : { borderBottom: line, borderRight: i < 2 ? line : undefined }
                }
              >
                {v}
              </span>
            );
          }),
        )}
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="h-7" style={{ borderRight: i % 3 < 2 ? line : undefined, borderBottom: i < 3 ? line : undefined }} />
        ))}
      </div>
      <div className="flex gap-0.5 px-2 text-[11px]" style={{ background: "#e4dccb", borderTop: "1px solid #d6cdbb" }}>
        {tabs.map((t, i) => (
          <span
            key={t}
            className={`px-3.5 py-1.5 ${i ? "" : "font-semibold"}`}
            style={i ? { color: "#5c5446" } : { background: "#f3efe6", borderBottom: "2px solid #3f7a52" }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

type DrawnSlide = { title: string; sub?: string; lines?: string[]; chart?: string[] };

/** A deck as three slides stacked: a title slide, then content slides with a list or a chart. */
function SlidesDrawing({ slides }: { slides: DrawnSlide[] }) {
  return (
    <div aria-hidden className="flex w-full max-w-[290px] flex-col gap-2.5" style={{ color: "#2b251c" }}>
      {slides.map((slide) =>
        slide.sub ? (
          <div key={slide.title} className="flex aspect-video flex-col justify-center rounded-[3px] px-[18px] py-4" style={sheet}>
            <div className="font-display text-[17px] font-semibold">{slide.title}</div>
            <div className="mt-1 text-[10.5px]" style={{ color: "#5c5446" }}>
              {slide.sub}
            </div>
          </div>
        ) : slide.chart ? (
          <div key={slide.title} className="flex aspect-video flex-col rounded-[3px] px-4 py-3" style={sheet}>
            <div className="font-display text-[12.5px] font-semibold">{slide.title}</div>
            <div className="mt-2 flex flex-1 items-end gap-2.5 px-1.5" style={axes}>
              {slide.chart.map((h, i) => (
                <span key={i} style={bar(h, i === 1)} />
              ))}
            </div>
          </div>
        ) : (
          <div key={slide.title} className="aspect-video rounded-[3px] px-[18px] py-3.5" style={sheet}>
            <div className="font-display text-[12.5px] font-semibold">{slide.title}</div>
            <div className="mt-1.5 text-[10.5px] leading-[1.7]">
              {slide.lines?.map((l) => (
                <div key={l}>- {l}</div>
              ))}
            </div>
          </div>
        ),
      )}
    </div>
  );
}

function Reads({ format }: { format: ConvertFormat }) {
  const { gives, loses } = readsAndLoses(format);
  return (
    <MarketingSection labelledBy="convert-reads">
      <div className="mx-auto max-w-[720px]">
        <h2 id="convert-reads" className={h2Class}>
          What comes through, and what does not
        </h2>
        <div className="mt-9 grid gap-x-12 gap-y-9 sm:grid-cols-2">
          <ReadList icon={Check} title="In the text" rows={gives} tone="text-go-fg" />
          <ReadList icon={CircleMinus} title="Not read" rows={loses} tone="text-ink-secondary" />
        </div>
        {benchmarksForConvert(format.slug).map((b) => (
          <div key={b.id} className="border-border mt-10 rounded-lg border p-5">
            <Columns b={b} />
            <p className="text-ink-secondary mt-4 text-[15px]">
              {/* A plain anchor: the router's `to` takes no #fragment. */}
              <a
                href={`/benchmarks#${b.id}`}
                className="hover:text-ink-secondary underline decoration-[oklch(var(--border-strong))] underline-offset-2 transition-colors duration-150"
              >
                Every FileConcat benchmark
              </a>
            </p>
          </div>
        ))}
        <p className={linkLine}>
          <ProseLink to="/blog/what-gets-lost-converting-documents-to-text">
            What gets lost converting documents to text
          </ProseLink>
        </p>
      </div>
    </MarketingSection>
  );
}

function ReadList({ icon: Icon, title, rows, tone }: { icon: LucideIcon; title: string; rows: string[]; tone: string }) {
  return (
    <div className="min-w-0">
      <h3 className={`mb-1.5 flex items-center gap-2 text-[15px] font-semibold ${tone}`}>
        <Icon className="h-4 w-4" strokeWidth={2.4} />
        {title}
      </h3>
      <ul>
        {rows.map((row) => (
          <li key={row} className="border-border text-ink-secondary text-pretty border-t py-3 text-[15.5px] leading-relaxed">
            {row}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ManyFiles({ format }: { format: ConvertFormat }) {
  return (
    <MarketingSection tone="alt" labelledBy="convert-many">
      <div className="mx-auto max-w-[720px]">
        <h2 id="convert-many" className={h2Class}>
          {format.manyHeading}
        </h2>
        <p className={leadClass}>{format.manyPara}</p>
        <div className="mt-8 flex flex-wrap items-center gap-x-10 gap-y-6">
          <pre className="bg-surface-inset border-border text-code m-0 min-w-0 flex-[1_1_280px] overflow-auto rounded-lg border px-[18px] py-4 font-mono text-[12.5px] leading-[1.75]">
            {format.listing}
          </pre>
          <div className="flex items-center gap-5">
            <ArrowRight className="text-ink-faint h-5 w-5 shrink-0" />
            <div>
              <div className="font-display text-ink text-[40px] font-semibold leading-none tracking-[-0.03em]">1 file</div>
              <div className="text-ink-muted mt-2 font-mono text-[11px]">to attach</div>
            </div>
          </div>
        </div>
        <p className={linkLine}>
          <ProseLink to="/how-to/chatgpt-file-upload-limit">How many files ChatGPT takes</ProseLink>
        </p>
      </div>
    </MarketingSection>
  );
}

const ICONS: Record<ConvertKey, LucideIcon> = {
  pdf: FileText,
  docx: FileText,
  excel: Table2,
  pptx: Presentation,
  image: ImageIcon,
  email: Mail,
  html: Globe,
  epub: BookOpen,
  rtf: FileText,
  odt: FileText,
  ods: Table2,
  odp: Presentation,
};

function OtherFormats({ format }: { format: ConvertFormat }) {
  return (
    <MarketingSection labelledBy="convert-more">
      <div className="mx-auto max-w-[720px]">
        <h2 id="convert-more" className={h2Class}>
          {format.moreHeading}
        </h2>
        <ul className="border-border mt-7 border-b">
          {CONVERT_FORMATS.filter((f) => f.key !== format.key).map((f) => {
            const Icon = ICONS[f.key];
            return (
              <li key={f.slug} className="border-border flex flex-wrap items-baseline gap-x-[18px] gap-y-1 border-t py-4">
                <span className="flex flex-[0_0_200px] items-center gap-3 self-center">
                  <Icon className="text-ink-secondary h-[18px] w-[18px] shrink-0" />
                  <span className="text-ink text-[16px] font-semibold">
                    <ProseLink to={`/convert/${f.slug}`}>{f.label}</ProseLink>
                  </span>
                </span>
                <span className="text-ink-secondary flex-[1_1_220px] text-[15px] leading-normal">{f.blurb}</span>
              </li>
            );
          })}
        </ul>
        <p className="text-ink-muted mt-[22px] flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5 text-[15px]">
          <span>Also Kindle books, notebooks, subtitles and ZIP archives.</span>
          <span className="text-ink-secondary">
            <ProseLink to="/docs/formats">Every format it reads</ProseLink>
          </span>
        </p>
      </div>
    </MarketingSection>
  );
}

function Faq({ format }: { format: ConvertFormat }) {
  return (
    <MarketingSection tone="alt" labelledBy="convert-faq">
      <div className="mx-auto max-w-[720px]">
        <h2 id="convert-faq" className="sr-only">
          Common questions
        </h2>
        {format.faq.map((item) => (
          <div key={item.q} className="border-border border-t py-6">
            <h3 className="text-ink mb-2 text-[17px] font-semibold leading-snug">{item.q}</h3>
            <p className="text-ink-secondary text-pretty text-[15.5px] leading-relaxed">{item.a}</p>
          </div>
        ))}
      </div>
    </MarketingSection>
  );
}

function Closing({ format, dropProps }: { format: ConvertFormat; dropProps: DropZoneProps }) {
  const reading = [
    ...(format.more ? [format.more] : []),
    { to: "/docs/formats", label: "Every format it reads" },
    { to: "/blog/what-gets-lost-converting-documents-to-text", label: "What gets lost converting documents to text" },
  ];
  return (
    <MarketingSection labelledBy="convert-close">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_minmax(340px,400px)] lg:gap-14">
        <div className="min-w-0">
          <h2 id="convert-close" className={`${h2Class} max-w-[18ch]`}>
            {format.closeHeading}
          </h2>
          <ul className="text-ink-secondary mt-7 flex flex-col items-start gap-3 text-[15px]">
            {reading.map((l) => (
              <li key={l.to}>
                <ProseLink to={l.to}>{l.label}</ProseLink>
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0">
          <DropZone {...dropProps} title={format.dropTitle} hint={format.dropHint} />
        </div>
      </div>
    </MarketingSection>
  );
}
