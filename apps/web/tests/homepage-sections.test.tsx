import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { formatCost } from "@fileconcat/core";
import type { FilteredModel } from "@fileconcat/core";

import { FitBars } from "~/components/app/marketing/fit-bars";
import { OutputSection } from "~/components/app/marketing/output-section";
import { ResearchSection } from "~/components/app/marketing/research-section";
import { defaultCatalogueModel, pickDefaultModel, sortNewestFirst } from "~/lib/default-model";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    ...rest
  }: {
    children: React.ReactNode;
    to: string;
    params?: Record<string, string>;
  }) => (
    <a href={params ? to.replace("$slug", params.slug) : to} {...rest}>
      {children}
    </a>
  ),
}));

// The blog module globs MDX, which the test pipeline cannot transform, so the
// research query is stubbed with six posts already in the order it returns.
const RESEARCH = ["2026-09-09", "2026-09-07", "2026-09-07", "2026-08-31", "2026-08-15", "2026-07-11"].map(
  (date, i) => ({
    slug: `study-${i}`,
    frontmatter: { title: `Study ${i}`, description: "", date, draft: false, kind: "research" },
    Content: () => null,
    sections: [],
    readingMinutes: 1,
  }),
);
vi.mock("~/lib/blog", () => ({ getResearchPosts: () => RESEARCH }));

/**
 * Three homepage figures derive what they show instead of stating it. The fit
 * counts come off the measured bundle sizes, the research list comes off the
 * blog glob, and the export readout prices its sample at the tool's own
 * default model from the shipped catalogue, so a new study or a catalogue
 * refresh reaches the page on the deploy that ships it.
 */

describe("FitBars", () => {
  it("reads every window count off the data, not off a prop", () => {
    render(<FitBars />);

    // The published counts for 128K, 200K and 1M. Each appears twice: once in
    // the phone legend and once as the in-plot label.
    expect(screen.getAllByText("21 of 60")).toHaveLength(2);
    expect(screen.getAllByText("24 of 60")).toHaveLength(2);
    expect(screen.getAllByText("41 of 60")).toHaveLength(2);
    expect(screen.getByText(/median 246,424 tokens/)).toBeInTheDocument();
    expect(screen.getByText("5,717 tokens")).toBeInTheDocument();
    expect(screen.getByText("9,373,193 tokens")).toBeInTheDocument();
  });
});

describe("ResearchSection", () => {
  it("lists the research posts it is given, newest first, five at most", () => {
    render(<ResearchSection />);

    const links = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href")?.startsWith("/blog/"));
    expect(links.map((a) => a.getAttribute("href"))).toEqual(
      RESEARCH.slice(0, 5).map((p) => `/blog/${p.slug}`),
    );
    expect(screen.queryByText("Study 5")).not.toBeInTheDocument();
    expect(screen.getAllByText("2026-09-07")).toHaveLength(2);
  });
});

function model(name: string, releaseDate: string | undefined, inputCost = 1): FilteredModel {
  return {
    uid: `test/${name}`,
    name,
    providerId: "test",
    providerName: "Test Provider",
    contextLimit: 200_000,
    outputLimit: 8192,
    inputCost,
    outputCost: inputCost * 4,
    hasReasoning: false,
    hasToolCall: false,
    releaseDate,
  };
}

describe("pickDefaultModel", () => {
  it("takes the newest Sonnet over a newer non-Sonnet, and the newest model when none is listed", () => {
    const sorted = sortNewestFirst([
      model("Old Sonnet", "2025-01-01"),
      model("Undated", undefined),
      model("Claude Sonnet 5", "2026-06-30"),
      model("Newest Opus", "2026-08-01"),
    ]);
    expect(sorted.map((m) => m.name)).toEqual([
      "Newest Opus",
      "Claude Sonnet 5",
      "Old Sonnet",
      "Undated",
    ]);
    expect(pickDefaultModel(sorted)?.name).toBe("Claude Sonnet 5");
    expect(pickDefaultModel(sorted.slice(0, 1))?.name).toBe("Newest Opus");
    expect(pickDefaultModel([])).toBeNull();
  });
});

describe("OutputSection", () => {
  it("prices the sample bundle at the catalogue's default model, not at a typed string", () => {
    const chosen = defaultCatalogueModel();
    expect(chosen).not.toBeNull();
    render(<OutputSection />);

    expect(screen.getByText(`at ${chosen!.name}'s input price, from the live catalogue`)).toBeInTheDocument();
    expect(screen.getByText(formatCost((48_212 / 1_000_000) * chosen!.inputCost))).toBeInTheDocument();
    // Nothing on the readout imitates the result screen's controls.
    expect(screen.queryByText("Copy")).not.toBeInTheDocument();
    expect(screen.queryByText("Download")).not.toBeInTheDocument();
  });
});
