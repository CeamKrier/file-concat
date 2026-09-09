import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { FilteredModel } from "@fileconcat/core";

import { ContextWindowCosts } from "~/components/context-window-costs";
import { formatWindow, summarize } from "~/lib/context-window-costs";

/**
 * The page publishes prices, so the arithmetic is the thing worth guarding: a
 * per-million rate charged against a context size, over the models that can
 * actually accept it. The rendered assertions stay off the live catalogue's
 * values, which change on every build, and only check the shape a crawler has
 * to receive without running a click.
 */

function model(name: string, contextLimit: number, inputCost: number): FilteredModel {
  return {
    uid: `test/${name}`,
    name,
    providerId: "test",
    providerName: "Test Provider",
    contextLimit,
    outputLimit: 8192,
    inputCost,
    outputCost: inputCost * 4,
    hasReasoning: false,
    hasToolCall: false,
  };
}

const FIXTURE = [
  model("too small", 128_000, 0.5),
  model("cheap", 1_000_000, 1),
  model("mid", 2_000_000, 3),
  model("dear", 1_048_576, 10),
  model("middling", 1_000_000, 5),
];

describe("summarize", () => {
  const summary = summarize(FIXTURE, 500_000);

  it("drops models that cannot accept the context rather than pricing them", () => {
    expect(summary.fitting.map((row) => row.model.name)).toEqual([
      "cheap",
      "mid",
      "middling",
      "dear",
    ]);
  });

  it("charges the per-million rate against the context size", () => {
    // 500,000 tokens is half a million, so every rate is halved.
    expect(summary.fitting.map((row) => row.cost)).toEqual([0.5, 1.5, 2.5, 5]);
  });

  it("takes the mean of the two middle values for an even sample", () => {
    // 0.5, 1.5, 2.5, 5 -> the middles are 1.5 and 2.5, not 2.5 alone.
    expect(summary.middle).toBe(2);
    expect(summary.cheapest).toBe(0.5);
    expect(summary.dearest).toBe(5);
  });

  it("reports zero rather than throwing when nothing fits", () => {
    const empty = summarize(FIXTURE, 4_000_000);
    expect(empty.fitting).toEqual([]);
    expect(empty.middle).toBe(0);
    expect(empty.dearest).toBe(0);
  });
});

describe("formatWindow", () => {
  it("keeps a window legible without dropping the part that differs", () => {
    expect(formatWindow(1_000_000)).toBe("1M");
    expect(formatWindow(1_048_576)).toBe("1.05M");
    expect(formatWindow(131_072)).toBe("131K");
    expect(formatWindow(200_000)).toBe("200K");
  });
});

describe("ContextWindowCosts", () => {
  it("renders every context size without an interaction", () => {
    render(<ContextWindowCosts />);

    // A crawler never clicks, so all four headline rows have to be in the first
    // render. Only the detail table below them follows the selection.
    for (const label of ["100K", "246K", "500K", "1M"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }

    expect(screen.getByRole("button", { name: "246K" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1M" })).toHaveAttribute("aria-pressed", "false");
  });

  it("prices the detail table against the selected size", () => {
    render(<ContextWindowCosts />);

    // 246,424 rather than a round number: filling exactly 1,000,000 tokens costs
    // the per-million rate, so that bucket would render two identical columns.
    expect(
      screen.getByRole("heading", { name: /models accept 246,424 tokens/ }),
    ).toBeInTheDocument();
  });
});
