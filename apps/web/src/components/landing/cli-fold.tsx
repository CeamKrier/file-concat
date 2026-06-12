/* -------------------------------------------------------------------------- */
/* CLI fold. Same engine, terminal-native. Sits between Audience and          */
/* PrivacyFold. The page is a story of two surfaces sharing one engine; this  */
/* fold is the terminal-side beat.                                            */
/* -------------------------------------------------------------------------- */

export function CLIFold() {
  return (
    <section aria-labelledby="cli-fold-heading">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 md:py-32">
        <div className="grid gap-14 lg:grid-cols-12 lg:gap-16">
          <div className="min-w-0 lg:col-span-5">
            <h2
              id="cli-fold-heading"
              className="font-display text-foreground text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-[1.05] tracking-[-0.03em]"
              style={{ textWrap: "balance" }}
            >
              Same engine, in your terminal.
            </h2>
            <p className="text-muted-foreground mt-6 max-w-[40ch] text-[15.5px] leading-[1.6]">
              Install once and pipe context straight into the model. Stdout
              carries the artifact, stderr carries progress, and a one-line JSON
              summary is one flag away.
            </p>

            <pre className="text-foreground border-border bg-card mt-9 overflow-x-auto rounded-lg border px-4 py-3 font-mono text-[13px] leading-[1.55]">
              <code>
                <span className="text-muted-foreground/70">$ </span>
                npm install -g @fileconcat/cli
              </code>
            </pre>

            <ul className="mt-9 space-y-5 text-[14px]">
              <ValueBullet
                kicker="pipe"
                body={
                  <>
                    Stdout is the artifact, stderr is progress. Drop it into{" "}
                    <code className="text-foreground font-mono text-[12.5px]">
                      | claude -p
                    </code>{" "}
                    without parsing noise.
                  </>
                }
              />
              <ValueBullet
                kicker="parse"
                body="Opt in with --parse and the CLI pulls plain text out of PDFs, Word, Excel, slides, and the ODF family."
              />
              <ValueBullet
                kicker="json"
                body={
                  <>
                    <code className="text-foreground font-mono text-[12.5px]">--json</code> prints a
                    single-line summary your wrapper can{" "}
                    <code className="text-foreground font-mono text-[12.5px]">JSON.parse</code> at
                    end of run.
                  </>
                }
              />
            </ul>
          </div>

          <div className="min-w-0 lg:col-span-7">
            <TerminalSession />
          </div>
        </div>

        <SupportedFormats />

        <OutputContrast />
      </div>
    </section>
  );
}

function ValueBullet({ kicker, body }: { kicker: string; body: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[80px_1fr] gap-x-5 gap-y-1">
      <span className="text-primary pt-1 font-mono text-[10.5px] uppercase tracking-[0.14em]">
        {kicker}
      </span>
      <span className="text-muted-foreground leading-[1.55]">{body}</span>
    </li>
  );
}

/* A real session: command, stderr progress lines, stdout JSON summary, all
   colour-coded so the stdout / stderr separation is visible at a glance. */
