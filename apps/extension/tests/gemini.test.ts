import { afterEach, describe, expect, it, vi } from "vitest";
import {
  conversationRef,
  createdFiles,
  fetchConversation,
  geminiUrl,
  parseBatch,
  readConversation,
  readToken,
  SHAPE_CHANGED,
  type Turn,
} from "../src/gemini";
import { renderChatClipping } from "../src/markdown";

// A made-up id: a real conversation id has no place in a public repo.
const ID = "0123456789abcdef";

// The envelope: a magic prefix, a blank line, then <length>\n<json> chunks.
// The length is not a JS string index, so the parser goes by lines. Shared
// by parseBatch's own tests and fetchConversation's fake responses.
const body = (payload: unknown) =>
  `)]}'\n\n123\n${JSON.stringify([["wrb.fr", "hNvQHb", JSON.stringify(payload), null, null, null, "generic"]])}\n45\n[["di",947],["af.httprm",947,"-1234",5]]\n12\n[["e",4,null,null,999]]\n`;

describe("conversationRef", () => {
  it("reads /app/<16 hex> and nothing else", () => {
    expect(conversationRef(`/app/${ID}`)).toBe(ID);
    for (const path of ["/", "/app", "/app/", "/app/nope", `/app/${ID}/x`, `/gem/abc/${ID}`, `/share/${ID}`, "/app/0123456789ABCDEF", `/app/${ID}?hl=tr`]) {
      expect(conversationRef(path)).toBeNull();
    }
  });

  it("names the page", () => {
    expect(geminiUrl(ID)).toBe(`https://gemini.google.com/app/${ID}`);
  });
});

describe("parseBatch", () => {
  it("returns the hNvQHb payload", () => {
    const payload = [[["t"]], "cursor", null, [[[]]]];
    expect(parseBatch(body(payload))).toEqual(payload);
  });

  it("returns null when the entry's payload is null (no such conversation)", () => {
    const text = `)]}'\n\n90\n${JSON.stringify([["wrb.fr", "hNvQHb", null, null, null, [5, null, [["type.googleapis.com/x", [11]]]], "generic"]])}\n`;
    expect(parseBatch(text)).toBeNull();
  });

  it("throws the shape error when no wrb.fr entry is found or the payload is not turns", () => {
    expect(() => parseBatch(`)]}'\n\n40\n[["er",null,null,null,null,[400]]]\n`)).toThrow(SHAPE_CHANGED);
    expect(() => parseBatch("<html>bot check</html>")).toThrow(SHAPE_CHANGED);
    expect(() => parseBatch(body({ not: "turns" }))).toThrow(SHAPE_CHANGED);
    expect(() => parseBatch(body("[not json"))).toThrow(SHAPE_CHANGED);
    expect(() => parseBatch(body(["x"]))).toThrow(SHAPE_CHANGED);
  });
});

describe("readToken", () => {
  it("finds SNlM0e in the page's inline script and nothing else", () => {
    const html = `<script>window.WIZ_global_data = {"FdrFJe":"123","SNlM0e":"AKz:1234567890:abc-def_+/=","cfb2h":"x"};</script>`;
    expect(readToken(html)).toBe("AKz:1234567890:abc-def_+/=");
    expect(readToken("<html></html>")).toBeNull();
    expect(readToken(`"SNlM0e":""`)).toBeNull();
  });
});

// ---------- fixture ----------

// Positional, like the RPC. Built by helpers so a slot's meaning is written
// once; `null` fills every position the reader does not read.
const nulls = (n: number): null[] => Array<null>(n).fill(null);

/** An upload or a generated image: [null, kind, name, imageUrl, ..., mime, ..., [w, h, bytes]]. */
const file = (kind: number, name: string, mime: string) => [null, kind, name, kind === 1 ? "https://lh3.googleusercontent.com/x" : null, null, "tok", null, null, 1, [1, 0], null, mime, null, null, null, kind === 1 ? [10, 10, 100] : null];

/** turn[2]: [[text, null, null, null, [[null, null, null, newFiles, allFiles]]], 2, null, 0, hex16, 0]. */
const userTurn = (text: string, files: unknown[] = [], all: unknown[] = files) => [[text, null, null, null, files.length || all.length ? [[null, null, null, files.length ? files : null, all]] : null], 2, null, 0, "0000000000000000", 0];

