import { ArrowUp, Check, MonitorSmartphone } from "lucide-react";

import { AppFlow } from "~/components/app/app-flow";
import type { DropZoneProps } from "~/components/app/drop-zone";
import { EntrySurface } from "~/components/app/entry-surface";
import type { ImportState } from "~/components/app/import-panel";
import { FurtherReading, ProseLink } from "~/components/app/marketing";
import { ComparisonSection } from "~/components/app/marketing/comparison-section";
import { MarketingSection } from "~/components/app/marketing/section";

import { GITINGEST_ALTERNATIVE_FAQ } from "./gitingest-alternative-faq";

/**
 * /how-to/gitingest-repomix-alternative: for the searcher weighing gitingest or
 * Repomix, usually over where their code goes. Every sentence about the two
 * tools is quoted from their own pages, read on 2026-09-24 and pinned in
 * src/data/vendor-caps.json. The measured band is the homepage's
 * ComparisonSection, reused as is, so the two pages cannot disagree. A fair
 * "when they are the better pick" band stays: the comparison is only credible
 * if it says where we lose.
 */
export function GitingestAlternativePage() {
  return (
    <AppFlow
      renderLanding={(dropProps, linkImport) => (
        <Landing dropProps={dropProps} linkImport={linkImport} />
      )}
    />
  );
}

type LandingProps = { dropProps: DropZoneProps; linkImport: ImportState };

function Landing({ dropProps, linkImport }: LandingProps) {
  return (
    <>
      <Hero dropProps={dropProps} linkImport={linkImport} />
      <WhereItRuns />
      <ComparisonSection />
      <BetterPick />
      <Faq />
      <ClosingCta />
    </>
  );
}

const TRUST = [
  "A folder or ZIP read in your browser",
  "A GitHub repo fetched straight from GitHub",
  "No install, no sign-up, nothing uploaded to us",
];

