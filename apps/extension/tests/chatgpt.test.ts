import { describe, expect, it } from "vitest";
import { chatUrl, conversationRef, parseRefId, refId } from "../src/chatgpt";

// A made-up uuid: a real conversation id has no place in a public repo.
const ID = "12345678-1234-4123-8123-123456789abc";

describe("conversationRef", () => {
  it("reads a share page, a conversation and a custom GPT's conversation", () => {
    expect(conversationRef(`/share/${ID}`)).toEqual({ kind: "share", id: ID });
    expect(conversationRef(`/c/${ID}`)).toEqual({ kind: "c", id: ID });
    expect(conversationRef(`/g/g-p-abc123-my-gpt/c/${ID}`)).toEqual({ kind: "c", id: ID });
  });

  it("is null everywhere else on the host", () => {
    for (const path of ["/", "/c", "/c/not-a-uuid", "/gpts", "/share", `/share/${ID}/continue`]) {
      expect(conversationRef(path)).toBeNull();
    }
  });
});

describe("refId", () => {
  it("is path-shaped and round-trips", () => {
    expect(refId({ kind: "share", id: ID })).toBe(`share/${ID}`);
    expect(refId({ kind: "c", id: ID })).toBe(`c/${ID}`);
    expect(parseRefId(`c/${ID}`)).toEqual({ kind: "c", id: ID });
    expect(parseRefId("c/nope")).toBeNull();
  });

  it("names the page for the ref", () => {
    expect(chatUrl({ kind: "share", id: ID })).toBe(`https://chatgpt.com/share/${ID}`);
    expect(chatUrl({ kind: "c", id: ID })).toBe(`https://chatgpt.com/c/${ID}`);
  });
});
