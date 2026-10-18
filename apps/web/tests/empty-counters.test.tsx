import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Every counter name AppFlow asks the metrics module to write, in order.
const written: string[] = [];
vi.mock("~/lib/metrics", async (importOriginal) => {
  const real = await importOriginal<typeof import("~/lib/metrics")>();
  return {
    ...real,
    track: (name: string, value?: string) => {
      written.push(name);
      real.track(name as never, value);
    },
    trackTally: (name: string, ...rest: unknown[]) => {
      written.push(name);
      (real.trackTally as (...a: unknown[]) => void)(name, ...rest);
    },
    trackAmount: (name: string, ...rest: unknown[]) => {
      written.push(name);
      (real.trackAmount as (...a: unknown[]) => void)(name, ...rest);
    },
  };
});

// No router in a unit test: a link is an anchor.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

// The blog index globs the posts' MDX, which this config cannot parse.
vi.mock("~/lib/blog", () => ({
  getVisiblePosts: () => [],
  getResearchPosts: () => [],
  getPostBySlug: () => null,
  hasPublishedPosts: () => false,
  formatPostDate: (iso: string) => iso,
}));

import { AppFlow } from "~/components/app/app-flow";

beforeEach(() => {
  written.length = 0;
});

function drop(file: File) {
  render(<AppFlow />);
  const input = screen.getAllByLabelText("Browse files")[0] as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe("empty-screen counters", () => {
  // 2026-10-18: the bundle's contents follow the file statuses a render behind
  // (useDeferredValue), so the first result render saw an empty bundle while the
  // screen showed files, and 96 of 102 Runs since 10-17 wrote `empty_reason`
  // and `empty_kind` beside a `bundle_size`.
  it("writes nothing for a drop that bundles", async () => {
    drop(new File(["hello world\n"], "notes.txt", { type: "text/plain" }));
    await waitFor(() => expect(written).toContain("bundle_size"));
    expect(written).not.toContain("empty_reason");
    expect(written).not.toContain("empty_kind");
  });

  it("still writes them for a drop that comes out empty", async () => {
    drop(new File([new Uint8Array([0, 1, 2, 0, 255, 0, 7, 0])], "blob.qqz"));
    await waitFor(() => expect(written).toContain("empty_kind"));
    expect(written).toContain("empty_reason");
    expect(written).not.toContain("bundle_size");
  });
});
