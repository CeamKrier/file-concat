import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResultEmpty } from "~/components/app/result-empty";
import { emptyKindFor, emptyReasonSlug } from "~/components/app/empty-kind";
import { normalizeValue } from "~/lib/metrics";

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
 * A drop of nothing but images. Not a dead end while the offer stands, and a
 * dead end the moment recognition has been over them and found nothing — which
 * is exactly when the old `image` copy becomes true (ADR-0017).
 */
describe("the image offer", () => {
  it("replaces the image dead end while the offer is untaken", () => {
    expect(emptyKindFor(["a.png", "b.jpg"], 0, 0, 2)).toBe("recognisable");
    // Spent: a pass looked and found nothing, so there is nothing left to offer.
    expect(emptyKindFor(["a.png", "b.jpg"], 0, 0, 0)).toBe("image");
  });

  it("yields to the rescues that are not about images", () => {
    expect(emptyKindFor(["scan.pdf", "a.png"], 1, 0, 1)).toBe("scanned");
    expect(emptyKindFor(["a.min.js", "a.png"], 0, 1, 1)).toBe("filtered");
  });

  it("opens the reading dialog rather than starting a pass on its own", async () => {
    const onOfferRead = vi.fn();
    render(
      <ResultEmpty
        droppedFiles={["shot.png"]}
        kind="recognisable"
        onStartOver={vi.fn()}
        onOfferRead={onOfferRead}
      />,
    );

    expect(screen.getByText("These are images")).toBeTruthy();
    await act(async () => {
      screen.getByRole("button", { name: /read them/i }).click();
    });
    expect(onOfferRead).toHaveBeenCalledTimes(1);
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

  // The default body names ignore patterns, .gitignore and the hidden/oversize
  // defaults. An include pattern excludes by not matching, so on that path every
  // one of those words is false, and the fix is the opposite gesture: widen a
  // list rather than remove a rule.
  it("names the include pattern instead of ignore rules when that is what did it", () => {
    const { rerender } = render(
      <ResultEmpty droppedFiles={["a.py"]} kind="filtered" onStartOver={() => {}} />,
    );
    expect(screen.getByText(/matched an ignore pattern/i)).toBeInTheDocument();

    rerender(
      <ResultEmpty droppedFiles={["a.py"]} kind="filtered" onStartOver={() => {}} byInclude />,
    );
    expect(screen.getByText(/an include pattern is on/i)).toBeInTheDocument();
    expect(screen.queryByText(/matched an ignore pattern/i)).not.toBeInTheDocument();
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

/**
 * The counter behind the screen. Every string here is produced somewhere else
 * (`use-filter-state`'s `excludeReason`, core's `validateFile`,
 * `use-file-ingestion`'s extract branch), so a rename over there lands as
 * `other` and this is what notices.
 */
describe("the empty-reason counter", () => {
  it("separates the three subtractions, which is the whole point of it", () => {
    expect(emptyReasonSlug("Outside include patterns")).toBe("include");
    expect(emptyReasonSlug("Matched ignore patterns")).toBe("ignore");
    expect(emptyReasonSlug("Matched .gitignore")).toBe("gitignore");
  });

  it("keeps the content refusals apart from the filters", () => {
    expect(emptyReasonSlug("Binary file")).toBe("binary");
    expect(emptyReasonSlug("Hidden file")).toBe("hidden");
    expect(emptyReasonSlug("No extractable text")).toBe("no-text");
    expect(emptyReasonSlug("Couldn't extract text")).toBe("extract-error");
    expect(emptyReasonSlug("Excluded manually")).toBe("manual");
  });

  it("counts an unknown reason instead of losing it", () => {
    expect(emptyReasonSlug(undefined)).toBe("other");
    expect(emptyReasonSlug("Something invented later")).toBe("other");
  });

  it("emits values the counter pipeline will actually accept", () => {
    // `normalizeValue` strips anything outside [a-z0-9._/+-] and drops a value
    // that ends up empty or over 32 chars, so a slug that fails it is a row
    // that never arrives.
    for (const reason of [
      "Outside include patterns",
      "Matched ignore patterns",
      "Matched .gitignore",
      "Excluded manually",
      "Hidden file",
      "Binary file",
      "No extractable text",
      "Couldn't extract text",
      undefined,
    ]) {
      const slug = emptyReasonSlug(reason);
      expect(normalizeValue(slug)).toBe(slug);
    }
  });
});