/** turn[3]: [candidates, chips, null, rcid, chips, ..., label at 21]. */
const modelTurn = (candidates: unknown[], label = "3 Pro") => [candidates, null, null, "rc_x", [[null, [], null, null, null, ["Follow-up?"]]], null, null, null, "tr", true, false, null, null, null, "0000000000000000", null, null, "0000000000000000", null, null, null, label, null, null, 3];

interface CandidateSpec {
  text: string;
  citations?: [string, string][][];
  sections?: [string, string][];
  thinking?: string;
  rich?: unknown;
}

/** candidate: [rcid, [text], citations at 2, ..., rich at 12, ..., thinking at 37]. */
function candidate({ text, citations, sections, thinking, rich }: CandidateSpec): unknown[] {
  const c: unknown[] = nulls(44);
  c[0] = "rc_x";
  c[1] = [text];
  if (citations) c[2] = [null, citations.map((sources, i) => [[`snippet ${i}`, null, null, [[0, 5]]], [1], sources.map(([url, title]) => [url, title, "https://favicon.example/", "desc"]), `id${i}`])];
  c[9] = "tr";
  c[12] = rich ?? [null, null, null, null, null, null, [0], []];
  if (sections) {
    // The real section carries the markdown at [0][0] and a plain-text copy
    // at [6]; the reader takes [0][0].
    c[37] = [[thinking ?? sections.map(([, body]) => body).join("\n")], sections.map(([title, body]) => [[body], "", "", "", [], title, body])];
  } else if (thinking !== undefined) {
    c[37] = [[thinking]];
  }
  return c;
}

const seconds = (n: number) => [1_768_000_000 + n * 100, 0];

/** Three turns, newest first, like the RPC. */
const TURNS: Turn[] = [
  // Turn C, the newest: everything the answer can carry.
  [
    ["c_x", "r_c"],
    ["c_x", "r_c", "rc_c"],
    userTurn("Third question", [], [file(1, "photo.jpg", "image/jpeg"), file(11, "deck.pdf", "application/pdf")]),
    modelTurn(
      [
        candidate({
          text: [
            "See http://googleusercontent.com/youtube_content/0 and http://googleusercontent.com/card_content/0.",
            "http://googleusercontent.com/image_generation_content/0",
            "Also http://googleusercontent.com/task_confirmation_content/0 and http://googleusercontent.com/youtube_content/7.",
          ].join("\n\n"),
          citations: [
            [["https://a.example/", "A page"], ["https://b.example/", "B page"]],
            [["https://a.example/", "A page again"]],
          ],
          sections: [["Reading", "Read the **question**."], ["Planning", "Plan\nthe answer."]],
          // The real slot 12 is an array whose element 0 is an object with
          // numeric keys; an array spread into an object gives the same
          // indexable shape.
          rich: {
            ...[null, null, null, null, [[["https://thumb.example/", null, null, null, null, null, ["YouTube", "https://g.example/", null, "id"]], null, null, null, [[["A video", "vid", "https://www.youtube.com/watch?v=vid", "Channel"]]]]]],
            0: { 7: [3], 8: [[[[null, null, null, file(1, "generated.png", "image/png")]]]], 77: [["app_1", null, null, "<!DOCTYPE html>\n<html><body>app</body></html>\n"]] },
            27: [[[["https://c.example/", null, null, "{}"], null, null, null, null, "A description", "Weather in Town"]]],
          },
        }),
        // The A/B comparison candidate: always empty, never shown.
        candidate({ text: "", thinking: "" }),
      ],
      "3.1 Pro",
    ),
    seconds(3),
  ],
  // Turn B: uploads on this turn and an empty thinking slot (old conversations).
  [
    ["c_x", "r_b"],
    ["c_x", "r_b", "rc_b"],
    userTurn("Second question", [file(1, "photo.jpg", "image/jpeg"), file(11, "deck.pdf", "application/pdf")]),
    modelTurn([candidate({ text: "Second answer", thinking: "" })]),
    seconds(2),
  ],
  // Turn A, the oldest: plain.
  [
    ["c_x", "r_a"],
    ["c_x", "r_a", "rc_a"],
    userTurn("First question"),
    modelTurn([candidate({ text: "First answer" })]),
    seconds(1),
  ],
];

