import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Checklist } from "~/components/blog/checklist";
import { CompositionBar } from "~/components/blog/composition-bar";
import { ContextFunnel } from "~/components/blog/context-funnel";
import { Contents, OutlineProvider } from "~/components/blog/contents";
import { FitCurve } from "~/components/blog/fit-curve";
import { Method } from "~/components/blog/method";
import { PaneDiff } from "~/components/blog/pane-diff";
import { Payoff } from "~/components/blog/payoff";
import { ReaderDuel } from "~/components/blog/reader-duel";
import { SectionBoundary } from "~/components/blog/section-boundary";
import { StatusGrid } from "~/components/blog/status-grid";
import { Stopper } from "~/components/blog/stopper";
import { UnitFlip } from "~/components/blog/unit-flip";

/**
 * The research figures derive every ratio from the counts they are given, and
 * those ratios end up quoted. This covers the arithmetic and the two rules that
 * are easy to break by eye: the token figure never sits on the file scale, and
 * an excluded category never counts as kept.
 */

const STAGES = [
  { label: "files found", value: 842 },
  { label: "text eligible", value: 511, lost: "no readable text" },
  { label: "kept after filters", value: 311, lost: "excluded by default" },
];

describe("ContextFunnel", () => {
  it("states each drop against the stage it came from, not the total", () => {
    render(<ContextFunnel stages={STAGES} tokens={184_000} />);

    // 331 of 842, then 200 of 511. Against the total those would read 39.3% and
    // 23.8%, which is the mistake this asserts against.
    expect(screen.getByText(/minus 331, no readable text \(39\.3%\)/)).toBeInTheDocument();
    expect(screen.getByText(/minus 200, excluded by default \(39\.1%\)/)).toBeInTheDocument();
  });

  it("keeps the token figure off the file scale and averages per kept file", () => {
    render(<ContextFunnel stages={STAGES} tokens={184_000} />);

    expect(screen.getByText("unit changes, files to tokens")).toBeInTheDocument();
    expect(screen.getByText("184,000")).toBeInTheDocument();
    // 184,000 / 311 kept files, not / 842 found.
    expect(screen.getByText(/592 tokens per file, average/)).toBeInTheDocument();
  });

  it("splits the single bar into kept plus every reduction, reading outward", () => {
    render(<ContextFunnel form="one-bar" stages={STAGES} tokens={184_000} />);

    expect(screen.getByText(/311/)).toBeInTheDocument();
    expect(screen.getByText(/kept, 36\.9%/)).toBeInTheDocument();
    expect(screen.getByText(/excluded by default/)).toBeInTheDocument();
    expect(screen.getByText(/no readable text/)).toBeInTheDocument();
  });

  it("hides the model tail when no model is selected", () => {
    const { rerender } = render(<ContextFunnel stages={STAGES} tokens={184_000} />);
    expect(screen.queryByText(/of the window/)).not.toBeInTheDocument();

    rerender(
      <ContextFunnel
        stages={STAGES}
        tokens={184_000}
        model={{ name: "gpt-5.1", contextShare: 0.184, inputCost: 0.08 }}
      />,
    );
    expect(screen.getByText("18.4% of the window")).toBeInTheDocument();
    expect(screen.getByText("0.08 USD per send")).toBeInTheDocument();
  });

  it("bounds a tail too small for its own scale instead of printing zero", () => {
    // A reader's own drop is often a few hundred tokens, where both figures
    // round to nothing and "0.0% / 0.00 USD" reads as a broken readout.
    render(
      <ContextFunnel
        stages={STAGES}
        tokens={173}
        model={{ name: "Claude Sonnet 5", contextShare: 0.000173, inputCost: 0.0000605 }}
      />,
    );
    expect(screen.getByText("<0.1% of the window")).toBeInTheDocument();
    expect(screen.getByText("<0.01 USD per send")).toBeInTheDocument();
    expect(screen.queryByText(/0\.0% of the window/)).not.toBeInTheDocument();
  });

  it("survives a folder where nothing was filtered out", () => {
    const flat = [
      { label: "files found", value: 54 },
      { label: "text eligible", value: 54 },
      { label: "kept after filters", value: 54 },
    ];
    render(<ContextFunnel stages={flat} tokens={1_240_000} note="no default filter matched" />);

    expect(screen.queryByText(/minus/)).not.toBeInTheDocument();
    expect(screen.getByText("no default filter matched")).toBeInTheDocument();
    expect(screen.getByText("1,240,000")).toBeInTheDocument();
  });
});

