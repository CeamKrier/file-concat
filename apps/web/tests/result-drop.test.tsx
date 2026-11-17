import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

// The file count each render of the result screen showed, in order.
const combined: number[] = [];
vi.mock("~/components/app/result-view", async (importOriginal) => {
  const real = await importOriginal<typeof import("~/components/app/result-view")>();
  return {
    ...real,
    ResultView: (props: { filesCombined: number }) => {
      combined.push(props.filesCombined);
      return real.ResultView(props as never);
    },
  };
});

// No router in a unit test: a link is an anchor.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("~/lib/blog", () => ({
  getVisiblePosts: () => [],
  getResearchPosts: () => [],
  getPostBySlug: () => null,
  hasPublishedPosts: () => false,
  formatPostDate: (iso: string) => iso,
}));

import { AppFlow } from "~/components/app/app-flow";

/** A drag carrying one file, as jsdom has no DataTransfer of its own. */
const fileDrag = (name: string) => ({
  types: ["Files"],
  items: [
    {
      webkitGetAsEntry: () => ({
        isFile: true,
        isDirectory: false,
        name,
        file: (ok: (f: File) => void) => ok(new File(["more text here\n"], name)),
      }),
    },
  ],
});

// A user had to go back home to add one more file (feedback 2026-10-26).
it("a file dropped on the result screen joins the bundle; dragged text does not", async () => {
  render(<AppFlow />);
  const input = screen.getAllByLabelText("Browse files")[0] as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["hello world\n"], "a.txt")] } });
  await waitFor(() => expect(combined.at(-1)).toBe(1));

  const main = screen.getByRole("main");
  fireEvent.drop(main, { dataTransfer: { types: ["text/plain"], items: [] } });
  await new Promise((r) => setTimeout(r, 100));
  expect(combined.at(-1)).toBe(1);

  fireEvent.drop(main, { dataTransfer: fileDrag("b.txt") });
  await waitFor(() => expect(combined.at(-1)).toBe(2));
});
