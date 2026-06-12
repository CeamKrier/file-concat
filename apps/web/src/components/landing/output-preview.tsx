/**
 * Static mockup of FileConcat's bundled output. The sample code is rendered
 * as hand-tokenised <span>s — the colouring is presentational only, never
 * shipped to the model.
 */
export function OutputPreview() {
  return (
    <section className="bg-secondary/40">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-24 sm:px-6 md:py-32 lg:grid-cols-12 lg:gap-16">
        <div className="min-w-0 lg:col-span-5">
          <h2
            className="font-display text-foreground text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-[1.05] tracking-[-0.03em]"
            style={{ textWrap: "balance" }}
          >
            What the model receives.
          </h2>
          <p className="text-muted-foreground mt-6 max-w-[40ch] text-[15.5px] leading-[1.6]">
            Files arrive wrapped, tagged, and ordered for parsing. The model gets the file tree
            first, then each file in a labeled block with its language and path. It navigates the
            bundle the way you'd navigate the repo.
          </p>
          <ul className="mt-9 space-y-5 text-[14px]">
            <PreviewBullet
              kicker="tree"
              body="One ASCII map at the top so the model knows what it's reading before any file body."
            />
            <PreviewBullet
              kicker="tags"
              body={
                <>
                  Each file wrapped in{" "}
                  <code className="text-foreground font-mono text-[12.5px]">&lt;file path&gt;</code>{" "}
                  so references stay unambiguous.
                </>
              }
            />
            <PreviewBullet
              kicker="fences"
              body="Language-typed code fences. Syntax highlighting carries through to whatever renders the response."
            />
          </ul>
        </div>

        <div className="min-w-0 lg:col-span-7">
          <SamplePreview />
        </div>
      </div>
    </section>
  );
}

function PreviewBullet({ kicker, body }: { kicker: string; body: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[80px_1fr] gap-x-5 gap-y-1">
      <span className="text-primary pt-1 font-mono text-[10.5px] uppercase tracking-[0.14em]">
        {kicker}
      </span>
      <span className="text-muted-foreground leading-[1.55]">{body}</span>
    </li>
  );
}

function SamplePreview() {
  return (
    <div className="border-border bg-background overflow-hidden rounded-xl border shadow-[0_1px_0_oklch(var(--foreground)/0.04),0_24px_48px_-24px_oklch(var(--foreground)/0.18)]">
      <div className="border-border/60 bg-card flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="bg-foreground/20 inline-block h-2 w-2 rounded-full" />
          <span className="bg-foreground/20 inline-block h-2 w-2 rounded-full" />
          <span className="bg-foreground/20 inline-block h-2 w-2 rounded-full" />
          <span className="text-muted-foreground ml-3 font-mono text-[12px]">
            fileconcat-output.txt
          </span>
        </div>
        <span className="text-muted-foreground font-mono text-[11px]">
          <span className="text-primary">≈ 412</span> tokens
        </span>
      </div>

      <div className="grid grid-cols-[40px_1fr] font-mono text-[12.5px] leading-[1.7]">
        <div
          aria-hidden="true"
          className="border-border/40 bg-card/50 text-muted-foreground/60 select-none border-r py-4 pr-3 text-right"
        >
          {Array.from({ length: 21 }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <pre className="text-foreground/90 overflow-x-auto py-4 pl-5 pr-5">
          <code>
            <span className="text-muted-foreground/80">
              {`# Project Structure\n`}
              {`\`\`\`\n`}
              {`└── app/\n`}
              {`    ├── hooks/use-theme.ts\n`}
              {`    ├── components/button.tsx\n`}
              {`    └── README.md\n`}
              {`\`\`\`\n`}
            </span>
            {`\n`}
            <span className="text-muted-foreground/80">{`# File Contents\n`}</span>
            {`\n`}
            <span className="text-primary">{`<file `}</span>
            <span className="text-foreground/70">{`path=`}</span>
            <span className="text-primary/90">{`"app/hooks/use-theme.ts"`}</span>
            <span className="text-primary">{`>\n`}</span>
            <span className="text-muted-foreground/70">{`\`\`\`typescript\n`}</span>
            <span className="text-foreground/70">{`import`}</span>
            {` { useEffect, useState } `}
            <span className="text-foreground/70">{`from`}</span>{" "}
            <span className="text-primary/90">{`"react"`}</span>
            {`;\n\n`}
            <span className="text-foreground/70">{`export function`}</span>{" "}
            <span className="font-medium">{`useTheme`}</span>
            {`() {\n  `}
            <span className="text-foreground/70">{`const`}</span>
            {` [theme, setTheme] = `}
            <span className="font-medium">{`useState`}</span>
            {`(`}
            <span className="text-primary/90">{`"light"`}</span>
            {`);\n  `}
            <span className="text-foreground/70">{`return`}</span>
            {` { theme, setTheme };\n}\n`}
            <span className="text-muted-foreground/70">{`\`\`\`\n`}</span>
            <span className="text-primary">{`</file>`}</span>
          </code>
        </pre>
      </div>
    </div>
  );
}
