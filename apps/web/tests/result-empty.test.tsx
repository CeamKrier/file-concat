import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResultEmpty } from "~/components/app/result-empty";
import { emptyKindFor } from "~/components/app/empty-kind";

/**
 * A drop of nothing but scanned documents combines zero files, so it lands on
 * the empty state rather than the result screen — and the offer to read them
 * used to live only on the result screen. Recognition was unreachable in the
 * one case it exists for. Both halves of the route are pinned here.
 */
describe("the scanned rescue", () => {
  it("outranks every other reading of the drop", () => {
    expect(emptyKindFor(["scan.pdf"], 1)).toBe("scanned");
    // Even when the drop would otherwise read as images or an archive: those
    // are dead ends, and this one is not.
    expect(emptyKindFor(["page.png", "page2.png", "scan.pdf"], 1)).toBe("scanned");
    expect(emptyKindFor(["stuff.7z", "scan.pdf"], 1)).toBe("scanned");
  });

  it("leaves the other rescues alone when nothing can be recognised", () => {
    expect(emptyKindFor(["stuff.7z"], 0)).toBe("archive");
    expect(emptyKindFor(["a.png", "b.jpg"], 0)).toBe("image");
    expect(emptyKindFor(["mystery.bin"], 0)).toBe("other");
    expect(emptyKindFor([], 0)).toBe("other");
  });

  it("yields to nothing, but outranks the filters", () => {
    expect(emptyKindFor(["scan.pdf"], 1, 4)).toBe("scanned");
  });
});

/**
 * The drop that is not broken at all: readable files, every one of them eaten
 * by a pattern. Calling those binary was a lie, and Start over would have
 * dropped the same files into the same filters.
 */
describe("the filtered rescue", () => {
  it("outranks what the files look like, but only when a row can be re-included", () => {
    expect(emptyKindFor(["a.min.js", "b.png"], 0, 1)).toBe("filtered");
    expect(emptyKindFor(["a.png", "b.jpg"], 0, 0)).toBe("image");
  });

  it("leads with the drawer and keeps starting over underneath", async () => {
    const onAdjust = vi.fn();
    const onStartOver = vi.fn();
    render(
      <ResultEmpty
        droppedFiles={["bundle.min.js"]}
        kind="filtered"
        onStartOver={onStartOver}
        onAdjust={onAdjust}
      />,
    );

    await act(async () =>
      screen.getByRole("button", { name: /adjust what's included/i }).click(),
    );
    expect(onAdjust).toHaveBeenCalledOnce();
    await act(async () => screen.getByRole("button", { name: /start over/i }).click());
    expect(onStartOver).toHaveBeenCalledOnce();
  });

  it("offers the drawer under the other rescues too", () => {
    render(
      <ResultEmpty
        droppedFiles={["a.png"]}
        kind="image"
        onStartOver={() => {}}
        onAdjust={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /adjust what's included/i })).toBeTruthy();
  });

  it("never offers a drawer with nothing in it", () => {
    render(<ResultEmpty droppedFiles={["a.png"]} kind="image" onStartOver={() => {}} />);
    expect(screen.queryByRole("button", { name: /adjust/i })).toBeNull();
  });

  it("reports the read already running, and offers the way out of it", async () => {
    const onStopReading = vi.fn();
    render(
      <ResultEmpty
        droppedFiles={["a.pdf", "b.pdf"]}
        kind="scanned"
        onStartOver={() => {}}
        isReading
        readProgress={{ done: 0, total: 2 }}
        onRead={vi.fn()}
        onStopReading={onStopReading}
      />,
    );

    // Nobody is asked to start it: the pass began with the drop.
    expect(screen.queryByRole("button", { name: /read the rest/i })).toBeNull();
    expect(screen.getByText(/reading 1 of 2/i)).toBeTruthy();

    await act(async () => screen.getByRole("button", { name: /stop reading/i }).click());
    expect(onStopReading).toHaveBeenCalledOnce();
  });

  it("offers the way back in after a stop", async () => {
    const onRead = vi.fn().mockResolvedValue(1);
    render(
      <ResultEmpty
        droppedFiles={["scan.pdf"]}
        kind="scanned"
        onStartOver={() => {}}
        stoppedReading
        onRead={onRead}
      />,
    );

    await act(async () => screen.getByRole("button", { name: /read the rest/i }).click());
    expect(onRead).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /start over/i })).toBeTruthy();
  });

  it("says so plainly when recognition found nothing either", () => {
    render(
      <ResultEmpty
        droppedFiles={["scan.pdf"]}
        kind="scanned"
        onStartOver={() => {}}
        onRead={vi.fn()}
      />,
    );
    expect(screen.getByText(/found no writing/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /read the rest/i })).toBeNull();
  });

  it("does not offer a read the flow cannot run", () => {
    render(<ResultEmpty droppedFiles={["a.png"]} kind="image" onStartOver={() => {}} />);
    expect(screen.queryByRole("button", { name: /read/i })).toBeNull();
  });
});
