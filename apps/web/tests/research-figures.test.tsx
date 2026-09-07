import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CompositionBar } from "~/components/blog/composition-bar";
import { ContextFunnel } from "~/components/blog/context-funnel";
import { Method } from "~/components/blog/method";

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
    expect(within(container).getByRole("link", { name: "full method" })).toHaveAttribute(
      "href",
      "#method",
    );
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