function TerminalSession() {
  return (
    <div className="border-border bg-background overflow-hidden rounded-xl border shadow-[0_1px_0_oklch(var(--foreground)/0.04),0_24px_48px_-24px_oklch(var(--foreground)/0.18)]">
      <div className="border-border/60 bg-card flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="bg-foreground/20 inline-block h-2 w-2 rounded-full" />
          <span className="bg-foreground/20 inline-block h-2 w-2 rounded-full" />
          <span className="bg-foreground/20 inline-block h-2 w-2 rounded-full" />
          <span className="text-muted-foreground ml-3 font-mono text-[12px]">
            zsh · file-concat
          </span>
        </div>
        <span className="text-muted-foreground font-mono text-[11px]">
          <span className="text-primary">stdout</span> + stderr
        </span>
      </div>

      <div className="overflow-x-auto px-5 py-5 font-mono text-[12.5px] leading-[1.75]">
        <div className="text-foreground">
          <span className="text-muted-foreground/70">$ </span>
          file-concat ./service{" "}
          <span className="text-primary">--parse pdf,docx --json</span> -o ctx.xml
        </div>

        <div className="text-muted-foreground/80 mt-3 space-y-0.5">
          <div className="text-muted-foreground/50 text-[10.5px] uppercase tracking-[0.14em]">
            stderr
          </div>
          <div>Processing: /Users/em/service</div>
          <div>Output: ctx.xml (xml)</div>
          <div>Parse mode: pdf, docx</div>
          <div>Found 47 files</div>
          <div>Processing 45 files (parsed 3, skipped 2)</div>
          <div>Done in 1.83s</div>
          <div>Output written to: ctx.xml</div>
        </div>

        <div className="mt-4 space-y-0.5">
          <div className="text-muted-foreground/50 text-[10.5px] uppercase tracking-[0.14em]">
            stdout
          </div>
          <pre className="text-foreground/90 whitespace-pre-wrap break-words">
            <span className="text-foreground/60">{`{`}</span>
            {`"files":`}
            <span className="text-primary">45</span>
            {`,"parsed":`}
            <span className="text-primary">3</span>
            {`,"skipped":`}
            <span className="text-primary">2</span>
            {`,"skippedBreakdown":{"oversize":0,"binary":2,"readError":0,"parseFailed":0},"totalBytes":`}
            <span className="text-primary">184320</span>
            {`,"outputPath":"ctx.xml","elapsedSeconds":`}
            <span className="text-primary">1.83</span>
            {`,"style":"xml"`}
            <span className="text-foreground/60">{`}`}</span>
          </pre>
        </div>
      </div>
    </div>
  );
}

/* Format chip row. Brand register permits intentional badge clusters when
   they carry real information (which formats --parse handles). Mono, quiet,
   uniform width so the row reads as a set, not a christmas tree. */
