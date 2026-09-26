import { describe, expect, it } from "vitest";

import { FEEDBACK_MAX_CHARS, validFeedback } from "~/lib/feedback";

/**
 * The sink is an unauthenticated public write whose shape is in a public repo,
 * so what it accepts is the whole contract: a page id of the counters' shape, an
 * origin from the closed set, and a non-empty note no longer than the textarea
 * allows.
 */

const PAGE = "3f2a9c1e-0b7d-4c55-9a61-2d8e4f0b6a13";

describe("validFeedback", () => {
  it("accepts a note and trims it", () => {
    expect(validFeedback({ s: PAGE, r: 2, o: "no", m: "  the pdf came out empty \n" })).toEqual({
      page: PAGE,
      run: 2,
      origin: "no",
      message: "the pdf came out empty",
      email: null,
    });
  });

  it("keeps a reply address only when one was typed, and refuses one that is not an address", () => {
    expect(validFeedback({ s: PAGE, o: "no", m: "hi", e: " ada@example.com " })?.email).toBe(
      "ada@example.com",
    );
    expect(validFeedback({ s: PAGE, o: "no", m: "hi", e: "" })?.email).toBeNull();
    expect(validFeedback({ s: PAGE, o: "no", m: "hi", e: "not an address" })).toBeNull();
    expect(validFeedback({ s: PAGE, o: "no", m: "hi", e: 7 })).toBeNull();
  });

  it("keeps a note with no Run, and drops a Run that is not one", () => {
    expect(validFeedback({ s: PAGE, o: "link", m: "hi" })?.run).toBeNull();
    expect(validFeedback({ s: PAGE, r: 1.5, o: "link", m: "hi" })?.run).toBeNull();
    expect(validFeedback({ s: PAGE, r: 0, o: "link", m: "hi" })?.run).toBeNull();
  });

  it("refuses what is not a note from this page", () => {
    expect(validFeedback(null)).toBeNull();
    expect(validFeedback({ s: "x", o: "no", m: "hi" })).toBeNull();
    expect(validFeedback({ s: PAGE, o: "angry", m: "hi" })).toBeNull();
    expect(validFeedback({ s: PAGE, o: "no", m: "   " })).toBeNull();
    expect(validFeedback({ s: PAGE, o: "no", m: 42 })).toBeNull();
  });

  it("rejects a note past the limit rather than cutting it", () => {
    expect(validFeedback({ s: PAGE, o: "no", m: "a".repeat(FEEDBACK_MAX_CHARS) })).not.toBeNull();
    expect(validFeedback({ s: PAGE, o: "no", m: "a".repeat(FEEDBACK_MAX_CHARS + 1) })).toBeNull();
  });
});
