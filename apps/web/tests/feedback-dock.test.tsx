import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The ask must never interrupt: it appears after an export without taking
 * focus, and the panel it opens leaves the page usable beside it. What is worth
 * pinning is when it asks, what a tap records, and that a note which failed to
 * send is still in the box.
 */

type Dock = typeof import("~/components/app/feedback-dock");

let dock: Dock;
let counters: { n: string; v?: string }[];
let posted: { url: string; body: Record<string, unknown> }[];
let fetchOk: boolean;

beforeEach(async () => {
  vi.useFakeTimers();
  counters = [];
  posted = [];
  fetchOk = true;
  localStorage.clear();
  vi.stubGlobal("navigator", {
    ...navigator,
    sendBeacon: (_url: string, body: Blob) => {
      void body.text().then((t) => counters.push(...(JSON.parse(t) as { e: typeof counters }).e));
      return true;
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      posted.push({ url, body: JSON.parse(init.body as string) });
      return { ok: fetchOk } as Response;
    }),
  );
  // The once-per-page-load guard is module state, like the counters' page id.
  vi.resetModules();
  dock = await import("~/components/app/feedback-dock");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Harness({ exports = 0, empty = false }: { exports?: number; empty?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open feedback
      </button>
      <dock.FeedbackDock
        active
        exports={exports}
        empty={empty}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("the ask", () => {
  it("appears shortly after the first export, without taking focus", async () => {
    const { rerender } = render(<Harness />);
    await tick(5000);
    expect(screen.queryByText("Did this do what you needed?")).toBeNull();

    rerender(<Harness exports={1} />);
    await tick(1600);
    expect(screen.getAllByText("Did this do what you needed?").length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(document.body);
  });

  it("Not quite opens the panel with the cursor in the box, and records the answer", async () => {
    render(<Harness exports={1} />);
    await tick(1600);
    fireEvent.click(screen.getByRole("button", { name: "Not quite" }));

    const box = screen.getByRole("textbox", { name: "What went wrong?" });
    expect(document.activeElement).toBe(box);
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("false");

    await tick(2000);
    expect(counters.map((c) => c.v)).toEqual(["asked", "no"]);
  });

  it("stays away for a month once shown on this device", async () => {
    localStorage.setItem("fileconcat-feedback-asked", String(Date.now() - 24 * 60 * 60 * 1000));
    render(<Harness exports={1} />);
    await tick(5000);
    expect(screen.queryByText("Did this do what you needed?")).toBeNull();
  });

  it("still asks on the empty screen inside that month", async () => {
    localStorage.setItem("fileconcat-feedback-asked", String(Date.now()));
    render(<Harness empty />);
    await tick(4100);
    fireEvent.click(screen.getByRole("button", { name: "Tell us" }));
    expect(screen.getByRole("heading", { name: "What were you trying to combine?" })).toBeTruthy();
  });
});

describe("the panel", () => {
  it("sends the note under the origin it was opened from", async () => {
    render(<Harness exports={1} />);
    await tick(1600);
    fireEvent.click(screen.getByRole("button", { name: "Not quite" }));
    fireEvent.change(screen.getByRole("textbox", { name: "What went wrong?" }), {
      target: { value: " the pdf was empty " },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
    });

    expect(posted).toHaveLength(1);
    expect(posted[0].url).toBe("/api/feedback");
    expect(posted[0].body).toMatchObject({ o: "no", m: "the pdf was empty" });
    expect(posted[0].body).not.toHaveProperty("e");
    expect(typeof posted[0].body.s).toBe("string");
    expect(screen.getByRole("heading", { name: "Sent. Thank you." })).toBeTruthy();
    expect(screen.queryByText(/We'll reply/)).toBeNull();
  });

  it("asks for the reply address with the note, not after it", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open feedback" }));
    fireEvent.change(screen.getByRole("textbox", { name: "What should we fix or add?" }), {
      target: { value: "epub please" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Want a reply\?/ }), {
      target: { value: "ada@example.com" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
    });

    expect(posted[0].body).toMatchObject({ o: "link", m: "epub please", e: "ada@example.com" });
    expect(screen.getByText("ada@example.com")).toBeTruthy();
  });

  it("keeps the draft when sending fails", async () => {
    fetchOk = false;
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open feedback" }));
    const box = screen.getByRole("textbox", { name: "What should we fix or add?" });
    fireEvent.change(box, { target: { value: "missing .pages support" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
    });

    expect(posted[0].body).toMatchObject({ o: "link" });
    expect(screen.getByRole("alert").textContent).toContain("Couldn't send it");
    expect((box as HTMLTextAreaElement).value).toBe("missing .pages support");
  });

  it("closes on Escape and hands focus back to what opened it", async () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open feedback" });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "What should we fix or add?" }), {
      key: "Escape",
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
