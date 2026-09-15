// Exit criteria from docs/clipper-chat-plan.md, over the measured JSON kept
// (gitignored) under docs/clipper-chat-probes/. Skipped where the files are
// absent, which is everywhere but the machine that measured them. Every
// assertion is on a number: a failing string matcher would print the whole
// clipping, which is a user's conversation, into the test output.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { type Conversation, readConversation } from "../src/chatgpt";
import { type ClaudeConversation, createdFiles, readConversation as readClaude } from "../src/claude";
import { createdFiles as geminiFiles, readConversation as readGemini, type Turn } from "../src/gemini";
import { type ChatClipping, renderChatClipping } from "../src/markdown";

const PROBES = new URL("../../../docs/clipper-chat-probes/", import.meta.url);
// Only feeds the source URL, which nothing here asserts; the real ids stay out of the repo.
const ID = "12345678-1234-4123-8123-123456789abc";
const has = (name: string) => existsSync(new URL(name, PROBES));
// Loaded inside `beforeAll`: a skipped describe still runs its body at
// collection time, and a top-level `readFileSync` there would throw in CI.
const load = <T,>(name: string): T => JSON.parse(readFileSync(new URL(name, PROBES), "utf8")) as T;
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;
const privateUse = (markdown: string) => (markdown.match(/[\uE000-\uF8FF]/g) ?? []).length;
// A run of 30 letters is a word that lost its spaces to a citation sweep; the raw JSON has none.
const joinedWords = (markdown: string) => (markdown.match(/\p{L}{30,}/gu) ?? []).length;

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
    expect(joinedWords(markdown)).toBe(0);
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
    expect(joinedWords(markdown)).toBe(0);
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
    expect(createdFiles(json).length).toBe(1);
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
    expect(createdFiles(json).length).toBe(5);
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

// ---------- Gemini ----------

// The survey saved each conversation as the RPC payload `[turns, null, null, [[[]]]]`.
const geminiTurns = (name: string): Turn[] => load<[Turn[]]>(name)[0];
const HEX = "0123456789abcdef";
// A placeholder the reader left in place would read `googleusercontent.com/<kind>_content/`.
const placeholders = (markdown: string) => count(markdown, "googleusercontent.com/");
// Thinking sections rendered as bullets, counted on the blocks so a list inside a user's own text cannot move it.
const bullets = (clip: ChatClipping) => clip.blocks.reduce((sum, block) => sum + (block.kind === "reasoning" ? block.entries.length : 0), 0);
const GEMINI_FILES = /^gemini-(survey-\d+|[0-9a-f]{8})\.json$/;

describe.skipIf(!has("gemini-e83053d3.json"))("Gemini, the tab's own conversation, measured", () => {
  let turns: Turn[];
  beforeAll(() => {
    turns = geminiTurns("gemini-e83053d3.json");
  });

  it("is 10 turns with 9 upload lines and one video reference, no placeholder left", () => {
    const clip = readGemini(turns, HEX, false);
    const markdown = renderChatClipping(clip);
    expect(count(markdown, "\n**User**\n")).toBe(10);
    expect(count(markdown, "\n**Gemini**\n")).toBe(10);
    expect(count(markdown, "[image: ")).toBe(9);
    // One video reference plus one YouTube link the answer itself carries.
    expect(count(markdown, "](https://www.youtube.com/")).toBe(2);
    expect(placeholders(markdown)).toBe(0);
    expect(privateUse(markdown)).toBe(0);
    expect(joinedWords(markdown)).toBe(0);
    expect(count(markdown, "\n_Gemini 3 Pro - 10 turns - reasoning and tool activity left out_\n")).toBe(1);
    expect(clip.skipped).toEqual({});
  });

  it("holds 10 reasoning blocks of 12 bullets with the opt-in on", () => {
    const clip = readGemini(turns, HEX, true);
    expect(count(renderChatClipping(clip), "\n_Reasoning_\n")).toBe(10);
    expect(bullets(clip)).toBe(12);
  });
});

describe.skipIf(!has("gemini-survey-16.json"))("Gemini, 105 turns over two pages, measured", () => {
  it("is 105 and 105 with one reasoning block and two references", () => {
    const turns = geminiTurns("gemini-survey-16.json");
    const markdown = renderChatClipping(readGemini(turns, HEX, true));
    expect(count(markdown, "\n**User**\n")).toBe(105);
    expect(count(markdown, "\n**Gemini**\n")).toBe(105);
    expect(count(markdown, "\n_Reasoning_\n")).toBe(1);
    expect(count(markdown, "](https://www.youtube.com/")).toBe(2);
    expect(count(markdown, "[task confirmation]")).toBe(1);
    expect(placeholders(markdown)).toBe(0);
    expect(privateUse(markdown)).toBe(0);
  });
});

