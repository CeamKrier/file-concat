import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { SegmentedControl } from "~/components/app/segmented-control";

function Harness() {
  const [value, setValue] = useState<"a" | "b" | "c">("a");
  return (
    <SegmentedControl
      options={[
        { value: "a", label: "A" },
        { value: "b", label: "B" },
        { value: "c", label: "C" },
      ]}
      value={value}
      onChange={setValue}
      ariaLabel="Pick"
    />
  );
}

describe("SegmentedControl keyboard", () => {
  it("is one tab stop and the arrow keys move the choice and the focus", () => {
    render(<Harness />);
    const [a, b, c] = screen.getAllByRole("radio");
    expect([a, b, c].map((r) => r.tabIndex)).toEqual([0, -1, -1]);

    a.focus();
    fireEvent.keyDown(a, { key: "ArrowRight" });
    expect(b).toHaveAttribute("aria-checked", "true");
    expect(b).toHaveFocus();
    expect([a, b, c].map((r) => r.tabIndex)).toEqual([-1, 0, -1]);

    fireEvent.keyDown(b, { key: "ArrowLeft" });
    fireEvent.keyDown(a, { key: "ArrowLeft" });
    expect(c).toHaveAttribute("aria-checked", "true");
    expect(c).toHaveFocus();
  });
});
