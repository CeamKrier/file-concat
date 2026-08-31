import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReadingDialog, type ReadingDocument } from "~/components/app/reading-dialog";

const OPTIONS = [
  { locale: "en", code: "eng", name: "English" },
  { locale: "tr", code: "tur", name: "Turkish" },
  { locale: "ar", code: "ara", name: "Arabic" },
];

function doc(
  name: string,
  text: string,
  tried = true,
  language: string | null = text ? "Turkish" : null,
): ReadingDocument {
  return { path: `scans/${name}`, name, text, tried, language };
}

function open(props: Partial<React.ComponentProps<typeof ReadingDialog>> = {}) {
  const onRead = vi.fn(async () => 1);
  const onStop = vi.fn();
  render(
    <ReadingDialog
      open
      onOpenChange={() => {}}
      documents={[doc("a.pdf", "Merve Çakır")]}
      language="tr"
      languageOptions={OPTIONS}
      isReading={false}
      progress={null}
      onRead={onRead}
      onStop={onStop}
      {...props}
    />,
  );
  return { onRead, onStop };
}

describe("the reading dialog", () => {
  it("shows what recognition made of each document, not a count of them", async () => {
    open({
      documents: [doc("a.pdf", "Merve Çakır"), doc("b.pdf", "Statement page 1")],
    });

    // The whole reason this surface exists: the text is the evidence, and the
    // bundle preview is a prefix that on any real drop does not contain it.
    expect(screen.getByText("Merve Çakır")).toBeInTheDocument();
    expect(screen.getByText("Statement page 1")).toBeInTheDocument();
  });

  it("names the language per document, which is the only place a mixed drop reads", () => {
    open({
      documents: [
        doc("tr.pdf", "Merve Çakır", true, "Turkish"),
        doc("en.pdf", "Statement page 1", true, "English"),
      ],
    });

    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("Turkish")).toBeInTheDocument();
    expect(within(rows[1]).getByText("English")).toBeInTheDocument();
  });

  it("tells a document nobody has opened from one that came back blank", () => {
    open({ documents: [doc("a.pdf", "", false), doc("b.pdf", "", true)] });

    expect(screen.getByText("Not read yet.")).toBeInTheDocument();
    expect(screen.getByText(/Nothing legible here/)).toBeInTheDocument();
  });

  it("offers a way out, not a second pass, when everything has been read", async () => {
    const { onRead } = open({
      documents: [doc("a.pdf", "one"), doc("b.pdf", "two")],
    });

    // Reading the same files again in the same language would produce the same
    // reading, so the pass on offer needs a reason first.
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole("combobox"), "ar");
    await userEvent.click(screen.getByRole("button", { name: "Read 2 files" }));
    expect(onRead).toHaveBeenCalledWith(["scans/a.pdf", "scans/b.pdf"], "ar");
  });

  it("starts on the unread documents when there are any, since that is the job", async () => {
    const { onRead } = open({
      documents: [doc("a.pdf", "already read"), doc("b.pdf", "", false)],
    });

    await userEvent.click(screen.getByRole("button", { name: "Read 1 file" }));
    expect(onRead).toHaveBeenCalledWith(["scans/b.pdf"], "tr");
  });

  it("reads only the ticked documents, which is what makes a mixed drop fixable", async () => {
    const { onRead } = open({
      documents: [doc("en.pdf", "Statement page 1"), doc("ar.pdf", "gibberish")],
    });

    // Both start ticked (everything is read), so untick the English one and
    // send just the Arabic one through an Arabic pass.
    await userEvent.click(screen.getByRole("checkbox", { name: "Read en.pdf" }));
    await userEvent.selectOptions(screen.getByRole("combobox"), "ar");
    await userEvent.click(screen.getByRole("button", { name: "Read 1 file" }));

    expect(onRead).toHaveBeenCalledWith(["scans/ar.pdf"], "ar");
  });

  it("offers no checkbox for a single document, which has nothing to choose between", async () => {
    open({ documents: [doc("a.pdf", "one")] });

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole("combobox"), "ar");
    expect(screen.getByRole("button", { name: "Read 1 file" })).toBeEnabled();
  });

  it("refuses an empty pass rather than silently reading everything", async () => {
    const { onRead } = open({
      documents: [doc("a.pdf", "one"), doc("b.pdf", "two")],
    });

    await userEvent.click(screen.getByRole("checkbox", { name: "Read a.pdf" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Read b.pdf" }));

    const button = screen.getByRole("button", { name: "Nothing selected" });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onRead).not.toHaveBeenCalled();
  });

  it("swaps the action for progress and a stop while a pass runs", async () => {
    const { onStop } = open({
      documents: [doc("a.pdf", "one"), doc("b.pdf", "two")],
      isReading: true,
      progress: { done: 1, total: 2 },
    });

    // `done` counts finished documents, so the one in hand is the next index.
    expect(screen.getByText(/Reading 2 of 2/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Read \d/ })).not.toBeInTheDocument();
    // Every control that would start a second pass is out of reach while one runs.
    for (const box of screen.getAllByRole("checkbox")) expect(box).toBeDisabled();
    expect(screen.getByRole("combobox")).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onStop).toHaveBeenCalled();
  });

  it("puts the documents that came back with nothing at the top, where the work is", () => {
    open({ documents: [doc("read.pdf", "Statement page 1"), doc("blank.pdf", "", true)] });

    // Drop order carries nothing on this screen. What still needs a decision
    // does, and on a drop of forty scans it would otherwise be buried.
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("blank.pdf")).toBeInTheDocument();
  });

  it("starts folded and never unfolds more than one at a time", async () => {
    open({ documents: [doc("a.pdf", "one"), doc("b.pdf", "two")] });

    // Unfolding one fills the dialog, so opening on one would hide that there
    // is a list. Unfolding all of them is the wall this replaced.
    const a = screen.getByRole("button", { name: /a\.pdf/ });
    const b = screen.getByRole("button", { name: /b\.pdf/ });
    expect(a).toHaveAttribute("aria-expanded", "false");
    expect(b).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(a);
    expect(a).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(b);
    expect(a).toHaveAttribute("aria-expanded", "false");
    expect(b).toHaveAttribute("aria-expanded", "true");
  });

  it("unfolds a lone document, which has no list to hide", () => {
    open({ documents: [doc("a.pdf", "Merve Çakır")] });

    expect(screen.getByRole("button", { name: /a\.pdf/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("offers nothing to unfold where there is no reading to unfold", () => {
    open({ documents: [doc("a.pdf", "one"), doc("blank.pdf", "", true)] });

    // Its one line of explanation is always visible, so a control that hid it
    // would only be a control over nothing.
    expect(screen.queryByRole("button", { name: /blank\.pdf/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing legible here/)).toBeInTheDocument();
  });

  it("stops asking for a second pass once one has finished", async () => {
    const onOpenChange = vi.fn();
    const props = {
      open: true,
      onOpenChange,
      documents: [doc("a.pdf", "one"), doc("b.pdf", "two")],
      language: "tr",
      languageOptions: OPTIONS,
      progress: null,
      onRead: vi.fn(async () => 2),
      onStop: vi.fn(),
    };
    const { rerender } = render(<ReadingDialog {...props} isReading />);
    rerender(<ReadingDialog {...props} isReading={false} />);

    // The button read "Read 2 files" before the pass and again after it, so a
    // finished pass looked like one that never ran and people ran it twice.
    expect(screen.queryByRole("button", { name: /^Read \d/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    // Another language is a reason for another pass, so the action comes back.
    await userEvent.selectOptions(screen.getByRole("combobox"), "ar");
    expect(screen.getByRole("button", { name: "Read 2 files" })).toBeEnabled();
  });

  it("keeps the action after a stop, which leaves the rest unread", async () => {
    const props = {
      open: true,
      onOpenChange: () => {},
      documents: [doc("a.pdf", "one"), doc("b.pdf", "two")],
      language: "tr",
      languageOptions: OPTIONS,
      progress: null,
      onRead: vi.fn(async () => 1),
      onStop: vi.fn(),
    };
    const { rerender } = render(<ReadingDialog {...props} isReading />);
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    rerender(<ReadingDialog {...props} isReading={false} />);

    expect(screen.getByRole("button", { name: /^Read \d/ })).toBeInTheDocument();
  });

  it("says the stop landed while the page in hand is still coming back", async () => {
    const props = {
      open: true,
      onOpenChange: () => {},
      documents: [doc("a.pdf", "one"), doc("b.pdf", "two")],
      language: "tr",
      languageOptions: OPTIONS,
      progress: null,
      onRead: vi.fn(async () => 1),
      onStop: vi.fn(),
    };
    const { rerender } = render(<ReadingDialog {...props} isReading />);
    rerender(<ReadingDialog {...props} isReading isStopping />);

    // The gap between the press and the pass ending is real: the abort reaches
    // the recogniser at once, and the document it is holding still has to
    // unwind. A button that says nothing across it reads as a dead button,
    // which is how it was being read.
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stopping..." })).toBeDisabled();
  });

  it("names the language it read in, so a wrong guess is visible before the text is", () => {
    open({ language: "tr" });

    const select = screen.getByRole("combobox");
    expect(select).toHaveValue("tr");
    expect(within(select).getByRole("option", { name: "Turkish" })).toBeInTheDocument();
  });
});