describe("CompositionBar", () => {
  const segments = [
    { label: "source", tokens: 84_600 },
    { label: "tests", tokens: 38_600 },
    { label: "lockfiles", tokens: 9_200, excluded: true },
  ];

  it("separates kept tokens from excluded ones", () => {
    render(<CompositionBar segments={segments} />);

    expect(screen.getByText("kept, 123,200 tokens")).toBeInTheDocument();
    expect(screen.getByText("9,200 excluded")).toBeInTheDocument();
    expect(screen.getByText("excluded by default")).toBeInTheDocument();
  });

  it("drops excluded categories from the total when they are hidden", () => {
    render(<CompositionBar segments={segments} showExcluded={false} />);

    // Shares now divide by 123,200 rather than 132,400.
    expect(screen.getByText("kept, 123,200 tokens")).toBeInTheDocument();
    expect(screen.queryByText("excluded by default")).not.toBeInTheDocument();
    expect(screen.getByText("2 categories")).toBeInTheDocument();
  });
});

describe("Method", () => {
  const props = {
    dataset: "62 public repositories, selection rule stated in the article",
    sample: "48,200 files, 19.4M raw tokens",
    measured: "2026-09-14",
    build: "v2.8.1 at 4f19c2a",
    tokenizer: "o200k_base",
    script: "scripts/measure-composition.ts",
    excludes: "Does not measure model accuracy.",
  };

  it("shortens each field to its first clause in the compact form", () => {
    const { container } = render(<Method {...props} compact />);

    expect(screen.getByText("62 public repositories")).toBeInTheDocument();
    expect(screen.getByText("48,200 files")).toBeInTheDocument();
    // Four labelled fields on a grid: the single line orphaned its last value
    // between about 400px and 620px, and a grid cannot.
    for (const label of ["dataset", "sample", "tokenizer", "measured"]) {
      expect(within(container).getByText(label)).toBeInTheDocument();
    }
    expect(within(container).getByRole("link", { name: "Read the full method" })).toHaveAttribute(
      "href",
      "#method",
    );
  });

  it("splits a field that opens with a sentence rather than a value", () => {
    render(<Method {...props} tokenizer="Not applicable. Recovered text, not tokens." compact />);

    expect(screen.getByText("Not applicable")).toBeInTheDocument();
  });

  it("points the compact link at the id the full block actually renders", () => {
    // The id used to be a prop, and a post that gave the compact form one value
    // and the full block another shipped a link to nothing. Both published
    // research posts did exactly that.
    const compact = render(<Method {...props} compact />);
    const href = within(compact.container)
      .getByRole("link", { name: "Read the full method" })
      .getAttribute("href");

    const full = render(<Method {...props} />);

    expect(href).toBe("#method");
    expect(full.container.querySelector(href!)).not.toBeNull();
  });

  it("carries all seven fields in the full form", () => {
    render(<Method {...props} />);

    for (const label of [
      "dataset",
      "sample",
      "measured",
      "build",
      "tokenizer",
      "script",
      "excludes",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText(props.dataset)).toBeInTheDocument();
  });
});

describe("Payoff", () => {
  const rows = [
    {
      lead: "Your repository probably does not fit where you think",
      body: "Half of the 60 land between 80,477 and 1,366,894 tokens. Only 35% fit a 128,000 token window.",
      action: "Count yours before you pick a model",
    },
    { lead: "Nothing to do about this one", body: "The spread is 0.24% to 1.13%." },
  ];

  it("sets measured values in mono and leaves incidental counts alone", () => {
    const { container } = render(<Payoff rows={rows} />);

    const mono = [...container.querySelectorAll("span.font-mono")].map((n) => n.textContent);
    expect(mono).toEqual(expect.arrayContaining(["80,477", "1,366,894", "35%", "128,000"]));
    // "60" in "Half of the 60" is a count inside a sentence, not a measurement.
    expect(mono).not.toContain("60");
  });

  it("renders a row with no action without leaving an empty rule behind", () => {
    const { container } = render(<Payoff rows={rows} />);

    expect(screen.getByText("Count yours before you pick a model")).toBeInTheDocument();
    expect(container.querySelectorAll("span.bg-primary")).toHaveLength(1);
  });
});

describe("FitCurve", () => {
  // Two decades apart, so a log axis and a linear one disagree loudly.
  const values = [10_000, 100_000, 1_000_000];
  const thresholds = [
    { label: "128K window", value: 128_000 },
    { label: "1M window", value: 1_000_000 },
  ];

  it("counts what fits each window from the values, never from a prop", () => {
    render(<FitCurve label="3 repositories" values={values} thresholds={thresholds} />);

    // 10,000 and 100,000 clear a 128K window; all three clear 1M.
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    expect(screen.getByText("3 of 3")).toBeInTheDocument();
  });

  it("places a row by log position rather than by rank", () => {
    const { container } = render(
      <FitCurve label="3 repositories" values={values} thresholds={thresholds} />,
    );

    const bars = [...container.querySelectorAll("span.rounded-r-\\[1px\\]")].map((n) =>
      Number.parseFloat((n as HTMLElement).style.width),
    );

    // Decades 4, 5 and 6 on an axis running 10^4 to 10^6: 0%, 50%, 100%.
    // Ranked evenly they would be 33/67/100.
    expect(bars).toHaveLength(3);
    expect(bars[1]).toBeCloseTo(50, 0);
    expect(bars[2]).toBeCloseTo(100, 0);
  });

  it("sorts the reader's own row into the data and says what it clears", () => {
    render(
      <FitCurve label="Your folder" values={values} thresholds={thresholds} you={412_088} />,
    );

    expect(screen.getByText("412,088")).toBeInTheDocument();
    expect(
      screen.getByText(/bigger than 2 of the 3 repositories we measured/),
    ).toBeInTheDocument();
    // 412,088 clears 1M and misses 128K, and each lands in its own column.
    // Scoped to the readout: "1M" is also a decade tick on the axis.
    const readout = screen.getByText("fits").parentElement!.parentElement!;
    expect(within(readout).getByText("1M")).toBeInTheDocument();
    expect(within(readout).getByText("128K")).toBeInTheDocument();
  });

  it("keeps a threshold label attached to its own line at both anchors", () => {
    const { container } = render(
      <FitCurve label="3 repositories" values={values} thresholds={thresholds} />,
    );

    // A label past the midpoint is anchored by its right edge so it grows back
    // into the plot; anchoring every label the same way ran the last two off
    // the figure at 358px.
    const labels = [...container.querySelectorAll("span.absolute.whitespace-nowrap")] as HTMLElement[];
    expect(labels).toHaveLength(2);
    for (const label of labels) {
      expect(label.style.left === "" ? label.style.right : label.style.left).not.toBe("");
    }
  });
});

describe("UnitFlip", () => {
  it("draws both units from the same row and keeps the verdict inside the figure", () => {
    const { container } = render(
      <UnitFlip
        label="The same exclusion, counted two ways"
        units={["share of excluded files", "share of excluded tokens"]}
        rows={[{ label: "hidden files", a: 0.631, b: 0.057, note: "fired in 58 of 60" }]}
        verdict="Count files and the filter drops dotfiles."
      />,
    );

    expect(screen.getAllByText("63.1%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("5.7%").length).toBeGreaterThan(0);
    expect(screen.getByText("Count files and the filter drops dotfiles.")).toBeInTheDocument();

    const widths = [...container.querySelectorAll("span[style*='width']")].map(
      (n) => (n as HTMLElement).style.width,
    );
    expect(widths).toContain("63.1%");
    expect(widths).toContain("5.7%");
  });
});

describe("StatusGrid", () => {
  const groups = [
    {
      format: "pdf",
      items: [
        { id: "pdf-1.1", severity: "broken" as const, status: "fixed" as const, structure: "A" },
        { id: "pdf-1.7", severity: "broken" as const, status: "open" as const, structure: "B" },
      ],
    },
    {
      format: "xlsx",
      items: [
        { id: "xlsx-4.1", severity: "broken" as const, status: "open" as const, structure: "C" },
      ],
    },
  ];

  it("counts open and fixed from the items rather than from a prop", () => {
    render(<StatusGrid label="3 defects re-tested" groups={groups} />);

    expect(screen.getByText("2 still open")).toBeInTheDocument();
    expect(screen.getByText("1 fixed, 2 open")).toBeInTheDocument();
  });

  it("leads with the open defects and holds the closed ones behind a disclosure", () => {
    const { container } = render(<StatusGrid label="3 defects re-tested" groups={groups} />);

    // The three open ones are the finding; the closed list is evidence and sits
    // in a `details` so it is in the HTML without being in the way.
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details!.open).toBe(false);
    expect(within(details!).getByText("pdf-1.1")).toBeInTheDocument();
    expect(screen.getByText("pdf-1.7")).toBeInTheDocument();
    expect(screen.getByText("xlsx-4.1")).toBeInTheDocument();
  });

  it("leaves a group with nothing closed out of the per-format line", () => {
    render(<StatusGrid label="3 defects re-tested" groups={groups} />);

    // "xlsx 0" reads as a count that failed rather than a group with nothing
    // closed in it.
    expect(screen.getByText("pdf 1")).toBeInTheDocument();
    expect(screen.queryByText(/xlsx 0/)).toBeNull();
  });

  it("keeps the standing guard out of the count", () => {
    render(
      <StatusGrid
        label="3 defects re-tested"
        groups={groups}
        guard={{ id: "docx-3.1", structure: "A tracked deletion reaching the bundle" }}
      />,
    );

    expect(screen.getByText("A tracked deletion reaching the bundle")).toBeInTheDocument();
    expect(screen.getByText("separate, not counted in the 3")).toBeInTheDocument();
    // Still three tracked items, not four.
    expect(screen.getByText("1 fixed, 2 open")).toBeInTheDocument();
  });
});

describe("ReaderDuel", () => {
  const rows = [
    {
      structure: "Two-column page, natural stream order",
      a: { text: "recovers", kind: "recovered" as const },
      b: { text: "recovers", kind: "recovered" as const },
      verdict: "Both read the columns in order.",
    },
    {
      structure: "Two-column page, adversarial stream order",
      a: { text: "recovers", kind: "recovered" as const },
      b: { text: "loses", kind: "lost" as const },
      verdict: "A library difference.",
    },
    {
      structure: "Superscript footnote marker",
      a: { text: "loses", kind: "lost" as const },
      b: { text: "not attributable", kind: "absent" as const, note: "its own output was corrupt" },
      verdict: "Nothing is scored here.",
    },
  ];

  it("gives a disagreement the panel and an agreement one line", () => {
    const { container } = render(
      <ReaderDuel label="Two readers" readers={["FileConcat", "pypdf 6.14.2"]} rows={rows} />,
    );

    // The row where both readers succeed collapses onto the quiet surface and
    // never repeats the structure as a heading.
    expect(screen.getByText("agree")).toBeInTheDocument();
    expect(container.querySelectorAll("div.bg-surface-alt")).toHaveLength(1);
    expect(container.querySelectorAll("div.bg-surface-inset")).toHaveLength(2);
  });

  it("counts disagreement and refusal separately in the header", () => {
    render(<ReaderDuel label="Two readers" readers={["FileConcat", "pypdf 6.14.2"]} rows={rows} />);

    // A row nobody can be credited for is not a disagreement.
    expect(screen.getByText("1 of 3 disagree / 1 not attributable")).toBeInTheDocument();
  });

  it("gives a refused comparison the only cell that carries its reason", () => {
    render(<ReaderDuel label="Two readers" readers={["FileConcat", "pypdf 6.14.2"]} rows={rows} />);

    expect(screen.getByText("not attributable")).toBeInTheDocument();
    expect(screen.getByText("its own output was corrupt")).toBeInTheDocument();
  });

  it("fills every scored outcome instead of outlining it", () => {
    const { container } = render(
      <ReaderDuel label="Two readers" readers={["FileConcat", "pypdf 6.14.2"]} rows={rows} />,
    );

    // Outlined chips made agreement and disagreement look identical, which was
    // the whole defect.
    expect(container.querySelectorAll("p.bg-primary")).toHaveLength(1);
    expect(container.querySelectorAll("p.bg-info")).toHaveLength(2);
  });
});

describe("Checklist", () => {
  it("numbers the checks and carries nothing interactive", () => {
    const { container } = render(
      <Checklist
        label="Before you trust an extracted document"
        items={[
          { check: "Open a date column", why: "A date can arrive as 46037" },
          { check: "Count the pages", why: "A scan can vanish with no note" },
        ]}
      />,
    );

    expect(screen.getByText("2 checks, done by hand, in your own output")).toBeInTheDocument();
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(container.querySelectorAll("input, button")).toHaveLength(0);
  });
});

describe("SectionBoundary", () => {
  it("carries the compile-time counter and keeps the heading addressable", () => {
    render(
      <SectionBoundary id="what-it-costs" data-index="04" data-total="12">
        What the format actually costs
      </SectionBoundary>,
    );

    const heading = screen.getByRole("heading", { name: "What the format actually costs" });
    expect(heading).toHaveAttribute("id", "what-it-costs");
    expect(screen.getByText("04")).toBeInTheDocument();
    expect(screen.getByText(/of 12/)).toBeInTheDocument();
  });

  it("renders without a counter when the numbering plugin did not run", () => {
    render(<SectionBoundary id="lookup">A docs heading</SectionBoundary>);

    expect(screen.getByRole("heading", { name: "A docs heading" })).toBeInTheDocument();
    expect(screen.queryByText(/of \d+/)).toBeNull();
  });
});

describe("Contents", () => {
  const sections = [
    { index: "01", id: "one", text: "What a bundle is" },
    { index: "02", id: "two", text: "How we counted" },
    { index: "03", id: "three", text: "What it costs" },
  ];

  it("links every section and spells the count out beside the digit minutes", () => {
    render(
      <OutlineProvider value={{ sections, readingMinutes: 12 }}>
        <Contents />
      </OutlineProvider>,
    );

    expect(screen.getByText("three sections / 12 min")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "How we counted" })).toHaveAttribute("href", "#two");
  });

  it("renders nothing for a post with no sections", () => {
    const { container } = render(
      <OutlineProvider value={{ sections: [], readingMinutes: 4 }}>
        <Contents />
      </OutlineProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe("Stopper", () => {
  it("sets a figure larger than a phrase so both hold two lines on a phone", () => {
    const figure = render(<Stopper value="246,424">Tokens in the median repository.</Stopper>);
    const phrase = render(<Stopper value="3 of 16 still open">Defects still open.</Stopper>);

    expect(figure.container.querySelector("p")!.className).toContain("sm:text-[76px]");
    expect(phrase.container.querySelector("p")!.className).toContain("sm:text-[60px]");
  });

  it("uses amber only when asked and never a panel", () => {
    const { container } = render(
      <Stopper value="3.5%" tone="warn" source="median across 60 clones">
        All the default filters remove.
      </Stopper>,
    );

    expect(container.querySelector("p")!.className).toContain("text-info");
    expect(screen.getByText("median across 60 clones")).toBeInTheDocument();
    // Rules above and below, no border box, so it never reads as a figure.
    expect(container.querySelector("figure")!.className).toContain("border-y");
  });
});

describe("PaneDiff", () => {
  const panes = [
    {
      reader: "FileConcat",
      verdict: "columns kept",
      footer: "left column intact, then right",
      text: "Left column line 1.\nRight column line 1.",
    },
    {
      reader: "pypdf 6.14.2",
      verdict: "columns interleaved",
      footer: "one line from each column",
      text: "Left column line 1.\nRight column line 1.",
    },
  ] as const;

  it("tints a line by the column it came from and never points one pane at the other", () => {
    const { container } = render(
      <PaneDiff
        file="two-column-adversarial.pdf"
        mark="Right column"
        legend={["line from the left column", "line from the right column"]}
        total={36}
        panes={[...panes] as never}
      />,
    );

    // One tinted line per pane, and no arrow: the arrow read as "we compress
    // this file", which is the opposite of the finding.
    const tinted = [...container.querySelectorAll("div")].filter((n) =>
      n.className.includes("bg-[oklch(var(--neutral-info)/0.16)]"),
    );
    expect(tinted).toHaveLength(2);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.textContent).not.toMatch(/->|=>/);
  });

  it("says how much of the real output it is showing", () => {
    render(
      <PaneDiff
        file="two-column-adversarial.pdf"
        mark="Right column"
        legend={["left", "right"]}
        total={36}
        panes={[...panes] as never}
      />,
    );

    expect(screen.getAllByText(/2 of 36 lines/)).toHaveLength(2);
  });

  it("wraps a long line instead of scrolling it sideways", () => {
    const { container } = render(
      <PaneDiff
        file="f.pdf"
        mark="Right column"
        legend={["left", "right"]}
        panes={[...panes] as never}
      />,
    );

    for (const pane of container.querySelectorAll("div.overflow-hidden")) {
      expect(pane.className).not.toContain("overflow-x-auto");
    }
    expect(container.querySelector("span.whitespace-pre-wrap")!.className).toContain("break-words");
  });
});
