import { describe, expect, it } from "vitest";
import { chatUrl, conversationRef, parseRefId, readConversation, refId, type Conversation } from "../src/chatgpt";

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

// ---------- readConversation ----------

type Node = { id: string; parent: string | null; children: string[]; message: Message | null };
type Message = {
  author: { role: string; name?: string };
  create_time: number | null;
  content: Record<string, unknown> & { content_type: string };
  recipient: string;
  metadata: Record<string, unknown>;
  status: string;
};

function message(
  role: string,
  content: Message["content"],
  extra: Partial<Pick<Message, "recipient" | "metadata" | "create_time">> & { name?: string } = {},
): Message {
  return {
    author: { role, name: extra.name },
    create_time: extra.create_time ?? null,
    content,
    recipient: extra.recipient ?? "all",
    metadata: extra.metadata ?? {},
    status: "finished_successfully",
  };
}

/** A linear chain plus `siblings`: extra children hung off a named parent. */
function conversation(
  chain: (Message | null)[],
  siblings: Record<number, Message[]> = {},
  extra: Record<string, unknown> = {},
): Conversation {
  const mapping: Record<string, Node> = {};
  chain.forEach((message, index) => {
    const id = `n${index}`;
    mapping[id] = { id, parent: index ? `n${index - 1}` : null, children: index + 1 < chain.length ? [`n${index + 1}`] : [], message };
  });
  for (const [at, messages] of Object.entries(siblings)) {
    messages.forEach((message, index) => {
      const id = `s${at}-${index}`;
      mapping[id] = { id, parent: `n${at}`, children: [], message };
      mapping[`n${at}`].children.push(id);
    });
  }
  // Cast once: the reader's own `Message` type is narrower than this helper's.
  return { title: "Fixture", default_model_slug: "gpt-5", mapping, current_node: `n${chain.length - 1}`, ...extra } as unknown as Conversation;
}

const CITE = "\uE200cite\uE202turn0search1\uE201";
const HIDDEN_CITE = "\uE200cite\uE202turn0file2\uE201";
const FILE_CITE = "\uE200filecite\uE202turn3file0\uE202L2-L2\uE201";
const REF = { kind: "c", id: ID } as const;

const fixture = conversation(
  [
    null,
    message("system", { content_type: "text", parts: [""] }, { metadata: { is_visually_hidden_from_conversation: true } }),
    message("user", { content_type: "text", parts: ["First question"] }, { create_time: 1789300000 }),
    message("assistant", { content_type: "model_editable_context", model_editable_context: {} }),
    message("assistant", { content_type: "thoughts", thoughts: [{ summary: "Weighing", content: "body\nmore" }, { summary: "Done", content: "" }] }, { metadata: { model_slug: "gpt-5" } }),
    message("assistant", { content_type: "text", parts: ["Let me look."] }, { metadata: { is_thinking_preamble_message: true } }),
    message("assistant", { content_type: "code", text: "print(1)", language: "unknown" }, { recipient: "python" }),
    message("tool", { content_type: "execution_output", text: "1" }, { name: "python" }),
    message("assistant", { content_type: "text", parts: [""] }, { recipient: "web.run" }),
    message("assistant", { content_type: "code", text: "{\"q\": 1}", language: "json" }, { recipient: "web.run" }),
    message("tool", { content_type: "text", parts: ["The output of this plugin was redacted."] }, { name: "web.run", metadata: { is_redacted: true } }),
    message("tool", { content_type: "text", parts: [""] }, { name: "web.run" }),
    message("tool", { content_type: "tether_browsing_display", result: "" }, { name: "web.run" }),
    message("assistant", { content_type: "text", parts: ["call me"] }, { recipient: "api_tool.call_tool" }),
    message("tool", { content_type: "multimodal_text", parts: [`header\n`, `result ${FILE_CITE} end`] }, { name: "api_tool.call_tool" }),
    message("assistant", { content_type: "reasoning_recap", content: "Worked for 3s" }),
    message("assistant", { content_type: "text", parts: [`Answer${CITE} and more${HIDDEN_CITE}.`] }, {
      metadata: {
        model_slug: "gpt-5-mini",
        content_references: [
          { matched_text: CITE, alt: " ([Site](https://example.com))" },
          { matched_text: HIDDEN_CITE, alt: "" },
        ],
      },
    }),
    message("user", { content_type: "multimodal_text", parts: [{ content_type: "image_asset_pointer", asset_pointer: "x" }, "What is this?"] }, { create_time: 1789300100 }),
    message("assistant", { content_type: "multimodal_text", parts: ["A picture.", { content_type: "image_asset_pointer", asset_pointer: "y" }] }),
    message("user", { content_type: "text", parts: ["Last, unanswered"] }, { create_time: 1789300200 }),
    message("assistant", { content_type: "text", parts: [""] }),
  ],
  // An edited first question: the sibling is the abandoned branch, and the walk
  // from current_node must never see it.
  { 1: [message("user", { content_type: "text", parts: ["Abandoned edit"] })] },
);

