import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The plumbing is one `track` call; what is worth pinning is the label. A
 * message must never reach it, the set of values it can produce must stay
 * closed, and one page load must not be able to write the same row twice.
 */

const { tracked } = vi.hoisted(() => ({
  tracked: [] as Array<{ name: string; value?: string }>,
}));

vi.mock("~/lib/metrics", () => ({
  track: (name: string, value?: string) => {
    tracked.push({ name, value });
  },
}));

let jsErrors: typeof import("~/lib/js-errors");

beforeEach(async () => {
  tracked.length = 0;
  // `seen` and `installed` are page-lifetime module state. A fresh import is
  // what makes each test a fresh page load rather than a continuation.
  vi.resetModules();
  jsErrors = await import("~/lib/js-errors");
});

const values = () => tracked.map((event) => event.value);

describe("recordError", () => {
  it("records the source and an allowlisted error name", () => {
    jsErrors.recordError("error", new TypeError("x is not a function"));
    expect(tracked).toEqual([{ name: "js_error", value: "error/typeerror" }]);
  });

  it("files a stale chunk load under chunk, not under its TypeError name", () => {
    jsErrors.recordError(
      "boundary",
      new TypeError("Failed to fetch dynamically imported module: https://fileconcat.com/x.js"),
    );
    expect(values()).toEqual(["boundary/chunk"]);
  });

  it("recognises the other browsers' wording for the same failure", () => {
    jsErrors.recordError("error", new Error("Importing a module script failed."));
    jsErrors.recordError("rejection", new Error("Loading chunk 42 failed"));
    expect(values()).toEqual(["error/chunk", "rejection/chunk"]);
  });

  it("never lets a message reach the wire", () => {
    jsErrors.recordError("rejection", new Error("/home/ada/secret-project/notes.txt"));
    expect(values()).toEqual(["rejection/error"]);
  });

  it("folds a name outside the list into other, so a minified class cannot widen the shape", () => {
    class Zi extends Error {
      override name = "Zi";
    }
    jsErrors.recordError("error", new Zi("boom"));
    expect(values()).toEqual(["error/other"]);
  });

  it("labels a stripped cross-origin error foreign rather than other", () => {
    jsErrors.recordError("error", null, "Script error.");
    expect(values()).toEqual(["error/foreign"]);
  });

  it("survives a rejection whose reason is not an Error", () => {
    jsErrors.recordError("rejection", "just a string");
    expect(values()).toEqual(["rejection/other"]);
  });

  it("writes one row per distinct label per page load, however often it throws", () => {
    for (let i = 0; i < 500; i += 1) {
      jsErrors.recordError("boundary", new RangeError("depth exceeded"));
    }
    jsErrors.recordError("boundary", new TypeError("different"));
    expect(values()).toEqual(["boundary/rangeerror", "boundary/typeerror"]);
  });

  it("keeps every label inside the shape the sink accepts", () => {
    jsErrors.recordError("error", new DOMException("full", "QuotaExceededError"));
    for (const value of values()) {
      expect(value).toMatch(/^[a-z0-9._/+-]{1,32}$/);
    }
  });
});

/**
 * jsdom's `window` outlives `vi.resetModules()`, so every install leaves its
 * listeners attached for the rest of the file and a later dispatch would run
 * them all. Exactly one test below is allowed to dispatch; idempotency is
 * checked at the point of attachment instead, which is where the guard lives.
 */
describe("installErrorCounter", () => {
  it("attaches once, so a second call cannot double every row", () => {
    // Swallowed rather than called through, so this test is not the one that
    // leaves a listener behind for the next.
    const attach = vi.spyOn(window, "addEventListener").mockImplementation(() => {});

    jsErrors.installErrorCounter();
    jsErrors.installErrorCounter();

    expect(attach.mock.calls.map(([type]) => type)).toEqual(["error", "unhandledrejection"]);
    attach.mockRestore();
  });

  it("counts an uncaught throw and an unhandled rejection", () => {
    jsErrors.installErrorCounter();

    window.dispatchEvent(
      new ErrorEvent("error", { error: new ReferenceError("nope"), message: "nope" }),
    );
    window.dispatchEvent(
      Object.assign(new Event("unhandledrejection"), { reason: new RangeError("nope") }),
    );

    expect(values()).toEqual(["error/referenceerror", "rejection/rangeerror"]);
  });
});
