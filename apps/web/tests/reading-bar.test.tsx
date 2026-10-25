import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { offersFor, passOutcome, ReadingBar } from "~/components/app/reading-bar";
import { GETTING_READER } from "~/hooks/use-file-ingestion";

const idle = { isReading: false, progress: null, isStopping: false, onStop: () => {} };

afterEach(() => {
  vi.useRealTimers();
});

describe("the reading bar while a pass runs", () => {
  it("drops a Stop press that lands right after it appears", async () => {
    // The double click that started the pass must not also end it.
    vi.useFakeTimers({ toFake: ["Date"] });
    const onStop = vi.fn();
    render(<ReadingBar {...idle} isReading progress={{ done: 0, total: 2 }} onStop={onStop} />);
    const stop = screen.getByRole("button", { name: "Stop reading" });

    fireEvent.click(stop);
    expect(onStop).not.toHaveBeenCalled();

    vi.setSystemTime(Date.now() + 1000);
    await act(async () => fireEvent.click(stop));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("names the download as its own stage, in the pass's language", () => {
    render(
      <ReadingBar
        {...idle}
        isReading
        progress={{ done: 0, total: 3, note: GETTING_READER }}
        language={{ name: "Turkish", fallback: false, size: "2.1 MB", onChange: () => {} }}
      />,
    );
    expect(screen.getByText("Getting the reader for Turkish.")).toBeInTheDocument();
    expect(screen.getByText(/A one-time 2.1 MB download for this language/)).toBeInTheDocument();
  });

  it("counts the file in hand and says the bundle is live", () => {
    render(<ReadingBar {...idle} isReading progress={{ done: 2, total: 2 }} />);
    // Clamped: the last file never reads "3 of 2".
    expect(screen.getByText("Reading 2 of 2.")).toBeInTheDocument();
    expect(screen.getByText(/Copy and Download take whatever is read so far/)).toBeInTheDocument();
  });
});

describe("the reading bar between passes", () => {
  it("renders nothing with no offer and no outcome", () => {
    const { container } = render(<ReadingBar {...idle} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says when English stands in for the browser's language", () => {
    const onChange = vi.fn();
    const offers = offersFor(
      { images: ["a.png"], speech: [], scans: [] },
      { previewed: 0, pagesLeft: null },
      false,
      vi.fn(),
    );
    render(
      <ReadingBar
        {...idle}
        offers={offers}
        language={{ name: "English", fallback: true, size: "3.0 MB", onChange }}
      />,
    );

    expect(
      screen.getByText(
        /Reads in English, since your browser's language has no reader here\. The reader is a one-time 3\.0 MB download\./,
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change language" }));
    expect(onChange).toHaveBeenCalledOnce();
  });
});

describe("offersFor", () => {
  it("offers each kind with the paths no pass has been over", () => {
    const read = vi.fn();
    const offers = offersFor(
      { images: ["a.png"], speech: ["b.mp3", "c.mp3"], scans: [] },
      { previewed: 0, pagesLeft: null },
      false,
      read,
    );
    expect(offers.map((offer) => offer.label)).toEqual(["Read text", "Transcribe"]);
    expect(offers[1].text).toMatch(/^2 recordings can be written out\..*66 MB for English/);
    offers[1].onRead();
    expect(read).toHaveBeenCalledWith(["b.mp3", "c.mp3"]);
  });

  // Scans past the auto-read caps (Q112 O1): the offer is stated in pages.
  const scans = { images: [], speech: [], scans: ["a.pdf", "b.pdf"] };

  it("says the first pages were read and counts the rest", () => {
    const [offer] = offersFor(scans, { previewed: 2, pagesLeft: 57 }, false, vi.fn());
    expect(offer.text).toBe(
      "Read the first pages of 2 documents. The rest (57 pages) is not read yet, a few seconds a page.",
    );
    expect(offer.label).toBe("Read the rest");
  });

  it("names the part of the drop the first pages did not reach", () => {
    const [offer] = offersFor(scans, { previewed: 1, pagesLeft: 1 }, false, vi.fn());
    expect(offer.text).toMatch(/^Read the first pages of 1 of 2 documents\. The rest \(1 page\)/);
  });

  it("keeps the plain offer when nothing was read, and says the rest after a stop", () => {
    const scope = { previewed: 0, pagesLeft: 1200 };
    const [fresh] = offersFor(scans, scope, false, vi.fn());
    expect(fresh.text).toBe("2 documents not read yet (1,200 pages). Reading takes a few seconds a page.");
    expect(fresh.label).toBe("Read them");
    expect(offersFor(scans, scope, true, vi.fn())[0].label).toBe("Read the rest");
  });
});

describe("passOutcome", () => {
  it("says nothing before a pass, or after one that ran to the end", () => {
    expect(passOutcome(null, false)).toBeNull();
    expect(passOutcome({ read: 3, total: 3, failure: null }, false)).toBeNull();
    expect(passOutcome({ read: 1, total: 3, failure: "other" }, false)).toBeNull();
  });

  it("counts what a stop kept", () => {
    expect(passOutcome({ read: 0, total: 3, failure: null }, true)).toBe(
      "Stopped before any file was read.",
    );
    expect(passOutcome({ read: 1, total: 3, failure: null }, true)).toBe(
      "Stopped after reading 1 of 3. That one is in the bundle.",
    );
    expect(passOutcome({ read: 2, total: 3, failure: null }, true)).toBe(
      "Stopped after reading 2 of 3. Those are in the bundle.",
    );
  });

  it("names the cause someone can act on", () => {
    expect(passOutcome({ read: 0, total: 2, failure: "offline" }, false)).toMatch(
      /^Couldn't get the reader\. Check your connection/,
    );
    expect(passOutcome({ read: 1, total: 2, failure: "offline" }, false)).toMatch(
      /^The connection dropped after 1 of 2\./,
    );
    expect(passOutcome({ read: 0, total: 2, failure: "memory" }, false)).toMatch(/ran out of memory/);
  });
});
