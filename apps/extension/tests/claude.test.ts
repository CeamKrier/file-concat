import { describe, expect, it } from "vitest";
import { type ClaudeConversation, claudeUrl, conversationRef, createdFiles, readConversation, walk } from "../src/claude";

// A made-up uuid: a real conversation id has no place in a public repo.
const ID = "12345678-1234-4123-8123-123456789abc";
const NIL = "00000000-0000-0000-0000-000000000000";

describe("conversationRef", () => {
  it("reads /chat/<uuid> and nothing else", () => {
    expect(conversationRef(`/chat/${ID}`)).toBe(ID);
    for (const path of ["/", "/new", "/chat", "/chat/nope", `/chat/${ID}/x`, `/share/${ID}`, "/project/abc"]) {
      expect(conversationRef(path)).toBeNull();
    }
  });

  it("names the page", () => {
    expect(claudeUrl(ID)).toBe(`https://claude.ai/chat/${ID}`);
  });
});

// ---------- fixture ----------

// Plain objects, cast once at the end: the reader's own types are narrow on
// purpose and a fixture that has to satisfy them would be all casts.
function message(uuid: string, parent: string, sender: "human" | "assistant", content: object[], extra: object = {}) {
  return { uuid, parent_message_uuid: parent, sender, index: 0, created_at: "2026-08-18T09:00:00.000000Z", content, attachments: [], files: [], ...extra };
}

const text = (t: string, citations: { url: string; title: string }[] = []) => ({ type: "text", text: t, citations });

// Two branches off the first question: m2 (abandoned, with an empty aborted
// answer under it) and m3 (the leaf's ancestor).
const fixture = {
  name: "Fixture",
  model: "claude-opus-5",
  current_leaf_message_uuid: "m6",
  chat_messages: [
    message("m1", NIL, "human", [text("First question")], {
      created_at: "2026-08-18T09:00:00.000000Z",
      attachments: [{ file_name: "notes.txt", extracted_content: "line 1\nline 2" }],
      files: [{ file_name: "photo.png", file_kind: "image" }, { file_name: "deck.pdf", file_kind: "document" }],
    }),
    message("m2", "m1", "assistant", [text("Abandoned answer")]),
    message("m2b", "m2", "human", [text("Abandoned follow-up")]),
    message("m2c", "m2b", "assistant", []),
    message("m3", "m1", "assistant", [
      { type: "thinking", thinking: "", summaries: [{ summary: "Reading the file" }, { summary: "Planning" }] },
      { type: "tool_use", name: "web_search", input: { query: "q" } },
      { type: "tool_result", name: "web_search", content: [{ type: "knowledge", title: "A page", url: "https://a.example/" }], is_error: false },
      { type: "tool_use", name: "web_fetch", input: { url: "https://b.example/" } },
      { type: "tool_result", name: "web_fetch", content: [{ type: "text", text: "not reachable" }], is_error: true },
      { type: "tool_use", name: "create_file", input: { path: "/mnt/user-data/outputs/report.md", file_text: "# Report\n\n```js\nx\n```", description: "d" } },
      { type: "tool_result", name: "create_file", content: [{ type: "text", text: "ok" }] },
      { type: "tool_use", name: "present_files", input: { filepaths: ["/mnt/user-data/outputs/report.md"] } },
      { type: "tool_result", name: "present_files", content: [{ type: "local_resource", name: "report.md", file_path: "/mnt/user-data/outputs/report.md" }, { type: "image", file_uuid: "u" }] },
      text("Here it is.", [{ url: "https://a.example/", title: "A page" }, { url: "https://a.example/", title: "A page again" }, { url: "https://c.example/", title: "C" }]),
      { type: "widget", data: {} },
      text("And a second paragraph after a widget."),
    ]),
    message("m4", "m3", "human", [text("Second question")]),
    message("m5", "m4", "assistant", [
      { type: "thinking", thinking: "Long thought text.", summaries: [] },
      { type: "thinking", thinking: "", summaries: [] },
      text(""),
      { type: "tool_use", name: "bash_tool", input: { command: "ls" } },
      { type: "tool_result", name: "bash_tool", content: [{ type: "text", text: "a\nb" }] },
    ]),
    message("m6", "m5", "human", [text("Third, unanswered")]),
  ],
} as unknown as ClaudeConversation;

describe("walk", () => {
  it("follows the leaf to the root and ignores the other branch", () => {
    expect(walk(fixture).map((m) => m.uuid)).toEqual(["m1", "m3", "m4", "m5", "m6"]);
  });

  it("refuses a shape with no messages", () => {
    expect(() => walk({} as ClaudeConversation)).toThrow("Claude changed the shape of this conversation.");
  });
});

describe("createdFiles", () => {
  it("lists every create_file on the walk with its path and text", () => {
    expect(createdFiles(fixture)).toEqual([{ path: "/mnt/user-data/outputs/report.md", text: "# Report\n\n```js\nx\n```" }]);
  });
});

