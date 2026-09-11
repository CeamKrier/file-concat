import { Check, X } from "lucide-react";

import { Bars } from "~/components/blog/bars";
import { cn } from "~/lib/utils";
import {
  BandGrid,
  BandIntro,
  BandLink,
  BandLinks,
  FigureTitle,
  MarketingSection,
  MonoNote,
} from "./section";

const STUDY = "/blog/repomix-vs-gitingest-vs-code2prompt";

/**
 * Band 5: the tool comparison, what a token bought and what it cost, side by
 * side in the same drawing so the eye reads across one row per tool. Below
 * them the one thing only this tool did (the four documents' text) and, in
 * the quiet cell beside it, the sized cost of the defaults. Every figure is
 * a line of `analyze-tools` over the 2026-09-10 run; nothing here implies a
 * model answers better, because that was not measured.
 */
export function ComparisonSection() {
  return (
    <MarketingSection tone="alt" id="comparison" labelledBy="measured-against">
      <BandIntro
        id="measured-against"
        title="Measured against the tools you would compare it with."
      >
        Four tools over the same 60 repositories, each at its own defaults, one tokenizer.
      </BandIntro>

      <BandGrid className="mt-10">
        <Bars
          title="Signal density, source tokens over bundle tokens"
          unit="percent"
          rows={DENSITY}
          note="median of the per-repository share"
        >
          the densest bundle on 35 of 60; gitingest on 16, code2prompt 5, Repomix 4
        </Bars>
        <Bars
          title="Median bundle, tokens"
          rows={COST}
          markMin
          note="fewer tokens only helps if the dropped file did not matter"
        >
          the cheapest bundle on 31 of 60; gitingest on 20, code2prompt 5, Repomix 4
        </Bars>
      </BandGrid>

      <BandGrid className="mt-12">
        <DocumentStrip />
        <div className="min-w-0">
          <p className="text-ink-secondary text-[15px] leading-[1.55]">
            The most aggressive filter of the four. Of a checkout&apos;s test tokens the CLI bundle
            carries a median 15.6% where the other three carry 100%, and nothing under a dot
            directory. In the browser a held-back file sits in the tree and a tick puts it back.
          </p>
          <MonoNote className="mt-3">
            tests are 47.3% of what Repomix carries and we do not, vendored code 42.7%; hidden
            source is 0.1% of a checkout's source at p90
          </MonoNote>
        </div>
      </BandGrid>

      <BandLinks className="border-border-strong mt-12 border-t pt-5">
        <BandLink to={STUDY}>
          Repomix vs gitingest vs code2prompt, 60 repositories measured
        </BandLink>
      </BandLinks>
    </MarketingSection>
  );
}

/** Median share of the bundle's tokens that is source code, per tool, over the 60 repositories. */
const DENSITY = [
  { label: "FileConcat", value: 68.0 },
  { label: "Repomix", value: 49.6 },
  { label: "gitingest", value: 51.1 },
  { label: "code2prompt", value: 38.8 },
];

/** Median bundle over the 60 repositories, each tool at its own defaults, in the same row order. */
const COST = [
  { label: "FileConcat", value: 235_672 },
  { label: "Repomix", value: 239_861 },
  { label: "gitingest", value: 258_790 },
  { label: "code2prompt", value: 432_539 },
];

/**
 * One directory holding a source file and one document in each of four
 * formats, each carrying a sentence found nowhere else, through four tools.
 * "listed" is a per-file marker with nothing under it.
 */
const OTHERS = [
  { tool: "Repomix", verdict: "the source file only" },
  { tool: "gitingest", verdict: "three named, none of the text" },
  { tool: "code2prompt", verdict: "the source file only" },
];

function DocumentStrip() {
  return (
    <div className="min-w-0">
      <FigureTitle className="mb-2.5">
        One source file, then a pdf, a docx, an xlsx and a pptx
      </FigureTitle>
      <div className="border-border-strong grid border-t">
        <div className="border-border-strong grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3.5 border-b px-1 py-[18px]">
          <Check className="text-primary h-5 w-5" strokeWidth={2.6} />
          <span className="text-ink font-mono text-[16px]">FileConcat</span>
          <span className="text-primary text-right text-[14.5px]">the text of all four</span>
        </div>
        {OTHERS.map((o, i) => (
          <div
            key={o.tool}
            className={cn(
              "grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3.5 border-b px-1 py-3",
              i === OTHERS.length - 1 ? "border-border-strong" : "border-border",
            )}
          >
            <X className="text-ink-faint h-5 w-5" strokeWidth={2.2} />
            <span className="text-ink-secondary font-mono text-[14px]">{o.tool}</span>
            <span className="text-ink-faint text-right text-[13.5px]">{o.verdict}</span>
          </div>
        ))}
      </div>
      <MonoNote className="mt-3">
        in the sample, 7 of 60 checkouts hold a document; only this bundle carries its text
      </MonoNote>
    </div>
  );
}
