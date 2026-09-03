import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ProcessingView } from "~/components/app/processing-view";

const STEPS = [
  { label: "Scanning files", state: "done" as const },
  { label: "Preparing files", state: "active" as const },
  { label: "Reading files", state: "pending" as const },
];

describe("ProcessingView", () => {
  it("marks the running stage and hangs the live count on it", () => {
    render(<ProcessingView heading="" detail="88 / 227 files" steps={STEPS} />);

    const rows = screen.getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      "Scanning files",
      "Preparing files88 / 227 files",
      "Reading files",
    ]);
    expect(rows[1]).toHaveAttribute("aria-current", "step");
  });

  it("keeps heading and detail on their own when there is no rail to carry them", () => {
    render(<ProcessingView heading="Downloading files" detail="3 / 9 files" />);

    expect(screen.getByRole("heading", { name: "Downloading files" })).toBeInTheDocument();
    expect(screen.getByText("3 / 9 files")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
