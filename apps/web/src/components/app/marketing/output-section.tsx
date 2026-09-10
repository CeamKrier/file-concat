import { ArrowDown } from "lucide-react";
import { formatCost } from "@fileconcat/core";

import { defaultCatalogueModel } from "~/lib/default-model";
import { MockWindow } from "./mock-window";
import {
  BandGrid,
  BandIntro,
  BandLink,
  BandLinks,
  FigureTitle,
  MarketingSection,
} from "./section";
import { FitBars } from "./fit-bars";

/** Band 2: what you get, and the count on it. */
export function OutputSection() {
  return (
    <MarketingSection labelledBy="what-you-get">
      <BandIntro id="what-you-get" title="One file, and an honest count of it.">
        The tree first, then every file in a tagged block. The count is what the model you
        picked will charge for.
      </BandIntro>

      <BandGrid className="mt-10">
        <BeforeAfter />
        <ExportCard />
      </BandGrid>

      <div className="border-border-strong mt-12 border-t pt-6">
        <FigureTitle className="text-[19px]">Will it fit?</FigureTitle>
        <FitBars className="mt-5" />
      </div>

      <BandLinks className="mt-7">
        <BandLink to="/docs/token-estimation">How the count is made</BandLink>
        <BandLink to="/docs/context-window-costs" tone="muted">
          What it costs to fill a window
        </BandLink>
      </BandLinks>
    </MarketingSection>
  );
}

const PRE = "whitespace-pre-wrap px-4 py-3.5 font-mono text-[12px] leading-[1.6] [overflow-wrap:anywhere]";

/**
 * A plain `cat` of a small folder against the same folder as one bundle. The
 * files are a shape example and the point is the shape: no paths and files
 * running into each other on one side, the tree and a tagged block per file on
 * the other.
 */
function BeforeAfter() {
  return (
    <div className="grid min-w-0 gap-3">
      <MockWindow label="before, a plain dump">
        <pre className={`${PRE} text-ink-muted`}>
          {`$ cat notes/* letter.txt ledger.csv
Kickoff, 3 March. Scope agreed: FY25 ledger, two entities.Dear Ms Adair, further to our call on Tuesday, please find the engagement terms below.date,account,debit,credit
2025-01-04,1200,4,200.00,`}
        </pre>
      </MockWindow>
      <div className="text-ink-faint flex justify-center" aria-hidden="true">
        <ArrowDown className="h-4 w-4" strokeWidth={2} />
      </div>
      <MockWindow label="after, one file">
        <pre className={`${PRE} text-code`}>
          {`<documents project="q3-review">
  <directory_structure>
    letter.txt
    ledger.csv
    notes/kickoff.md
  </directory_structure>
  <file path="notes/kickoff.md" lang="md">
    Kickoff, 3 March. Scope agreed:
    FY25 ledger, two entities.
  </file>
  <file path="ledger.csv" lang="csv">
    date,account,debit,credit
    2025-01-04,1200,4,200.00,
  </file>
</documents>`}
        </pre>
      </MockWindow>
    </div>
  );
}

/** The sample bundle's size. The tokens and files are a shape example. */
const SAMPLE_TOKENS = 48_212;

/**
 * The three numbers the result screen reads out, each with where it comes
 * from. The tokens and files are a shape example; the model and its price are
 * the tool's own default from the catalogue this build shipped, so the quote
 * moves with the catalogue rather than going stale in a string. It draws none
 * of that screen's controls, because a Copy button that does nothing is a dead
 * click at the one moment the band is about.
 */
function ExportCard() {
  const model = defaultCatalogueModel();
  const readouts = [
    {
      value: SAMPLE_TOKENS.toLocaleString("en-US"),
      unit: "tokens",
      note: "the file as you will paste it, tree and tags counted too",
    },
    { value: "37", unit: "files", note: "each in its own tagged block, listed in the tree first" },
  ];
  if (model) {
    readouts.push({
      value: formatCost((SAMPLE_TOKENS / 1_000_000) * model.inputCost),
      unit: "to send once",
      note: `at ${model.name}'s input price, from the live catalogue`,
    });
  }

  return (
    <div className="border-border-strong bg-surface rounded-chip min-w-0 border px-[18px] py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <FigureTitle>What the result screen reads out</FigureTitle>
        <span className="text-ink-muted font-mono text-[11.5px]">q3-review.xml</span>
      </div>
      <div className="mt-2 grid">
        {readouts.map((r) => (
          <div key={r.unit} className="border-border border-t py-3.5">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-ink text-[28px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
                {r.value}
              </span>
              <span className="text-ink-secondary text-[15px]">{r.unit}</span>
            </div>
            <div className="text-ink-muted mt-1.5 font-mono text-[11.5px] leading-[1.5]">{r.note}</div>
          </div>
        ))}
      </div>
      <p className="border-border text-ink-secondary border-t pt-3.5 text-[13.5px] leading-[1.5]">
        Copy it, or download it as XML, Markdown or plain text.
      </p>
    </div>
  );
}