describe.skipIf(!has("gemini-survey-18.json"))("Gemini, 106 turns with cards, measured", () => {
  it("references 18 cards, one video and one task confirmation", () => {
    const markdown = renderChatClipping(readGemini(geminiTurns("gemini-survey-18.json"), HEX, false));
    expect(count(markdown, "\n**User**\n")).toBe(106);
    expect(count(markdown, "[card: ")).toBe(18);
    expect(count(markdown, "](https://www.youtube.com/")).toBe(3);
    expect(count(markdown, "[task confirmation]")).toBe(1);
    expect(placeholders(markdown)).toBe(0);
  });
});

describe.skipIf(!has("gemini-survey-4.json"))("Gemini, sources and a created app, measured", () => {
  let turns: Turn[];
  beforeAll(() => {
    turns = geminiTurns("gemini-survey-4.json");
  });

  it("is 3 turns with two sources lines naming 8 urls and one file pointer", () => {
    const markdown = renderChatClipping(readGemini(turns, HEX, false));
    expect(count(markdown, "\n**User**\n")).toBe(3);
    expect(count(markdown, "\n**Gemini**\n")).toBe(3);
    expect(count(markdown, "\n_Sources: ")).toBe(2);
    // Eight source links plus the banner image line's own `](https://gemini.google.com/...)`.
    expect(count(markdown, "](http")).toBe(9);
    expect(count(markdown, "\n[file: app.html]")).toBe(1);
    const files = geminiFiles(turns);
    expect(files.length).toBe(1);
    expect(files[0].path).toBe("app.html");
    expect(files[0].text.length).toBe(50663);
    expect(files[0].text.startsWith("<!DOCTYPE html>")).toBe(true);
  });

  it("holds 3 reasoning blocks of 20 bullets with the opt-in on", () => {
    const clip = readGemini(turns, HEX, true);
    expect(count(renderChatClipping(clip), "\n_Reasoning_\n")).toBe(3);
    expect(bullets(clip)).toBe(20);
  });
});

describe.skipIf(!has("gemini-survey-20.json"))("Gemini, an image generation, measured", () => {
  it("is one turn whose answer is an image line", () => {
    const clip = readGemini(geminiTurns("gemini-survey-20.json"), HEX, false);
    const markdown = renderChatClipping(clip);
    expect(count(markdown, "\n**User**\n")).toBe(1);
    expect(count(markdown, "\n**Gemini**\n")).toBe(1);
    expect(count(markdown, "[image: ")).toBe(2);
    expect(placeholders(markdown)).toBe(0);
    expect(clip.models).toEqual(["Gemini Nano Banana 2"]);
  });
});

describe.skipIf(!has("gemini-survey-8.json"))("Gemini, ten turns with citations, measured", () => {
  it("is 10 and 10 with six sources lines naming 20 urls, 8 reasoning blocks of 55 bullets", () => {
    const turns = geminiTurns("gemini-survey-8.json");
    const off = renderChatClipping(readGemini(turns, HEX, false));
    expect(count(off, "\n**User**\n")).toBe(10);
    expect(count(off, "\n**Gemini**\n")).toBe(10);
    expect(count(off, "\n_Sources: ")).toBe(6);
    const on = readGemini(turns, HEX, true);
    expect(count(renderChatClipping(on), "\n_Reasoning_\n")).toBe(8);
    expect(bullets(on)).toBe(55);
  });
});

describe.skipIf(!has("gemini-e83053d3.json"))("Gemini, every measured conversation", () => {
  it("reads all 29 with nothing skipped, no placeholder, no private-use character, no joined word", () => {
    const names = readdirSync(PROBES).filter((name) => GEMINI_FILES.test(name));
    expect(names.length).toBe(29);
    for (const name of names) {
      const turns = geminiTurns(name);
      const clip = readGemini(turns, HEX, true);
      const markdown = renderChatClipping(clip);
      expect(clip.turns).toBe(turns.length);
      expect(clip.skipped).toEqual({});
      expect(placeholders(markdown)).toBe(0);
      expect(privateUse(markdown)).toBe(0);
      // User text is verbatim and one measured prompt carries a 30-letter token of its own; the reader adds none.
      expect(joinedWords(markdown)).toBeLessThanOrEqual(joinedWords(JSON.stringify(turns)));
    }
  });
});