describe("readConversation", () => {
  it("reads oldest first, one user and one assistant block per turn, with the opt-in off", () => {
    const clip = readConversation(TURNS, ID, false);
    expect(clip.assistant).toBe("Gemini");
    expect(clip.source).toBe(geminiUrl(ID));
    expect(clip.title).toBe("Conversation");
    expect(clip.turns).toBe(3);
    expect(clip.models).toEqual(["Gemini 3 Pro", "Gemini 3.1 Pro"]);
    expect(clip.started).toBe(new Date(1_768_000_100 * 1000).toISOString());
    expect(clip.blocks.map((block) => block.kind)).toEqual(["user", "assistant", "user", "assistant", "user", "assistant"]);
    expect(clip.blocks[0]).toEqual({ kind: "user", text: "First question" });
    expect(clip.blocks[1]).toEqual({ kind: "assistant", text: "First answer" });
    expect(clip.blocks[4]).toEqual({ kind: "user", text: "Third question" });
    expect(clip.skipped).toEqual({});
    expect(clip.redacted).toBe(0);
    const markdown = renderChatClipping(clip);
    expect(markdown).toContain('\ntitle: "Conversation"\n');
    expect(markdown).toContain("\n_Gemini 3 Pro, Gemini 3.1 Pro - 3 turns - reasoning and tool activity left out_\n");
    expect(markdown).toContain("\n**Gemini**\n");
  });

  it("lists this turn's uploads after the question, images and files apart", () => {
    const clip = readConversation(TURNS, ID, false);
    expect(clip.blocks[2]).toEqual({ kind: "user", text: "Second question\n\n[image: photo.jpg]\n[file: deck.pdf]" });
  });

  it("replaces placeholders with references, appends the sources line and the created file", () => {
    const clip = readConversation(TURNS, ID, false);
    const answer = clip.blocks[5];
    expect(answer.kind).toBe("assistant");
    const text = (answer as { text: string }).text;
    expect(text).toBe(
      [
        "See [A video](https://www.youtube.com/watch?v=vid) and [card: Weather in Town].",
        "",
        "[image: generated.png]",
        "",
        "Also [task confirmation] and [video].",
        "",
        "_Sources: [A page](https://a.example/), [B page](https://b.example/)_",
        "",
        "[file: app.html]",
      ].join("\n"),
    );
    expect(text).not.toContain("googleusercontent.com");
  });

  it("renders thinking sections as bullets with bodies, and drops an empty slot, with the opt-in on", () => {
    const clip = readConversation(TURNS, ID, true);
    expect(clip.blocks.map((block) => block.kind)).toEqual(["user", "assistant", "user", "assistant", "user", "reasoning", "assistant"]);
    expect(clip.blocks[5]).toEqual({
      kind: "reasoning",
      entries: [
        { summary: "Reading", body: "Read the **question**." },
        { summary: "Planning", body: "Plan\nthe answer." },
      ],
      preamble: "",
    });
  });

  it("uses the full thinking text as a preamble when there is no section", () => {
    const turns: Turn[] = [[["c", "r"], ["c", "r", "rc"], userTurn("Q"), modelTurn([candidate({ text: "A", thinking: "Free-form thought" })]), seconds(1)]];
    const clip = readConversation(turns, ID, true);
    expect(clip.blocks[1]).toEqual({ kind: "reasoning", entries: [], preamble: "Free-form thought" });
  });

  it("takes candidate 0 even when a second, empty candidate follows", () => {
    const clip = readConversation(TURNS, ID, false);
    expect(clip.blocks.filter((block) => block.kind === "assistant").length).toBe(3);
  });

  it("throws on an empty conversation and on a turn whose text slot moved", () => {
    expect(() => readConversation([], ID, false)).toThrow("This conversation has no messages yet.");
    const moved: Turn[] = [[["c", "r"], ["c", "r", "rc"], [[null, "Q"]], modelTurn([candidate({ text: "A" })]), seconds(1)]];
    expect(() => readConversation(moved, ID, false)).toThrow(SHAPE_CHANGED);
  });

  it("names a turn with no answer and refuses a conversation with none", () => {
    const turns: Turn[] = [
      [["c", "r2"], ["c", "r2", "rc2"], userTurn("Q2"), null, seconds(2)],
      [["c", "r1"], ["c", "r1", "rc1"], userTurn("Q1"), modelTurn([candidate({ text: "A1" })]), seconds(1)],
    ];
    const clip = readConversation(turns, ID, false);
    expect(clip.turns).toBe(2);
    expect(clip.blocks[3]).toEqual({ kind: "assistant", text: "[no answer]" });

    const none: Turn[] = [[["c", "r"], ["c", "r", "rc"], userTurn("Q"), null, seconds(1)]];
    expect(() => readConversation(none, ID, false)).toThrow(SHAPE_CHANGED);
  });
});

