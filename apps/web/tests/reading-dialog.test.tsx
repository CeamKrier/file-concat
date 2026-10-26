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
  return { path: `scans/${name}`, name, text, tried, language, speech: /\.(mp3|mp4)$/.test(name) };
}

function open(props: Partial<React.ComponentProps<typeof ReadingDialog>> = {}) {
  const onRead = vi.fn(async () => 1);
  render(
    <ReadingDialog
      open
      onOpenChange={() => {}}
      documents={[doc("a.pdf", "Merve Çakır")]}
      language="tr"
      languageOptions={OPTIONS}
      isReading={false}
      onRead={onRead}
      {...props}
    />,
  );
  return { onRead };
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

  it("names the speech model's download before the first transcription, by language", async () => {
    open({ documents: [doc("talk.mp3", "", false)], language: "en" });
    expect(screen.getByText(/66 MB for English/)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole("combobox"), "tr");
    expect(screen.getByText(/244 MB for this language/)).toBeInTheDocument();
    expect(screen.queryByText(/66 MB/)).not.toBeInTheDocument();
  });

  it("says a recording came back with no speech, not that it was illegible", () => {
    open({ documents: [doc("talk.mp3", "", true), doc("a.pdf", "Merve", true)] });
    expect(screen.getByText(/No speech or text came back/)).toBeInTheDocument();
    // Nothing to download for a pass that is over.
    expect(screen.queryByText(/downloaded once/)).not.toBeInTheDocument();
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

  it("holds every control while a pass runs, and leaves the stop to the reading bar", () => {
    open({
      documents: [doc("a.pdf", "one"), doc("b.pdf", "two")],
      isReading: true,
    });

    // Every control that would start a second pass is out of reach while one runs.
    expect(screen.getByRole("button", { name: "Reading..." })).toBeDisabled();
    for (const box of screen.getAllByRole("checkbox")) expect(box).toBeDisabled();
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Stop/ })).not.toBeInTheDocument();
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

  it("closes once a pass starts, so the reading bar can follow it", async () => {
    const onOpenChange = vi.fn();
    const { onRead } = open({
      onOpenChange,
      documents: [doc("a.pdf", "", false), doc("b.pdf", "", false)],
    });

    await userEvent.click(screen.getByRole("button", { name: "Read 2 files" }));
    expect(onRead).toHaveBeenCalledWith(["scans/a.pdf", "scans/b.pdf"], "tr");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("offers another pass after a finished one only for another language", async () => {
    open({ documents: [doc("a.pdf", "one"), doc("b.pdf", "two")] });

    // The button read "Read 2 files" before the pass and again after it, so a
    // finished pass looked like one that never ran and people ran it twice.
    expect(screen.queryByRole("button", { name: /^Read \d/ })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole("combobox"), "ar");
    expect(screen.getByRole("button", { name: "Read 2 files" })).toBeEnabled();
  });

  it("names the language it read in, so a wrong guess is visible before the text is", () => {
    open({ language: "tr" });

    const select = screen.getByRole("combobox");
    expect(select).toHaveValue("tr");
    expect(within(select).getByRole("option", { name: "Turkish" })).toBeInTheDocument();
  });
});
