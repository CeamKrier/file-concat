import { describe, expect, it } from "vitest";
import { strToU8 } from "fflate";
import { routeBytes } from "../src/file-processing/routing";
import { extractNotebook } from "../src/file-processing/parsers/notebook";
import { extractSubtitles } from "../src/file-processing/parsers/subtitles";

const utf8 = (s: string) => strToU8(s);

const notebook = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    cells: [
      { cell_type: "markdown", source: ["# Title\n", "\n", "Some prose.\n"] },
      {
        cell_type: "code",
        execution_count: 1,
        source: ["import pandas as pd\n", "df.head()\n"],
        outputs: [
          { output_type: "stream", name: "stdout", text: ["loading…\n"] },
          {
            output_type: "execute_result",
            data: { "text/plain": ["   a  b\n0  1  2"], "text/html": ["<table/>"] },
          },
          { output_type: "display_data", data: { "image/png": "iVBORw0KGgoAAAANSUhEUg==" } },
        ],
      },
    ],
    metadata: { language_info: { name: "python" } },
    nbformat: 4,
    nbformat_minor: 5,
    ...extra,
  });

const SRT = [
  "1",
  "00:00:01,000 --> 00:00:04,000",
  "Hello there.",
  "",
  "2",
  "00:00:04,500 --> 00:00:07,000",
  "Hello there.",
  "General Kenobi.",
  "",
].join("\r\n");

const VTT = [
  "WEBVTT - Auto-generated",
  "Kind: captions",
  "",
  "NOTE this block is metadata",
  "",
  "00:00:00.030 --> 00:00:02.669 align:start position:0%",
  "hello<00:00:00.630><c> everyone</c>",
  "",
  "00:00:02.669 --> 00:00:05.100 align:start position:0%",
  "hello everyone",
  "welcome &amp; thanks",
  "",
].join("\n");

describe("routing text-shaped documents", () => {
  it("routes a notebook to the notebook parser", async () => {
    expect(await routeBytes(utf8(notebook()))).toEqual({
      kind: "extract",
      parserId: "notebook",
      format: "ipynb",
    });
  });

  it("routes an empty notebook, which has no cell to match on", async () => {
    const empty = JSON.stringify({ cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 });
    expect(await routeBytes(utf8(empty))).toEqual({
      kind: "extract",
      parserId: "notebook",
      format: "ipynb",
    });
  });

  it("routes SubRip and WebVTT to the subtitle parser", async () => {
    expect(await routeBytes(utf8(SRT))).toEqual({
      kind: "extract",
      parserId: "subtitles",
      format: "srt",
    });
    expect(await routeBytes(utf8(VTT))).toEqual({
      kind: "extract",
      parserId: "subtitles",
      format: "vtt",
    });
  });

  it("reads the signature, not the extension — a renamed file routes the same", async () => {
    // The whole point of ADR-0011: `routeBytes` never sees a filename, so a
    // notebook saved as `.json` and a transcript saved as `.txt` land correctly.
    expect((await routeBytes(utf8(notebook()))).kind).toBe("extract");
    expect((await routeBytes(utf8(SRT))).kind).toBe("extract");
  });

  it("leaves ordinary JSON alone", async () => {
    const config = JSON.stringify({ cells: 3, name: "spreadsheet-ish" });
    expect(await routeBytes(utf8(config))).toEqual({ kind: "unknown" });
    expect(await routeBytes(utf8(`{"compilerOptions":{"strict":true}}`))).toEqual({
      kind: "unknown",
    });
  });

  it("leaves prose that merely opens with a number alone", async () => {
    expect(await routeBytes(utf8("1\nA numbered list, not a cue.\n"))).toEqual({ kind: "unknown" });
    expect(await routeBytes(utf8("WEBVTTISH is a word I made up"))).toEqual({ kind: "unknown" });
  });
});