function SupportedFormats() {
  const formats = ["PDF", "DOCX", "XLSX", "PPTX", "ODT", "ODS", "ODP"];
  return (
    <div className="mt-20">
      <p className="text-muted-foreground text-center text-[13px] tracking-[0.01em]">
        With{" "}
        <code className="text-foreground font-mono text-[12.5px]">--parse</code>, these documents
        enter the bundle as plain text.
      </p>
      <ul className="mt-5 flex flex-wrap justify-center gap-2.5">
        {formats.map((label) => (
          <li key={label}>
            <FormatChip label={label} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FormatChip({ label }: { label: string }) {
  return (
    <span className="border-border/80 bg-card text-foreground/80 inline-flex h-9 min-w-[56px] items-center justify-center rounded-md border px-3 font-mono text-[11.5px] font-medium tracking-[0.06em]">
      {label}
    </span>
  );
}

/* Two real artefacts the CLI produces: the XML bundle the model consumes,
   and the JSON summary your harness consumes. Intentionally asymmetric
   widths (the bundle is the bigger story; the summary is the metadata
   companion). Citation pins the structural choice to Anthropic's
   long-context guidance. */
function OutputContrast() {
  return (
    <div className="mt-24">
      <div className="mx-auto max-w-2xl text-center">
        <h3
          className="font-display text-foreground text-[clamp(1.375rem,2.25vw,1.75rem)] font-semibold leading-[1.1] tracking-[-0.025em]"
          style={{ textWrap: "balance" }}
        >
          One run, two outputs.
        </h3>
        <p
          className="text-muted-foreground mx-auto mt-5 max-w-[52ch] text-[15px] leading-[1.6]"
          style={{ textWrap: "pretty" }}
        >
          The bundle goes to the model in structured XML the model can navigate.
          The summary goes to your script as JSON your wrapper can parse. They
          ride on stdout together with stderr carrying progress.
        </p>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-[1.7fr_1fr] lg:gap-8 [&>*]:min-w-0">
        <ArtefactCard label="bundle for the model" hint="ctx.xml · what your prompt embeds">
          <pre className="text-foreground/90 overflow-x-auto font-mono text-[12px] leading-[1.7]">
            <code>
              <span className="text-primary">{`<codebase`}</span>{" "}
              <span className="text-foreground/70">project=</span>
              <span className="text-primary/90">{`"service"`}</span>{" "}
              <span className="text-foreground/70">generator=</span>
              <span className="text-primary/90">{`"fileconcat"`}</span>
              <span className="text-primary">{`>`}</span>
              {`\n  `}
              <span className="text-primary">{`<directory_structure>`}</span>
              {`\n    └── api/\n        ├── handlers.ts\n        └── spec.pdf\n  `}
              <span className="text-primary">{`</directory_structure>`}</span>
              {`\n  `}
              <span className="text-primary">{`<files>`}</span>
              {`\n    `}
              <span className="text-primary">{`<file`}</span>{" "}
              <span className="text-foreground/70">path=</span>
              <span className="text-primary/90">{`"api/handlers.ts"`}</span>{" "}
              <span className="text-foreground/70">language=</span>
              <span className="text-primary/90">{`"typescript"`}</span>
              <span className="text-primary">{`>`}</span>
              {`\n      `}
              <span className="text-muted-foreground/70">{`// route definitions`}</span>
              {`\n      export `}
              <span className="text-foreground/70">function</span>
              {` GET() { … }\n    `}
              <span className="text-primary">{`</file>`}</span>
              {`\n    `}
              <span className="text-primary">{`<file`}</span>{" "}
              <span className="text-foreground/70">path=</span>
              <span className="text-primary/90">{`"api/spec.pdf"`}</span>{" "}
              <span className="text-foreground/70">language=</span>
              <span className="text-primary/90">{`"text"`}</span>
              <span className="text-primary">{`>`}</span>
              {`\n      `}
              <span className="text-muted-foreground/70">{`# Service API spec`}</span>
              {`\n      `}
              <span className="text-muted-foreground/70">
                {`extracted from spec.pdf via --parse`}
              </span>
              {`\n    `}
              <span className="text-primary">{`</file>`}</span>
              {`\n  `}
              <span className="text-primary">{`</files>`}</span>
              {`\n`}
              <span className="text-primary">{`</codebase>`}</span>
            </code>
          </pre>
        </ArtefactCard>

        <ArtefactCard label="summary for your script" hint="--json on stdout, one line">
          <pre className="text-foreground/90 overflow-x-auto font-mono text-[12px] leading-[1.7]">
            <code>
              <span className="text-foreground/60">{`{`}</span>
              {`\n  "files": `}
              <span className="text-primary">45</span>
              {`,\n  "parsed": `}
              <span className="text-primary">3</span>
              {`,\n  "skipped": `}
              <span className="text-primary">2</span>
              {`,\n  "skippedBreakdown": {\n    "oversize": `}
              <span className="text-primary">0</span>
              {`,\n    "binary": `}
              <span className="text-primary">2</span>
              {`,\n    "parseFailed": `}
              <span className="text-primary">0</span>
              {`\n  },\n  "totalBytes": `}
              <span className="text-primary">184320</span>
              {`,\n  "outputPath": "ctx.xml",\n  "elapsedSeconds": `}
              <span className="text-primary">1.83</span>
              {`,\n  "style": "xml"\n`}
              <span className="text-foreground/60">{`}`}</span>
            </code>
          </pre>
        </ArtefactCard>
      </div>

      <figure className="border-border bg-card mx-auto mt-14 max-w-3xl rounded-xl border p-7 sm:p-9">
        <blockquote className="text-foreground text-[15.5px] leading-[1.65]">
          Wrapping multi-file context in XML tags helps the model keep its
          bearings across long context, especially when extracted spec text and
          source code sit in the same prompt.
        </blockquote>
        <figcaption className="text-muted-foreground mt-5 text-[13px] leading-[1.5]">
          Paraphrasing Anthropic&apos;s prompt engineering guidance,{" "}
          <a
            className="text-primary underline-offset-4 hover:underline"
            href="https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags"
            target="_blank"
            rel="noreferrer"
          >
            use XML tags to structure your prompts
          </a>
          . The CLI ships the XML wrapper by default so multi-file prompts stay
          well-tagged even when scripts assemble them.
        </figcaption>
      </figure>
    </div>
  );
}

function ArtefactCard({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border bg-background overflow-hidden rounded-xl border shadow-[0_1px_0_oklch(var(--foreground)/0.04),0_24px_48px_-24px_oklch(var(--foreground)/0.18)]">
      <div className="border-border/60 bg-card flex items-center justify-between border-b px-4 py-2.5">
        <span className="text-foreground font-mono text-[11.5px] font-medium tracking-[0.02em]">
          {label}
        </span>
        <span className="text-muted-foreground font-mono text-[11px]">{hint}</span>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}