function Hero({ dropProps, linkImport }: LandingProps) {
  return (
    <section className="mx-auto w-full max-w-[1040px] px-4 pb-4 pt-14 sm:px-6 md:pt-16">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_minmax(340px,420px)] lg:gap-14">
        <div className="min-w-0">
          <span className="text-go-fg rounded-pill inline-flex items-center gap-2 border border-[oklch(var(--primary)/0.25)] bg-[oklch(var(--primary)/0.08)] px-3 py-1 font-mono text-[11px]">
            <MonitorSmartphone className="text-primary h-3 w-3" strokeWidth={2.5} />
            Runs in this tab
          </span>

          <h1 className="font-display text-ink mt-6 text-balance text-[clamp(1.9rem,5vw,2.75rem)] font-bold leading-[1.06] tracking-[-0.025em]">
            A gitingest and Repomix alternative that runs in your browser.
          </h1>

          <p className="text-ink-secondary mt-5 max-w-[52ch] text-[16px] leading-relaxed">
            Drop a folder or paste a public GitHub link. The files are read here, lock files and
            tests stay out by default, PDFs and Word files come in as text, and one file comes back
            with its token count.
          </p>

          <ul className="mt-6 space-y-2">
            {TRUST.map((t) => (
              <li key={t} className="text-ink-secondary flex items-center gap-2 text-[14px]">
                <Check className="text-primary h-4 w-4 shrink-0" strokeWidth={2.5} />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0">
          <EntrySurface {...dropProps} linkImport={linkImport} />
        </div>
      </div>
    </section>
  );
}

const RUNS = [
  {
    tool: "FileConcat",
    where:
      "In your browser tab. A folder or ZIP is read from your disk, and a public GitHub repository is fetched by your browser straight from GitHub.",
    quote: "Nothing uploaded to us",
    href: "/privacy",
  },
  {
    tool: "gitingest website",
    where:
      "Takes a Git repository link. The repository is cloned on gitingest's backend and deleted after processing.",
    quote: "Cloned repos are deleted after processing",
    href: "https://gitingest.com/",
  },
  {
    tool: "gitingest command line",
    where: "On your machine, once installed with pip.",
    quote: "pip install gitingest",
    href: "https://github.com/coderamp-labs/gitingest",
  },
  {
    tool: "Repomix website",
    where:
      "A folder or ZIP you upload is stored on Repomix's servers while it is packed, then deleted.",
    quote: "your files are temporarily stored on our servers for processing",
    href: "https://repomix.com/guide/privacy",
  },
  {
    tool: "Repomix command line",
    where: "On your machine, run with npx.",
    quote: "Since all processing is local",
    href: "https://repomix.com/guide/privacy",
  },
];

function WhereItRuns() {
  return (
    <MarketingSection labelledBy="where-it-runs">
      <div className="mx-auto max-w-[640px] text-center">
        <h2
          id="where-it-runs"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          Where gitingest, Repomix and FileConcat process your code.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[52ch] text-[15px] leading-relaxed">
          Each tool in its own words, read on its own pages in September 2026. Both command-line
          tools run on your machine; the two websites do the work on theirs.
        </p>
      </div>

      <div className="mx-auto mt-9 max-w-[820px] overflow-x-auto">
        <table className="w-full border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-border border-b">
              <th className="text-ink-muted py-2.5 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
                Tool
              </th>
              <th className="text-ink-muted py-2.5 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
                Where the work happens
              </th>
              <th className="text-ink-muted py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
                In its words
              </th>
            </tr>
          </thead>
          <tbody>
            {RUNS.map((row) => (
              <tr key={row.tool} className="border-hairline border-b align-top">
                <td className="text-ink py-3 pr-4 font-medium">{row.tool}</td>
                <td className="text-ink-secondary py-3 pr-4">{row.where}</td>
                <td className="text-ink-muted py-3 text-[13px]">
                  {row.href.startsWith("/") ? (
                    <ProseLink to={row.href}>{row.quote}</ProseLink>
                  ) : (
                    <SourceLink href={row.href}>&quot;{row.quote}&quot;</SourceLink>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </MarketingSection>
  );
}

function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:text-ink-secondary underline decoration-[oklch(var(--border-strong))] underline-offset-2 transition-colors duration-150"
    >
      {children}
    </a>
  );
}

const BETTER = [
  {
    when: "You want every test file in.",
    why: "Repomix and gitingest keep tests at their defaults. FileConcat leaves files named as tests out until you tick them back in under Adjust what's included.",
  },
  {
    when: "The repository is private and you want to paste a link.",
    why: "gitingest's site takes a GitHub personal access token. Here, clone the repository and drop the folder instead.",
  },
  {
    when: "You work in a terminal or a CI job.",
    why: "Both ship a command-line tool that runs on your machine: npx repomix@latest, or pip install gitingest.",
  },
  {
    when: "You want Repomix's extras.",
    why: "Its guide lists code compression, comment removal and an MCP server, none of which FileConcat has.",
  },
];

function BetterPick() {
  return (
    <MarketingSection labelledBy="better-pick">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <h2
          id="better-pick"
          className="font-display text-ink max-w-[18ch] text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          When gitingest or Repomix is the better pick.
        </h2>

        <dl className="border-border-strong border-t">
          {BETTER.map((item) => (
            <div key={item.when} className="border-hairline border-b py-4">
              <dt className="font-display text-ink text-[15px] font-semibold">{item.when}</dt>
              <dd className="text-ink-secondary mt-1 text-[14px] leading-relaxed">{item.why}</dd>
            </div>
          ))}
        </dl>
      </div>
    </MarketingSection>
  );
}

function Faq() {
  return (
    <MarketingSection tone="alt" labelledBy="alt-faq">
      <h2
        id="alt-faq"
        className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
      >
        Common questions.
      </h2>

      <dl className="mt-8 max-w-[720px] space-y-7">
        {GITINGEST_ALTERNATIVE_FAQ.map((item) => (
          <div key={item.q}>
            <dt className="font-display text-ink text-[16px] font-semibold">{item.q}</dt>
            <dd className="text-ink-secondary mt-2 text-[14.5px] leading-relaxed">{item.a}</dd>
          </div>
        ))}
      </dl>
    </MarketingSection>
  );
}

function ClosingCta() {
  const toTop = () => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <MarketingSection labelledBy="alt-cta" className="text-center">
      <h2
        id="alt-cta"
        className="font-display text-ink mx-auto max-w-[20ch] text-balance text-[clamp(1.7rem,4vw,2.2rem)] font-bold leading-[1.08] tracking-[-0.025em]"
      >
        Try it on your own repository.
      </h2>
      <div className="mt-8">
        <button
          type="button"
          onClick={toTop}
          className="bg-primary text-primary-foreground rounded-input focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Drop a folder or paste a link
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
      <FurtherReading>
        The full method and every repository:{" "}
        <ProseLink to="/blog/repomix-vs-gitingest-vs-code2prompt">
          Repomix vs gitingest vs code2prompt, 60 repositories measured
        </ProseLink>
        . A repository link in more detail:{" "}
        <ProseLink to="/how-to/github-repo-to-text">GitHub repo to text</ProseLink>.
      </FurtherReading>
    </MarketingSection>
  );
}
