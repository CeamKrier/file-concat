import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FileGroups, type FileGroup } from "~/components/app/result-view";

const groups: FileGroup[] = [
  {
    key: "extracted",
    count: 42,
    label: "extracted",
    tone: "quiet",
    lead: "Text was pulled out of a document.",
    items: [{ name: "report.pdf" }],
  },
  {
    key: "left-out",
    count: 1,
    label: "left out",
    tone: "warn",
    lead: "Nothing readable inside.",
    items: [{ name: "Inter.woff2", why: "Font file" }],
  },
];

/**
 * The counts are the controls. A visitor on 2026-09-11 clicked the sentence
 * three times and the "Open a group to see which files, and why." line four
 * times before finding them, so that line is gone and the chips carry the
 * disclosure state themselves.
 */
describe("the file groups row", () => {
  it("carries no instruction that reads as a control", () => {
    render(<FileGroups groups={groups} total={43} isGap={false} />);
    expect(screen.getByText("43 files did not come through as plain text.")).toBeInTheDocument();
    expect(screen.queryByText(/Open a group/)).toBeNull();
  });

  it("opens a group from its chip, which is a real button with a state", () => {
    render(<FileGroups groups={groups} total={43} isGap={false} />);
    const chip = screen.getByRole("button", { name: /1\s*left out/ });
    expect(chip).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Inter.woff2")).toBeInTheDocument();
    expect(screen.getByText("Font file")).toBeInTheDocument();
    fireEvent.click(chip);
    expect(screen.queryByText("Inter.woff2")).toBeNull();
  });
});
