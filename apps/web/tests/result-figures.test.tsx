import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

// Every set of figures the result screen was rendered with, in order.
const seen: string[] = [];
vi.mock("~/components/app/result-view", async (importOriginal) => {
  const real = await importOriginal<typeof import("~/components/app/result-view")>();
  return {
    ...real,
    ResultView: (props: { tokens: number; filesCombined: number; totalFiles: number }) => {
      seen.push(`${props.tokens}|${props.filesCombined}|${props.totalFiles}`);
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

// The deferred file statuses once trailed a new drop by a render, so the
// result screen opened on "0 tokens" (or the last bundle's count) and then
// jumped to the real one.
it("the result screen never shows figures other than the final ones", async () => {
  render(<AppFlow />);
  const input = screen.getAllByLabelText("Browse files")[0] as HTMLInputElement;
  fireEvent.change(input, {
    target: { files: [new File(["hello world\n"], "a.txt"), new File(["more text here\n"], "b.txt")] },
  });
  await waitFor(() => expect(seen.length).toBeGreaterThan(0));
  await new Promise((r) => setTimeout(r, 300));
  expect(new Set(seen)).toEqual(new Set([seen[seen.length - 1]]));
});
