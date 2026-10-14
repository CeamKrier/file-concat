import type { CSSProperties } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleMinus,
  Download,
  FileText,
  Image as ImageIcon,
  Lock,
  Presentation,
  Table2,
  type LucideIcon,
} from "lucide-react";

import { AppFlow } from "~/components/app/app-flow";
import { DropZone, type DropZoneProps } from "~/components/app/drop-zone";
import { MarketingSection } from "~/components/app/marketing/section";
import { ProseLink } from "~/components/app/marketing";
import whiteboardUrl from "../../../scripts/convert-samples/whiteboard.jpg";

import {
  CONVERT_FORMATS,
  SAMPLES,
  readsAndLoses,
  type ConvertFormat,
  type ConvertKey,
} from "./convert-formats";

/**
 * /convert/<format>-to-text: one template for the five formats people drop
 * most. The searcher wants the conversion done, so the drop zone leads and the
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
              Your document is ready
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
        <div
          className="mt-4 flex h-[74px] items-center justify-center border"
          style={{
            borderColor: "#c5baa5",
            background: "repeating-linear-gradient(135deg,#ddd4c2 0 6px,#e6dece 6px 12px)",
          }}
        >
          <ImageIcon className="h-[22px] w-[22px]" style={{ color: "#8a7e68" }} strokeWidth={1.8} />
        </div>
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
    const rows = [
      ["Travel", "4,000", "3,650"],
      ["Software", "2,500", "2,710"],
      ["Total", "6,500", "6,360"],
    ];
    const line = "1px solid #ddd4c2";
    return (
      <div aria-hidden className="w-full max-w-[330px] overflow-hidden rounded-[3px] text-[11.5px]" style={sheet}>
        <div className="px-2.5 py-2 font-mono text-[10.5px]" style={{ color: "#5c5446", borderBottom: "1px solid #d6cdbb" }}>
          =SUM(C2:C3)
        </div>
        <div className="grid grid-cols-[1.3fr_1fr_1fr]">
          {["Item", "Budget", "Actual"].map((h, i) => (
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
              const selected = r === 2 && i === 2;
              return (
                <span
                  key={`${r}-${i}`}
                  className={`px-[9px] py-[7px] ${i ? "text-right" : ""} ${r === 2 ? "font-semibold" : ""}`}
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
          <span className="px-3.5 py-1.5 font-semibold" style={{ background: "#f3efe6", borderBottom: "2px solid #3f7a52" }}>
            Q3
          </span>
          <span className="px-3.5 py-1.5" style={{ color: "#5c5446" }}>
            Q4
          </span>
        </div>
      </div>
    );
  }

  if (kind === "pptx") {
    return (
      <div aria-hidden className="flex w-full max-w-[290px] flex-col gap-2.5" style={{ color: "#2b251c" }}>
        <div className="flex aspect-video flex-col justify-center rounded-[3px] px-[18px] py-4" style={sheet}>
          <div className="font-display text-[17px] font-semibold">Project kickoff</div>
          <div className="mt-1 text-[10.5px]" style={{ color: "#5c5446" }}>
            Design and engineering
          </div>
        </div>
        <div className="flex aspect-video flex-col rounded-[3px] px-4 py-3" style={sheet}>
          <div className="font-display text-[12.5px] font-semibold">Budget by team</div>
          <div className="mt-2 flex flex-1 items-end gap-2.5 px-1.5" style={axes}>
            <span style={bar("48%")} />
            <span style={bar("80%", true)} />
            <span style={bar("34%")} />
            <span style={bar("62%")} />
          </div>
        </div>
        <div className="aspect-video rounded-[3px] px-[18px] py-3.5" style={sheet}>
          <div className="font-display text-[12.5px] font-semibold">Next steps</div>
          <div className="mt-1.5 text-[10.5px] leading-[1.7]">
            - Agree scope
            <br />- Book review
          </div>
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
          <span>Also EPUB, email, notebooks, subtitles and ZIP archives.</span>
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
    ...(format.post ? [{ to: `/blog/${format.post.slug}`, label: format.post.label }] : []),
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
