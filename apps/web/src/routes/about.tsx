import { createFileRoute, Link } from "@tanstack/react-router";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { ArrowRight } from "lucide-react";

import { SiteHeader } from "~/components/site-header";
import { SiteFooter } from "~/components/site-footer";
import { generateSEOMeta } from "~/lib/seo";

export const Route = createFileRoute("/about")({
  component: AboutPage,
  head: () => ({
    meta: generateSEOMeta({
      title: "About FileConcat. The privacy-first file bundler for LLMs.",
      description:
        "FileConcat is a free, open-source tool for combining multiple files into a single document optimized for AI assistants. No upload, no server, no account.",
      url: "https://fileconcat.com/about",
    }),
    links: [{ rel: "canonical", href: "https://fileconcat.com/about" }],
  }),
});

function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Mission />
        <HowItWorks />
        <UseCases />
        <Provenance />
      </main>
      <SiteFooter />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero                                                                       */
/* -------------------------------------------------------------------------- */

function Hero() {
  return (
    <section>
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-20 sm:px-6 sm:pt-28 md:pb-24 md:pt-36">
        <div className="mb-7 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          <span aria-hidden="true" className="inline-block h-px w-6 bg-foreground/40" />
          about
        </div>
        <h1
          className="font-display text-[clamp(2rem,4.5vw,3.5rem)] font-bold leading-[1.02] tracking-[-0.04em] text-foreground"
          style={{ textWrap: "balance" }}
        >
          A small tool that does one thing well, and never sends anything anywhere.
        </h1>
        <p
          className="mt-8 max-w-[60ch] text-[16px] leading-[1.6] text-muted-foreground"
          style={{ textWrap: "pretty" }}
        >
          FileConcat turns N local files into one structured blob that an LLM can actually
          read. Drop a folder, pick what stays, copy the result. The whole thing runs in the
          tab you opened. Disconnect after the page loads and it keeps working.
        </p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Mission                                                                    */
/* -------------------------------------------------------------------------- */

function Mission() {
  return (
    <section className="bg-secondary/40">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 md:py-28">
        <h2
          className="font-display text-[clamp(1.5rem,2.75vw,2rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-foreground"
          style={{ textWrap: "balance" }}
        >
          Five principles, written down.
        </h2>
        <div className="mt-10 space-y-9">
          <Principle
            label="Trust through transparency, not claims."
            body="Privacy is shown by behavior: no network request leaves the tab, processing is visible in your browser, no account wall. The fewer trust badges, the more trustworthy."
          />
          <Principle
            label="Restraint is the brand."
            body="Every element earns its place. Absence — the empty space, the missing decoration, the section we didn't add — is a design choice."
          />
          <Principle
            label="The tool is the landing."
            body="The marketing surface should put you closer to the workflow, not further from it. The drop zone is the hero."
          />
          <Principle
            label="Precision over polish."
            body="Token counts must be honest, file-type detection must be correct, the filter list must reflect what actually ships. A wrong number is a brand failure."
          />
          <Principle
            label="Quiet by default, expressive on intent."
            body="Color, motion, and weight are reserved for the moments that need them: the cost readout, a destructive confirmation, the 'copied' affordance. The rest stays out of the way."
          />
        </div>
      </div>
    </section>
  );
}

function Principle({ label, body }: { label: string; body: string }) {
  return (
    <div className="grid grid-cols-1 gap-1.5 md:grid-cols-[1fr_2fr] md:gap-x-10">
      <h3 className="font-display text-[15.5px] font-semibold leading-[1.4] tracking-[-0.01em] text-foreground">
        {label}
      </h3>
      <p
        className="text-[15px] leading-[1.6] text-muted-foreground"
        style={{ textWrap: "pretty" }}
      >
        {body}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* How it works                                                               */
/* -------------------------------------------------------------------------- */

function HowItWorks() {
  return (
    <section>
      <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6 md:py-32">
        <h2
          className="font-display text-[clamp(1.5rem,2.75vw,2rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-foreground"
          style={{ textWrap: "balance" }}
        >
          How it works.
        </h2>
        <p className="mt-5 max-w-[55ch] text-[15.5px] leading-[1.6] text-muted-foreground">
          A real four-step sequence, so the numbers earn their place.
        </p>

        <ol className="mt-12 space-y-10">
          <Step
            n="01"
            label="Drop"
            body="Drag a folder onto the page, use the file picker, or paste a GitHub / GitLab / Bitbucket / Gist URL. Everything is read locally."
          />
          <Step
            n="02"
            label="Filter"
            body="Skip the noise: binaries, lockfiles, build output. Tune include / exclude with glob patterns or pick a preset for your stack."
          />
          <Step
            n="03"
            label="Check"
            body="See an honest token count for GPT-4, Claude, and Gemini before you paste anywhere. Preview the exact blob the model will receive."
          />
          <Step
            n="04"
            label="Copy"
            body="Copy a single file to the clipboard, or download split chunks when the bundle is too large for one context window."
          />
        </ol>
      </div>
    </section>
  );
}

function Step({ n, label, body }: { n: string; label: string; body: string }) {
  return (
    <li className="grid grid-cols-[44px_1fr] gap-x-6 gap-y-1 md:grid-cols-[60px_1fr]">
      <span className="font-mono text-[12.5px] uppercase tracking-[0.12em] text-primary">
        {n}
      </span>
      <div>
        <h3 className="font-display text-[16.5px] font-semibold tracking-[-0.015em] text-foreground">
          {label}
        </h3>
        <p
          className="mt-2 max-w-[52ch] text-[15px] leading-[1.6] text-muted-foreground"
          style={{ textWrap: "pretty" }}
        >
          {body}
        </p>
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Use cases                                                                  */
/* -------------------------------------------------------------------------- */

function UseCases() {
  return (
    <section className="bg-secondary/40">
      <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6 md:py-32">
        <h2
          className="font-display text-[clamp(1.5rem,2.75vw,2rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-foreground"
          style={{ textWrap: "balance" }}
        >
          What people use it for.
        </h2>
        <ul className="mt-10 grid grid-cols-1 gap-x-12 gap-y-7 md:grid-cols-2">
          <UseCase
            who="Developers"
            line="Sharing a whole repo with Claude or GPT for code review, refactoring, or debugging."
          />
          <UseCase
            who="Researchers"
            line="Stitching paper sections, notes, and citations into one blob for synthesis."
          />
          <UseCase
            who="Writers"
            line="Editing across many markdown files at once without losing context."
          />
          <UseCase
            who="Students"
            line="Bundling multi-file assignments to get help on the whole thing, not one file at a time."
          />
        </ul>
      </div>
    </section>
  );
}

function UseCase({ who, line }: { who: string; line: string }) {
  return (
    <li>
      <p className="font-display text-[14.5px] font-semibold tracking-[-0.01em] text-foreground">
        {who}
      </p>
      <p className="mt-1.5 text-[14.5px] leading-[1.55] text-muted-foreground">{line}</p>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Provenance                                                                 */
/* -------------------------------------------------------------------------- */

function Provenance() {
  return (
    <section>
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 md:py-28">
        <h2
          className="font-display text-[clamp(1.5rem,2.75vw,2rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-foreground"
          style={{ textWrap: "balance" }}
        >
          Open source. MIT.
        </h2>
        <p
          className="mt-5 max-w-[60ch] text-[15.5px] leading-[1.6] text-muted-foreground"
          style={{ textWrap: "pretty" }}
        >
          The web app, the CLI, and the shared engine all live in one repository. Read the
          code, file issues, fork it for your own needs. Built by{" "}
          <a
            href="https://twitter.com/CeamKrier"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline decoration-primary/50 decoration-1 underline-offset-[5px] transition-colors duration-150 hover:decoration-primary"
          >
            @CeamKrier
          </a>
          .
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <a
            href="https://github.com/CeamKrier/file-concat"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-4 font-display text-[13px] font-medium text-foreground transition-colors duration-150 hover:border-foreground/40 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <SiGithub className="h-3.5 w-3.5" />
            View on GitHub
          </a>
          <Link
            to="/"
            className="group inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 font-display text-[13px] font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Try the tool
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 ease-out-quart group-hover:translate-x-0.5 motion-reduce:transition-none" />
          </Link>
        </div>
      </div>
    </section>
  );
}

