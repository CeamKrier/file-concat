import { MarketingSection } from "./section";
import { LabeledPoints, type LabeledPoint } from "./labeled-points";

const POINTS: LabeledPoint[] = [
  {
    label: "Tree",
    body: "An ASCII map at the top, so the model knows the shape before it reads a single file.",
  },
  {
    label: "Tags",
    body: (
      <>
        Every file wrapped in{" "}
        <code className="text-code font-mono text-[12.5px]">&lt;file path&gt;</code>, so references
        stay unambiguous.
      </>
    ),
  },
  {
    label: "Fences",
    body: "Language-typed code fences. Highlighting carries through to whatever renders the reply.",
  },
];

/** Section A: what the bundled output actually looks like. */
export function OutputSection() {
  return (
    <MarketingSection
      labelledBy="what-you-get"
      className="grid items-center gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-16"
    >
      <div className="min-w-0">
        <h2
          id="what-you-get"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          One file, structured so models read it cleanly.
        </h2>
        <p className="text-ink-secondary mt-4 max-w-[46ch] text-[15px] leading-relaxed">
          Files arrive wrapped, tagged, and ordered for parsing. The model gets the tree first, then
          each file in a labeled block with its language and path. It navigates the bundle the way
          you navigate the repo.
        </p>
        <LabeledPoints items={POINTS} />
      </div>

      <div className="min-w-0">
        <OutputSample />
      </div>
    </MarketingSection>
  );
}

/**
 * A static, hand-tokenized mock of the bundled output. The coloring is
 * presentational only; the real blob ships as plain text.
 */
function OutputSample() {
  return (
    <div className="border-border bg-surface-inset rounded-card overflow-hidden border shadow-[0_24px_48px_-24px_oklch(var(--background))]">
      <div className="border-hairline flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="bg-ink-faint/40 h-2 w-2 rounded-full" />
          <span className="bg-ink-faint/40 h-2 w-2 rounded-full" />
          <span className="bg-ink-faint/40 h-2 w-2 rounded-full" />
          <span className="text-ink-muted ml-2 font-mono text-[11.5px]">fileconcat-output.txt</span>
        </div>
        <span className="font-mono text-[11px]">
          <span className="text-primary">≈ 412</span>
          <span className="text-ink-faint"> tokens</span>
        </span>
      </div>

      <pre className="text-code overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
        <code>
          <span className="text-ink-faint">
            {`# Project Structure\n`}
            {"```\n"}
            {`└── app/\n`}
            {`    ├── hooks/use-theme.ts\n`}
            {`    ├── components/button.tsx\n`}
            {`    └── README.md\n`}
            {"```\n"}
          </span>
          {`\n`}
          <span className="text-ink-faint">{`# File Contents\n\n`}</span>
          <span className="text-primary">{`<file `}</span>
          <span className="text-ink-secondary">{`path=`}</span>
          <span className="text-go-fg">{`"app/hooks/use-theme.ts"`}</span>
          <span className="text-primary">{`>\n`}</span>
          <span className="text-ink-faint">{"```typescript\n"}</span>
          <span className="text-ink-secondary">{`import`}</span>
          {` { useEffect, useState } `}
          <span className="text-ink-secondary">{`from`}</span>{" "}
          <span className="text-go-fg">{`"react"`}</span>
          {`;\n\n`}
          <span className="text-ink-secondary">{`export function`}</span>{" "}
          <span className="text-ink font-medium">{`useTheme`}</span>
          {`() {\n  `}
          <span className="text-ink-secondary">{`const`}</span>
          {` [theme, setTheme] = `}
          <span className="text-ink font-medium">{`useState`}</span>
          {`(`}
          <span className="text-go-fg">{`"light"`}</span>
          {`);\n  `}
          <span className="text-ink-secondary">{`return`}</span>
          {` { theme, setTheme };\n}\n`}
          <span className="text-ink-faint">{"```\n"}</span>
          <span className="text-primary">{`</file>`}</span>
        </code>
      </pre>
    </div>
  );
}
