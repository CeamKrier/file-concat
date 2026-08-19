import { renderHook } from "@testing-library/react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { useClipperPush } from "~/hooks/use-clipper-push";

const CHANNEL = "fileconcat-clipper";

/**
 * The hook only trusts a message that came from this window at this origin, and
 * jsdom's own `window.postMessage` sets neither: it delivers `source: null` and
 * `origin: ""`. So a batch is dispatched as a synthetic event with both fields
 * filled, and only the hook's *replies* travel by real `postMessage` — which is
 * why every assertion about them waits a turn first.
 */
function deliver(data: unknown) {
  window.dispatchEvent(new MessageEvent("message", { data, source: window, origin: window.location.origin }));
}

/** Everything the page puts on the wire, replies and the mount `ready` alike. */
function watch() {
  const seen: { channel?: string; type?: string; count?: number; reason?: string }[] = [];
  const on = (event: MessageEvent) => seen.push(event.data);
  window.addEventListener("message", on);
  onTestFinished(() => window.removeEventListener("message", on));
  return seen;
}

const turn = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("useClipperPush", () => {
  it("takes a valid batch and says how many it took", async () => {
    const onFiles = vi.fn();
    const seen = watch();
    renderHook(() => useClipperPush(onFiles));

    deliver({
      channel: CHANNEL,
      type: "files",
      files: [
        { path: "hn/thread.md", markdown: "# Thread\n" },
        { path: "reddit/post.md", markdown: "# Post\n" },
      ],
    });
    await turn();

    expect(onFiles).toHaveBeenCalledTimes(1);
    const paths = onFiles.mock.calls[0][0].map((f: { path: string }) => f.path);
    expect(paths).toEqual(["hn/thread.md", "reddit/post.md"]);
    expect(seen).toContainEqual({ channel: CHANNEL, type: "received", count: 2 });
  });

  it("refuses more files than a push may carry, and says so", async () => {
    const onFiles = vi.fn();
    const seen = watch();
    renderHook(() => useClipperPush(onFiles));

    deliver({
      channel: CHANNEL,
      type: "files",
      files: Array.from({ length: 201 }, (_, i) => ({ path: `a/${i}.md`, markdown: "x" })),
    });
    await turn();

    expect(onFiles).not.toHaveBeenCalled();
    // The extension used to be told nothing here and reported the batch as
    // delivered; a refusal has to come back, with the limit and not the batch.
    expect(seen.filter((m) => m.type === "rejected")).toHaveLength(1);
    expect(seen.find((m) => m.type === "rejected")?.reason).toContain("200");
  });

  it("refuses a batch over the character limit, and says so", async () => {
    const onFiles = vi.fn();
    const seen = watch();
    renderHook(() => useClipperPush(onFiles));

    deliver({
      channel: CHANNEL,
      type: "files",
      files: [
        { path: "a.md", markdown: "x".repeat(3_000_000) },
        { path: "b.md", markdown: "x".repeat(1_500_000) },
      ],
    });
    await turn();

    expect(onFiles).not.toHaveBeenCalled();
    expect(seen.find((m) => m.type === "rejected")?.reason).toContain("4 million");
  });

  it("stays silent on a message that is not ours", async () => {
    const onFiles = vi.fn();
    const seen = watch();
    renderHook(() => useClipperPush(onFiles));

    deliver({ channel: "someone-else", type: "files", files: [{ path: "a.md", markdown: "x" }] });
    await turn();

    expect(onFiles).not.toHaveBeenCalled();
    // Answering anything that postMessages would make this hook a beacon for
    // "the extension is installed here"; a refusal is only owed to our own.
    expect(seen.some((m) => m.type === "received" || m.type === "rejected")).toBe(false);
  });
});
