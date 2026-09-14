// Exit criteria from docs/clipper-chat-plan.md, over the measured JSON kept
// (gitignored) under docs/clipper-chat-probes/. Skipped where the files are
// absent, which is everywhere but the machine that measured them. Every
// assertion is on a number: a failing string matcher would print the whole
// clipping, which is a user's conversation, into the test output.
import { existsSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { type Conversation, readConversation } from "../src/chatgpt";
import { renderChatClipping } from "../src/markdown";

const PROBES = new URL("../../../docs/clipper-chat-probes/", import.meta.url);
// Only feeds the source URL, which nothing here asserts; the real ids stay out of the repo.
const ID = "12345678-1234-4123-8123-123456789abc";
const has = (name: string) => existsSync(new URL(name, PROBES));
// Loaded inside `beforeAll`: a skipped describe still runs its body at
// collection time, and a top-level `readFileSync` there would throw in CI.
const load = <T,>(name: string): T => JSON.parse(readFileSync(new URL(name, PROBES), "utf8")) as T;
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;
const privateUse = (markdown: string) => (markdown.match(/[\uE000-\uF8FF]/g) ?? []).length;

describe.skipIf(!has("chatgpt-share.json"))("ChatGPT share page, measured", () => {
  let json: Conversation;
  beforeAll(() => {
    json = load<Conversation>("chatgpt-share.json");
  });
  const ref = { kind: "share", id: ID } as const;

  it("is 41 user turns and 40 answers with the opt-in off, and carries no private-use character", () => {
    const markdown = renderChatClipping(readConversation(json, ref, false));
    expect(count(markdown, "\n**User**\n")).toBe(41);
    expect(count(markdown, "\n**ChatGPT**\n")).toBe(40);
    expect(privateUse(markdown)).toBe(0);
    expect(count(markdown, "reasoning and tool activity left out_")).toBe(1);
    expect(count(markdown, "Not rendered")).toBe(0);
  });

  it("holds 378 calls and 190 outputs with the opt-in on and says 664 were redacted", () => {
    const clip = readConversation(json, ref, true);
    const markdown = renderChatClipping(clip);
    expect(count(markdown, "\n_Call: ")).toBe(378);
    expect(count(markdown, "\n_Output: ")).toBe(190);
    expect(clip.redacted).toBe(664);
    expect(count(markdown, ", 664 redacted tool outputs not shown_")).toBe(1);
    expect(privateUse(markdown)).toBe(0);
  });
});

describe.skipIf(!has("chatgpt-signed-in.json"))("ChatGPT signed-in page, measured", () => {
  let json: Conversation;
  beforeAll(() => {
    json = load<Conversation>("chatgpt-signed-in.json");
  });
  const ref = { kind: "c", id: ID } as const;

  it("is the same transcript as the share page", () => {
    const markdown = renderChatClipping(readConversation(json, ref, false));
    expect(count(markdown, "\n**User**\n")).toBe(41);
    expect(count(markdown, "\n**ChatGPT**\n")).toBe(40);
    expect(privateUse(markdown)).toBe(0);
  });

  it("holds 378 calls and 472 outputs with the opt-in on, nothing redacted, nothing skipped", () => {
    const clip = readConversation(json, ref, true);
    const markdown = renderChatClipping(clip);
    expect(count(markdown, "\n_Call: ")).toBe(378);
    expect(count(markdown, "\n_Output: ")).toBe(472);
    expect(clip.redacted).toBe(0);
    expect(clip.skipped).toEqual({});
    expect(count(markdown, "reasoning and tool activity included_")).toBe(1);
    expect(privateUse(markdown)).toBe(0);
  });
});
