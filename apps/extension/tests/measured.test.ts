// Exit criteria from docs/clipper-chat-plan.md, over the measured JSON kept
// (gitignored) under docs/clipper-chat-probes/. Skipped where the files are
// absent, which is everywhere but the machine that measured them. Every
// assertion is on a number: a failing string matcher would print the whole
// clipping, which is a user's conversation, into the test output.
import { existsSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { type Conversation, readConversation } from "../src/chatgpt";
import { type ClaudeConversation, createdFiles, readConversation as readClaude } from "../src/claude";
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

describe.skipIf(!has("claude-thinking-text.json"))("Claude, 86 messages with thinking text, measured", () => {
  let json: ClaudeConversation;
  beforeAll(() => {
    json = load<ClaudeConversation>("claude-thinking-text.json");
  });

  it("is 42 user turns and 41 answers with the opt-in off, and one created file", () => {
    const markdown = renderChatClipping(readClaude(json, ID, false));
    expect(count(markdown, "\n**User**\n")).toBe(42);
    expect(count(markdown, "\n**Claude**\n")).toBe(41);
    expect(count(markdown, "[file: /")).toBe(1);
    // One image and one document uploaded on the walk.
    expect(count(markdown, "[image: ")).toBe(1);
    expect(privateUse(markdown)).toBe(0);
    expect(createdFiles(json)).toHaveLength(1);
  });

  it("holds 38 calls, 39 outputs with 2 errors and 57 reasoning blocks with the opt-in on", () => {
    const clip = readClaude(json, ID, true);
    const markdown = renderChatClipping(clip);
    expect(count(markdown, "\n_Call: ")).toBe(38);
    expect(count(markdown, "\n_Output: ")).toBe(39);
    expect(count(markdown, " (error)_\n")).toBe(2);
    expect(count(markdown, "\n_Reasoning_\n")).toBe(57);
    expect(clip.skipped).toEqual({});
  });
});

describe.skipIf(!has("claude-branches.json"))("Claude, two branches and hidden thinking, measured", () => {
  let json: ClaudeConversation;
  beforeAll(() => {
    json = load<ClaudeConversation>("claude-branches.json");
  });

  it("walks 36 of 49 messages into 18 turns and lists five created files", () => {
    const clip = readClaude(json, ID, true);
    const markdown = renderChatClipping(clip);
    expect(clip.turns).toBe(18);
    expect(count(markdown, "\n**Claude**\n")).toBe(18);
    expect(count(markdown, "\n_Reasoning_\n")).toBe(26);
    expect(count(markdown, "\n_Call: ")).toBe(21);
    expect(count(markdown, "\n_Output: ")).toBe(26);
    // Five pointers to created files; the one upload on the walk is a blob, so
    // it is a `[file: name]` line with no slash, not an image.
    expect(count(markdown, "[file: /")).toBe(5);
    expect(createdFiles(json)).toHaveLength(5);
  });
});

describe.skipIf(!has("claude-text-only.json"))("Claude, text only, measured", () => {
  let json: ClaudeConversation;
  beforeAll(() => {
    json = load<ClaudeConversation>("claude-text-only.json");
  });

  it("is 11 and 11 whatever the opt-in", () => {
    const off = renderChatClipping(readClaude(json, ID, false));
    const on = renderChatClipping(readClaude(json, ID, true));
    expect(count(off, "\n**User**\n")).toBe(11);
    expect(count(off, "\n**Claude**\n")).toBe(11);
    expect(on.replace("included_", "left out_") === off).toBe(true);
  });
});
