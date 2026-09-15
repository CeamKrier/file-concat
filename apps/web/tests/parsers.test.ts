import { describe, expect, it } from "vitest";
import { parsers } from "~/lib/parsers";

describe("web parser map", () => {
  it("carries a loader for every id the router can pick", () => {
    // A routed format with no loader surfaces "couldn't extract text"; epub sat
    // in that state from the day it was routed until 2026-09-15.
    for (const id of ["office", "epub", "email", "notebook", "subtitles"] as const) {
      expect(parsers.has(id), id).toBe(true);
    }
  });
});