describe("extractNotebook", () => {
  it("renders prose verbatim and fences code in the notebook's language", () => {
    const { text } = extractNotebook(utf8(notebook()));
    expect(text).toContain("# Title\n\nSome prose.");
    expect(text).toContain("```python\nimport pandas as pd\ndf.head()\n```");
  });

  it("keeps text outputs and drops the base64 image, counted", () => {
    const { text, notes } = extractNotebook(utf8(notebook()));
    expect(text).toContain("loading…");
    expect(text).toContain("   a  b\n0  1  2");
    expect(text).not.toContain("iVBORw0KGgo");
    // ADR-0008: what could not be carried is reported, never silently dropped.
    expect(notes).toEqual([{ kind: "attachments-skipped", count: 1 }]);
  });

  it("keeps a traceback, without the terminal colour codes", () => {
    const errored = JSON.stringify({
      cells: [
        {
          cell_type: "code",
          source: "boom()",
          outputs: [
            {
              output_type: "error",
              ename: "NameError",
              evalue: "name 'boom' is not defined",
              traceback: ["\u001B[0;31mNameError\u001B[0m: not defined"],
            },
          ],
        },
      ],
      nbformat: 4,
    });
    const { text } = extractNotebook(utf8(errored));
    expect(text).toContain("NameError: name 'boom' is not defined");
    expect(text).toContain("NameError: not defined");
    expect(text).not.toContain("\u001B");
  });

  it("answers 'couldn't extract' for JSON that is not a notebook", () => {
    expect(extractNotebook(utf8(`{"cells": "not an array"}`))).toEqual({ text: "" });
    expect(extractNotebook(utf8("not json at all"))).toEqual({ text: "" });
  });
});

describe("extractSubtitles", () => {
  it("drops cue indices and timestamps", () => {
    const { text } = extractSubtitles(utf8(SRT));
    expect(text).not.toContain("-->");
    expect(text).not.toMatch(/^\d+$/m);
    expect(text).toContain("General Kenobi.");
  });

  it("collapses the line a rolling caption repeats", () => {
    // The reason this parser exists: machine captions restate the previous line
    // in every cue, so an hour of speech costs several times what it should.
    expect(extractSubtitles(utf8(SRT)).text).toBe("Hello there.\nGeneral Kenobi.");
  });

  it("strips WebVTT markup, headers and NOTE blocks", () => {
    const { text } = extractSubtitles(utf8(VTT));
    expect(text).toBe("hello everyone\nwelcome & thanks");
    expect(text).not.toContain("WEBVTT");
    expect(text).not.toContain("metadata");
  });

  it("does not read a cue's identifier out as dialogue", () => {
    // WebVTT lets a cue carry a name above its timing line. `intro` is a label
    // on the cue, and arriving as a line of transcript it reads as speech.
    const named = ["WEBVTT", "", "intro", "00:00:01.000 --> 00:00:02.000", "Good evening.", ""];
    expect(extractSubtitles(utf8(named.join("\n"))).text).toBe("Good evening.");
  });

  it("keeps a cue whose text is only a number", () => {
    // The identifier used to be recognised by being a number rather than by
    // sitting above the timing line, which deleted this line too.
    const counted = ["1", "00:00:01,000 --> 00:00:02,000", "1999", ""];
    expect(extractSubtitles(utf8(counted.join("\n"))).text).toBe("1999");
  });

  it("keeps the name a voice span carries", () => {
    // The speaker is data, the tag around it is markup. Stripping both leaves a
    // two-person interview as one monologue with no way back.
    const spoken = [
      "WEBVTT",
      "",
      "00:00:01.000 --> 00:00:02.000",
      "<v Roger Bingham>It is a lovely day.",
      "",
      "00:00:02.000 --> 00:00:03.000",
      "<v.loud Neil deGrasse Tyson>It is indeed.</v>",
      "",
    ];
    expect(extractSubtitles(utf8(spoken.join("\n"))).text).toBe(
      "Roger Bingham: It is a lovely day.\nNeil deGrasse Tyson: It is indeed.",
    );
  });

  it("answers 'couldn't extract' for a track with cues but no words", () => {
    const silent = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n\n";
    expect(extractSubtitles(utf8(silent))).toEqual({ text: "" });
  });
});
