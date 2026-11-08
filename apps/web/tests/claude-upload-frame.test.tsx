import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/lib/metrics", () => ({ track: vi.fn() }));

import { ClaudeUploadFrame } from "~/components/how-to/claude-upload-frame";
import { recordExampleStep, resetExampleStepsForTest } from "~/lib/example-step";
import { track } from "~/lib/metrics";

beforeEach(() => {
  resetExampleStepsForTest();
  vi.mocked(track).mockClear();
});

describe("example_step counter", () => {
  it("sends seen at most once per page load", () => {
    recordExampleStep("seen");
    recordExampleStep("seen");
    expect(vi.mocked(track).mock.calls).toEqual([["example_step", "seen"]]);
  });
});

describe("Express example band", () => {
  it("shows the cap and the one-file answer with nothing to click", () => {
    render(<ClaudeUploadFrame cap={20} />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "Claude takes 20 files per chat. FileConcat makes your whole repository one.",
    );
    expect(
      screen.getByText("Only 20 files fit in a chat. The first 20 were attached, the other 189 were dropped."),
    ).toBeInTheDocument();
    expect(screen.getByText("Uploaded. All 209 files are in this one attachment.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    // No view yet (jsdom has no IntersectionObserver), so nothing is counted.
    expect(track).not.toHaveBeenCalled();
  });

  it("counts seen only once half the watched panel is in view", () => {
    let fire: (ratio: number) => void = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: IntersectionObserverCallback) {
          fire = (ratio) =>
            cb([{ isIntersecting: ratio > 0, intersectionRatio: ratio } as IntersectionObserverEntry], this as never);
        }
        observe() {}
        disconnect() {}
      },
    );
    try {
      render(<ClaudeUploadFrame cap={20} />);
      fire(0.1);
      expect(track).not.toHaveBeenCalled();
      fire(0.6);
      fire(0.9);
      expect(vi.mocked(track).mock.calls).toEqual([["example_step", "seen"]]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
