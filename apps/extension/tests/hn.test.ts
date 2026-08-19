import { describe, expect, it } from "vitest";
import { isItem } from "../src/hn";

describe("isItem", () => {
  it("is true on an item page with an id", () => {
    expect(isItem("?id=123", "/item")).toBe(true);
  });

  it("is false on /user, which also carries an id", () => {
    expect(isItem("?id=pg", "/user")).toBe(false);
  });

  it("is false on /item with no id", () => {
    expect(isItem("", "/item")).toBe(false);
  });

  it("is false on the front page", () => {
    expect(isItem("", "/")).toBe(false);
  });
});