describe("readConversation", () => {
  it("maps every block type on the walk with the opt-in on", () => {
    const clip = readConversation(fixture, ID, true);
    expect(clip.source).toBe(`https://claude.ai/chat/${ID}`);
    expect(clip.assistant).toBe("Claude");
    expect(clip.title).toBe("Fixture");
    expect(clip.models).toEqual(["claude-opus-5"]);
    expect(clip.started).toBe("2026-08-18T09:00:00.000000Z");
    expect(clip.turns).toBe(3);
    expect(clip.redacted).toBe(0);
    expect(clip.skipped).toEqual({ "assistant/widget": 1 });
    expect(clip.blocks).toEqual([
      { kind: "user", text: "First question\n\n[image: photo.png]\n[file: deck.pdf]\n[file: notes.txt]\n\n```\nline 1\nline 2\n```" },
      { kind: "reasoning", entries: [{ summary: "Reading the file", body: "" }, { summary: "Planning", body: "" }], preamble: "" },
      { kind: "call", tool: "web_search", language: "json", text: '{\n  "query": "q"\n}' },
      { kind: "output", tool: "web_search", text: "A page - https://a.example/" },
      { kind: "call", tool: "web_fetch", language: "json", text: '{\n  "url": "https://b.example/"\n}' },
      { kind: "output", tool: "web_fetch (error)", text: "not reachable" },
      { kind: "assistant", text: "[file: /mnt/user-data/outputs/report.md]" },
      { kind: "output", tool: "create_file", text: "ok" },
      { kind: "call", tool: "present_files", language: "json", text: '{\n  "filepaths": [\n    "/mnt/user-data/outputs/report.md"\n  ]\n}' },
      { kind: "output", tool: "present_files", text: "[file: report.md]\n[image]" },
      // The widget between the two text blocks is skipped, not a block, so the
      // two answers are adjacent and merge.
      { kind: "assistant", text: "Here it is.\n\n_Sources: [A page](https://a.example/), [C](https://c.example/)_\n\nAnd a second paragraph after a widget." },
      { kind: "user", text: "Second question" },
      { kind: "reasoning", entries: [], preamble: "Long thought text." },
      { kind: "call", tool: "bash_tool", language: "json", text: '{\n  "command": "ls"\n}' },
      { kind: "output", tool: "bash_tool", text: "a\nb" },
      { kind: "user", text: "Third, unanswered" },
    ]);
  });

  it("keeps the transcript and the file pointers with the opt-in off, and drops the attachment's content", () => {
    const clip = readConversation(fixture, ID, false);
    expect(clip.blocks).toEqual([
      { kind: "user", text: "First question\n\n[image: photo.png]\n[file: deck.pdf]\n[file: notes.txt]" },
      {
        kind: "assistant",
        text: "[file: /mnt/user-data/outputs/report.md]\n\nHere it is.\n\n_Sources: [A page](https://a.example/), [C](https://c.example/)_\n\nAnd a second paragraph after a widget.",
      },
      { kind: "user", text: "Second question" },
      { kind: "user", text: "Third, unanswered" },
    ]);
    expect(clip.skipped).toEqual({ "assistant/widget": 1 });
  });

  it("refuses an empty conversation and falls back to a generic title", () => {
    const empty: ClaudeConversation = { name: "", chat_messages: [], current_leaf_message_uuid: "x" };
    expect(() => readConversation(empty, ID, false)).toThrow("This conversation has no messages yet.");
    const one = { name: "", model: "m", current_leaf_message_uuid: "a", chat_messages: [message("a", NIL, "human", [text("q")])] } as unknown as ClaudeConversation;
    expect(readConversation(one, ID, false).title).toBe("Conversation");
  });

  it("reports a shape change, never a short file, when the walk cannot reach the root", () => {
    // `parent_message_uuid` renamed: the walk from the leaf is one message
    // long and would otherwise render a one-turn file with no error.
    const renamed = JSON.parse(JSON.stringify(fixture)) as ClaudeConversation;
    for (const m of renamed.chat_messages ?? []) {
      (m as unknown as Record<string, unknown>).parent_uuid = m.parent_message_uuid;
      delete (m as unknown as Record<string, unknown>).parent_message_uuid;
    }
    expect(() => readConversation(renamed, ID, false)).toThrow("Claude changed the shape of this conversation.");
    // The leaf pointer renamed: nothing walks, but the messages are there.
    const noLeaf = { ...fixture, current_leaf_message_uuid: undefined } as unknown as ClaudeConversation;
    expect(() => readConversation(noLeaf, ID, false)).toThrow("Claude changed the shape of this conversation.");
    // The words moved: every human message reads as empty.
    const noContent = JSON.parse(JSON.stringify(fixture)) as ClaudeConversation;
    for (const m of noContent.chat_messages ?? []) if (m.sender === "human") Object.assign(m, { content: [], files: [], attachments: [] });
    expect(() => readConversation(noContent, ID, false)).toThrow("Claude changed the shape of this conversation.");
  });

  it("escapes brackets in a source title and parentheses in its url", () => {
    const cited = {
      name: "x",
      model: "m",
      current_leaf_message_uuid: "b",
      chat_messages: [
        message("a", NIL, "human", [text("q")]),
        message("b", "a", "assistant", [text("A.", [{ url: "https://e.example/w(1)", title: "T [v2]" }])]),
      ],
    } as unknown as ClaudeConversation;
    expect(readConversation(cited, ID, false).blocks[1]).toEqual({ kind: "assistant", text: "A.\n\n_Sources: [T \\[v2\\]](https://e.example/w%281%29)_" });
  });
});
