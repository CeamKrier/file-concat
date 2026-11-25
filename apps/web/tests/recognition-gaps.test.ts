import { summarizeExclusions } from "@fileconcat/core";
import { describe, expect, it } from "vitest";
import { recognitionGaps } from "../src/lib/recognition-gaps";

describe("recognitionGaps", () => {
  const validations = {
    "13.png": { included: false, reason: "Binary file", classification: "binary", recognitionTried: true },
    "14.png": { included: true, classification: "text", recognitionTried: true },
    "15.png": { included: false, reason: "Binary file", classification: "binary" },
    "16.png": { included: false, reason: "Couldn't be read", classification: "binary", recognitionTried: true },
  };
  const unread = [{ path: "13.png" }, { path: "15.png" }, { path: "16.png" }];

  it("names an image recognition opened and got nothing from", () => {
    const summary = summarizeExclusions(recognitionGaps(unread, validations, new Set(["15.png"])));
    expect(JSON.stringify(summary)).toContain("13.png");
    expect(JSON.stringify(summary)).toContain("16.png");
  });

  it("leaves out files that already have a status or were never opened", () => {
    const paths = recognitionGaps(unread, validations, new Set(["15.png"])).map((g) => g.path);
    expect(paths).toEqual(["13.png", "16.png"]);
    expect(recognitionGaps(unread, validations, new Set(["13.png", "15.png", "16.png"]))).toEqual([]);
  });
});