describe("createdFiles", () => {
  it("returns every HTML document in turn order, named app.html", () => {
    expect(createdFiles(TURNS)).toEqual([{ path: "app.html", text: "<!DOCTYPE html>\n<html><body>app</body></html>\n" }]);
    expect(createdFiles(TURNS.slice(1))).toEqual([]);
  });

  it("numbers a second document app-2.html and points at it by that name", () => {
    const doc = (html: string) => ({ ...[null, null, null, null, null, null, [0], []], 0: { 77: [["app_x", null, null, html]] } });
    const turns: Turn[] = [
      [["c", "r2"], ["c", "r2", "rc2"], userTurn("Q2"), modelTurn([candidate({ text: "A2", rich: doc("<html>2</html>") })]), seconds(2)],
      [["c", "r1"], ["c", "r1", "rc1"], userTurn("Q1"), modelTurn([candidate({ text: "A1", rich: doc("<html>1</html>") })]), seconds(1)],
    ];
    expect(createdFiles(turns)).toEqual([{ path: "app.html", text: "<html>1</html>" }, { path: "app-2.html", text: "<html>2</html>" }]);
    const clip = readConversation(turns, ID, false);
    expect(clip.blocks[1]).toEqual({ kind: "assistant", text: "A1\n\n[file: app.html]" });
    expect(clip.blocks[3]).toEqual({ kind: "assistant", text: "A2\n\n[file: app-2.html]" });
  });
});

describe("fetchConversation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const signedIn = () => vi.stubGlobal("document", { documentElement: { innerHTML: '"SNlM0e":"tok"' } });

  it("pages through the cursor until the server answers none", async () => {
    const turnA: Turn = ["turn-a"];
    const turnB: Turn = ["turn-b"];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(body([[turnA], "cur", null, [[[]]]]), { status: 200 }))
      .mockResolvedValueOnce(new Response(body([[turnB], null, null, [[[]]]]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    signedIn();

    const turns = await fetchConversation(ID);
    expect(turns).toEqual([turnA, turnB]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    for (const call of fetchMock.mock.calls) {
      expect(call[0]).toBe("/_/BardChatUi/data/batchexecute?rpcids=hNvQHb");
      expect(call[1]?.method).toBe("POST");
    }

    const firstBody = fetchMock.mock.calls[0][1]?.body as string;
    const secondBody = fetchMock.mock.calls[1][1]?.body as string;
    expect(new URLSearchParams(firstBody).get("at")).toBe("tok");
    expect(new URLSearchParams(secondBody).get("at")).toBe("tok");

    const firstReq = JSON.parse(new URLSearchParams(firstBody).get("f.req") as string);
    expect(firstReq).toEqual([[["hNvQHb", expect.any(String), null, "generic"]]]);
    expect(JSON.parse(firstReq[0][0][1])).toEqual([`c_${ID}`, 100, null, 1, [0], [4], null, 1]);

    const secondReq = JSON.parse(new URLSearchParams(secondBody).get("f.req") as string);
    expect(JSON.parse(secondReq[0][0][1])[2]).toBe("cur");
  });

  it("refuses on a status that means the account cannot see this conversation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 400 })));
    signedIn();
    await expect(fetchConversation(ID)).rejects.toThrow("Gemini would not hand over this conversation. Sign in and reload the page.");
  });

  it("refuses on a null payload: no conversation at this id", async () => {
    const text = `)]}'\n\n90\n${JSON.stringify([["wrb.fr", "hNvQHb", null, null, null, [5, null, [["type.googleapis.com/x", [11]]]], "generic"]])}\n`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(text, { status: 200 })));
    signedIn();
    await expect(fetchConversation(ID)).rejects.toThrow("Gemini has no conversation at this address.");
  });

  it("refuses with no token in the page, and never calls fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("document", { documentElement: { innerHTML: "<html></html>" } });
    await expect(fetchConversation(ID)).rejects.toThrow("Sign in to Gemini to clip this conversation.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
