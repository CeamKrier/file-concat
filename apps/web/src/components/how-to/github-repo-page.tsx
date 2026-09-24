import { ArrowUp, Check, FolderTree, Link2 } from "lucide-react";

import { AppFlow } from "~/components/app/app-flow";
import { DropZone, type DropZoneProps } from "~/components/app/drop-zone";
import { ImportPanel, type ImportState } from "~/components/app/import-panel";
import { InfoCard } from "~/components/app/info-card";
import { FitBars } from "~/components/app/marketing/fit-bars";
import { MarketingSection } from "~/components/app/marketing/section";
import { FurtherReading, ProseLink } from "~/components/app/marketing";

import { GITHUB_REPO_FAQ, REPO_SAMPLE } from "./github-repo-faq";

/**
 * /how-to/github-repo-to-text: a GitHub repository into one text file. The one
 * page that puts the link field first, because the searcher arrives holding a
 * URL, not a folder. The drop lane stays under it for a clone or a private
 * repository. Every size figure comes from REPO_SAMPLE, derived from the
 * 60-repository measurement, never typed in.
 */
export function GithubRepoPage() {
  return (
    <AppFlow
      renderLanding={(dropProps, linkImport) => (
        <GithubRepoLanding dropProps={dropProps} linkImport={linkImport} />
      )}
    />
  );
}

type LandingProps = { dropProps: DropZoneProps; linkImport: ImportState };

function GithubRepoLanding({ dropProps, linkImport }: LandingProps) {
  return (
    <>
      <Hero dropProps={dropProps} linkImport={linkImport} />
      <HowBig />
      <LeftOut />
      <Formats />
      <Workflow />
      <Faq />
      <ClosingCta />
    </>
  );
}

const TRUST = [
  "Fetched by your browser, straight from GitHub",
  "Token count shown before you paste",
  "No sign-up, nothing uploaded to us",
];

function Hero({ dropProps, linkImport }: LandingProps) {
  return (
    <section className="mx-auto w-full max-w-[1040px] px-4 pb-4 pt-14 sm:px-6 md:pt-16">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_minmax(340px,420px)] lg:gap-14">
        <div className="min-w-0">
          <span className="text-go-fg rounded-pill inline-flex items-center gap-2 border border-[oklch(var(--primary)/0.25)] bg-[oklch(var(--primary)/0.08)] px-3 py-1 font-mono text-[11px]">
            <Link2 className="text-primary h-3 w-3" strokeWidth={2.5} />
            Paste a link, get one file
          </span>

          <h1 className="font-display text-ink mt-6 text-balance text-[clamp(1.9rem,5vw,2.75rem)] font-bold leading-[1.06] tracking-[-0.025em]">
            Turn a GitHub repo into one text file.
          </h1>

          <p className="text-ink-secondary mt-5 max-w-[52ch] text-[16px] leading-relaxed">
            Paste a public repository URL and press Fetch. Lock files, dependencies and build output
            stay out, and the rest comes back as one file with the file tree at the top, counted in
            tokens so you know whether it fits your model before you paste it.
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

        {/* The link lane first, the reverse of the home entry surface: the
            searcher here is holding a URL. The drop lane is for a clone. */}
        <div className="rounded-panel border-border bg-surface-alt min-w-0 border p-4 sm:p-5">
          <ImportPanel {...linkImport} />

          <div className="my-4 flex items-center gap-3">
            <span className="bg-hairline h-px flex-1" />
            <span className="text-ink-faint font-mono text-[11px]">or</span>
            <span className="bg-hairline h-px flex-1" />
          </div>

          <DropZone
            {...dropProps}
            variant="compact"
            title="Drop a cloned folder"
            hint="For a private repository, or one you have changed."
          />
        </div>
      </div>
    </section>
  );
}

const num = (v: number) => Math.round(v).toLocaleString("en-US");

function HowBig() {
  const { count, median, largest, fits } = REPO_SAMPLE;
  return (
    <MarketingSection
      tone="alt"
      labelledBy="repo-size"
      className="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16"
    >
      <div className="min-w-0">
        <h2
          id="repo-size"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          How many tokens is a GitHub repo?
        </h2>
        <p className="text-ink-secondary mt-4 max-w-[48ch] text-[15px] leading-relaxed">
          We bundled {count} public repositories whole with this engine in September 2026. The
          median came to {num(median)} tokens, {fits(128_000)} of {count} fit a 128K window, and
          the largest reached {num(largest)}. There is no typical size to plan around, which is why
          the count comes before the paste.
        </p>
        <p className="text-ink-muted mt-5 text-[13px] leading-relaxed">
          Method and every repository:{" "}
          <ProseLink to="/blog/how-many-tokens-is-a-codebase">
            how many tokens a codebase actually is
          </ProseLink>
          .
        </p>
      </div>

      <FitBars />
    </MarketingSection>
  );
}