describe("readConversation", () => {
  it("walks the current branch and maps every known type", () => {
    const clip = readConversation(fixture, REF, true);
    expect(clip.source).toBe(`https://chatgpt.com/c/${REF.id}`);
    expect(clip.assistant).toBe("ChatGPT");
    expect(clip.title).toBe("Fixture");
    expect(clip.models).toEqual(["gpt-5", "gpt-5-mini"]);
    expect(clip.started).toBe("2026-09-13T11:46:40.000Z");
    expect(clip.turns).toBe(3);
    expect(clip.redacted).toBe(1);
    expect(clip.skipped).toEqual({ tether_browsing_display: 1 });
    expect(clip.blocks).toEqual([
      { kind: "user", text: "First question" },
      { kind: "reasoning", entries: [{ summary: "Weighing", body: "body\nmore" }, { summary: "Done", body: "" }], preamble: "Let me look." },
      { kind: "call", tool: "python", language: "python", text: "print(1)" },
      { kind: "output", tool: "python", text: "1" },
      { kind: "call", tool: "web.run", language: "json", text: "{\"q\": 1}" },
      { kind: "call", tool: "api_tool.call_tool", language: "", text: "call me" },
      { kind: "output", tool: "api_tool.call_tool", text: "header\n\nresult  end" },
      { kind: "recap", text: "Worked for 3s" },
      { kind: "assistant", text: "Answer ([Site](https://example.com)) and more." },
      { kind: "user", text: "[image]\nWhat is this?" },
      { kind: "assistant", text: "A picture.\n[image]" },
      { kind: "user", text: "Last, unanswered" },
    ]);
  });

  it("keeps only the transcript with the opt-in off and counts nothing redacted", () => {
    const clip = readConversation(fixture, REF, false);
    expect(clip.blocks.map((block) => block.kind)).toEqual(["user", "assistant", "user", "assistant", "user"]);
    expect(clip.redacted).toBe(0);
    // The skip count does not depend on the opt-in.
    expect(clip.skipped).toEqual({ tether_browsing_display: 1 });
    expect(clip.activity).toBe(false);
  });

  it("leaves no private-use character behind", () => {
    const clip = readConversation(fixture, REF, true);
    const text = clip.blocks.map((block) => ("text" in block ? block.text : "")).join("");
    expect(text).not.toMatch(/[\uE000-\uF8FF]/);
  });

  it("keeps the spaces of an answer whose sources footnote matched a single space", () => {
    // Measured 2026-09-14: 31 of 249 references on one conversation are
    // `sources_footnote` entries with `matched_text: " "`. Replacing those
    // stripped every space from the answer.
    const footnote = conversation([
      null,
      message("user", { content_type: "text", parts: ["q"] }),
      message("assistant", { content_type: "text", parts: ["Two words here."] }, {
        metadata: { content_references: [{ type: "sources_footnote", matched_text: " ", alt: "" }] },
      }),
    ]);
    expect(readConversation(footnote, REF, false).blocks[1]).toEqual({ kind: "assistant", text: "Two words here." });
  });

  it("merges two answers that follow each other into one block", () => {
    const two = conversation([
      null,
      message("user", { content_type: "text", parts: ["q"] }),
      message("assistant", { content_type: "text", parts: ["one"] }),
      message("assistant", { content_type: "text", parts: ["two"] }),
    ]);
    expect(readConversation(two, REF, false).blocks).toEqual([
      { kind: "user", text: "q" },
      { kind: "assistant", text: "one\n\ntwo" },
    ]);
  });

  it("refuses a conversation with no user message, and one whose shape changed", () => {
    const empty = conversation([null, message("assistant", { content_type: "text", parts: ["hello"] })]);
    expect(() => readConversation(empty, REF, false)).toThrow("This conversation has no messages yet.");
    expect(() => readConversation({} as Conversation, REF, false)).toThrow("ChatGPT changed the shape of this conversation.");
    const headless = conversation([null, message("user", { content_type: "text", parts: ["q"] })]);
    (headless.mapping as unknown as Record<string, { message: Record<string, unknown> }>).n1.message.content = undefined;
    expect(() => readConversation(headless, REF, false)).toThrow("ChatGPT changed the shape of this conversation.");
  });

  it("reports a shape change, never a short file, when the walk cannot reach the root", () => {
    type Loose = Record<string, Record<string, unknown>>;
    // `parent` renamed on every node: the walk from a user leaf is one node
    // long and would otherwise render a one-turn file with no error.
    const renamed = JSON.parse(JSON.stringify(fixture)) as Conversation;
    for (const node of Object.values(renamed.mapping as unknown as Loose)) {
      node.parent_id = node.parent;
      delete node.parent;
    }
    expect(() => readConversation(renamed, REF, false)).toThrow("ChatGPT changed the shape of this conversation.");
    // A parent the mapping does not hold.
    const dangling = JSON.parse(JSON.stringify(fixture)) as Conversation;
    (dangling.mapping as unknown as Loose).n2.parent = "gone";
    expect(() => readConversation(dangling, REF, false)).toThrow("ChatGPT changed the shape of this conversation.");
    // `parts` renamed: every user message reads as empty, which is not "no messages yet".
    const noParts = JSON.parse(JSON.stringify(fixture)) as Conversation;
    for (const node of Object.values(noParts.mapping as unknown as Loose)) {
      const content = (node.message as { content?: Record<string, unknown> } | null)?.content;
      if (content?.parts) {
        content.content_parts = content.parts;
        delete content.parts;
      }
    }
    expect(() => readConversation(noParts, REF, false)).toThrow("ChatGPT changed the shape of this conversation.");
  });

  it("reads a voice turn's transcription and names any other part it does not know", () => {
    const voice = conversation([
      null,
      message("user", { content_type: "multimodal_text", parts: [{ content_type: "audio_transcription", text: "Spoken question" }, { content_type: "audio_asset_pointer", asset_pointer: "a" }] }),
      message("assistant", { content_type: "multimodal_text", parts: [{ content_type: "audio_transcription", text: "Spoken answer" }, { content_type: "real_time_user_audio_video_asset_pointer" }] }),
    ]);
    const clip = readConversation(voice, REF, false);
    expect(clip.blocks).toEqual([
      { kind: "user", text: "Spoken question" },
      { kind: "assistant", text: "Spoken answer" },
    ]);
    expect(clip.skipped).toEqual({ "part/audio_asset_pointer": 1, "part/real_time_user_audio_video_asset_pointer": 1 });
  });

  it("falls back to a generic title", () => {
    expect(readConversation(conversation([null, message("user", { content_type: "text", parts: ["q"] })], {}, { title: "" }), REF, false).title).toBe("Conversation");
  });
});