const LEFT_OUT = [
  { what: "Version control", eg: ".git" },
  { what: "Dependencies and vendored code", eg: "node_modules, vendor, third_party" },
  { what: "Lock files", eg: "package-lock.json, Cargo.lock, go.sum" },
  { what: "Build output", eg: "dist, build, target" },
  { what: "Test files named as tests", eg: "api.test.ts, handler_test.go" },
];

function LeftOut() {
  return (
    <MarketingSection labelledBy="repo-left-out">
      <div className="mx-auto max-w-[640px] text-center">
        <h2
          id="repo-left-out"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          What stays out of the file.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[50ch] text-[15px] leading-relaxed">
          On our fresh clones the defaults removed about a fifth of the tokens, most of it tests.
          Anything here can go back in under Adjust what's included.
        </p>
      </div>

      <div className="mx-auto mt-9 max-w-[640px] overflow-x-auto">
        <table className="w-full border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-border border-b">
              <th className="text-ink-muted py-2.5 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
                Left out
              </th>
              <th className="text-ink-muted py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
                For example
              </th>
            </tr>
          </thead>
          <tbody>
            {LEFT_OUT.map((row) => (
              <tr key={row.what} className="border-hairline border-b align-top">
                <td className="text-ink py-3 pr-4 font-medium">{row.what}</td>
                <td className="text-ink-secondary py-3 font-mono text-[13px]">{row.eg}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </MarketingSection>
  );
}

function Formats() {
  return (
    <MarketingSection
      tone="alt"
      labelledBy="repo-formats"
      className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16"
    >
      <div className="min-w-0">
        <h2
          id="repo-formats"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          Markdown, XML or plain text.
        </h2>
        <p className="text-ink-secondary mt-4 max-w-[48ch] text-[15px] leading-relaxed">
          The same single file comes in three styles, switched under the preview. Across five real
          codebases the switch changed the total by at most about 1% of tokens, so use the one your
          prompt already uses.
        </p>
        <p className="text-ink-muted mt-5 text-[13px] leading-relaxed">
          The measurement:{" "}
          <ProseLink to="/blog/xml-vs-markdown-for-llm-context">XML vs Markdown for LLM context</ProseLink>
          .
        </p>
      </div>

      <div className="min-w-0">
        <InfoCard tone="info" icon={FolderTree} title="Every file under its path">
          <p>
            Whatever the style, the file opens with the repository's tree and every file sits under
            its own path, so the model can tell src/index.ts from test/index.ts.
          </p>
        </InfoCard>
      </div>
    </MarketingSection>
  );
}

const STEPS = [
  {
    title: "Paste the repository URL",
    body: "The whole repository, a branch with /tree/branch, or one folder with /tree/branch/path.",
  },
  {
    title: "Press Fetch",
    body: "Your browser downloads the files straight from GitHub. A large repository comes as one archive, unpacked in this tab.",
  },
  {
    title: "Leave out what you do not need",
    body: "Open Adjust what's included: every file and folder shows its size, and the token count updates as you click rows out.",
  },
  {
    title: "Copy or download the one file",
    body: "Paste it into ChatGPT, Claude or Gemini, or add it to a project, with the count already known.",
  },
];

function Workflow() {
  return (
    <MarketingSection labelledBy="repo-workflow">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <h2
          id="repo-workflow"
          className="font-display text-ink max-w-[18ch] text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          GitHub repo to text in four steps.
        </h2>

        <ol className="space-y-6">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span className="text-primary-foreground bg-primary font-display mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold">
                {i + 1}
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-ink text-[15px] font-semibold">{step.title}</h3>
                <p className="text-ink-secondary mt-1 text-[14px] leading-relaxed">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </MarketingSection>
  );
}

function Faq() {
  return (
    <MarketingSection tone="alt" labelledBy="repo-faq">
      <h2
        id="repo-faq"
        className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
      >
        Common questions.
      </h2>

      <dl className="mt-8 max-w-[720px] space-y-7">
        {GITHUB_REPO_FAQ.map((item) => (
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
    <MarketingSection labelledBy="repo-cta" className="text-center">
      <h2
        id="repo-cta"
        className="font-display text-ink mx-auto max-w-[20ch] text-balance text-[clamp(1.7rem,4vw,2.2rem)] font-bold leading-[1.08] tracking-[-0.025em]"
      >
        One repository, one file, counted.
      </h2>
      <div className="mt-8">
        <button
          type="button"
          onClick={toTop}
          className="bg-primary text-primary-foreground rounded-input focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Paste a repository link
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
      <FurtherReading>
        URL shapes, rate limits and the archive fallback, in detail:{" "}
        <ProseLink to="/docs/github-import">GitHub import</ProseLink>
        .
      </FurtherReading>
    </MarketingSection>
  );
}
