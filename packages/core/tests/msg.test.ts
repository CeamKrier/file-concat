import { describe, expect, it } from "vitest";
import { formatMsg } from "../src/file-processing/parsers/msg";

const utf16 = (s: string): Uint8Array => {
  const out = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    out[i * 2] = code & 0xff;
    out[i * 2 + 1] = code >> 8;
  }
  return out;
};
const ansi = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

/** FILETIME: 100 ns ticks since 1601-01-01, as an 8-byte little-endian integer. */
function filetime(iso: string): Uint8Array {
  const ticks = BigInt(Date.parse(iso) + 11644473600000) * 10000n;
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, ticks, true);
  return out;
}

/**
 * The top-level property stream: a 32-byte header, then 16-byte entries of
 * property id, type, flags and value.
 */
function properties(entries: ReadonlyArray<[id: number, type: number, value: Uint8Array | number]>): Uint8Array {
  const out = new Uint8Array(32 + entries.length * 16);
  const view = new DataView(out.buffer);
  entries.forEach(([id, type, value], index) => {
    const at = 32 + index * 16;
    view.setUint16(at, type, true);
    view.setUint16(at + 2, id, true);
    if (typeof value === "number") view.setUint32(at + 8, value, true);
    else out.set(value, at + 8);
  });
  return out;
}

const SENT = "2026-09-15T08:30:00.000Z";

function message(overrides: Record<string, Uint8Array> = {}): Map<string, Uint8Array> {
  return new Map(
    Object.entries({
      "__substg1.0_0037001F": utf16("Quarterly numbers"),
      "__substg1.0_1000001F": utf16("Numbers are attached.\r\nRevenue is up 12% on the quarter."),
      "__substg1.0_0C1A001F": utf16("Alice Example"),
      "__substg1.0_5D01001F": utf16("alice@example.com"),
      "__substg1.0_0E04001F": utf16("Bob; Carol Example"),
      "__substg1.0_0E03001F": utf16("Dave"),
      "__properties_version1.0": properties([
        [0x0e06, 0x0040, filetime(SENT)],
        [0x3ffd, 0x0003, 1252],
      ]),
      "__attach_version1.0_#00000000/__substg1.0_3707001F": utf16("q3.pdf"),
      ...overrides,
    }),
  );
}

describe("formatMsg", () => {
  it("renders an Outlook message the way an .eml is rendered", () => {
    const { text, notes } = formatMsg(message());
    expect(text).toBe(
      [
        "From: Alice Example <alice@example.com>",
        "To: Bob, Carol Example",
        "Cc: Dave",
        `Date: ${new Date(SENT).toUTCString()}`,
        "Subject: Quarterly numbers",
        "",
        "Numbers are attached.\nRevenue is up 12% on the quarter.",
        "",
        "Attachments (1, not included): q3.pdf",
      ].join("\n"),
    );
    expect(notes).toEqual([{ kind: "attachments-skipped", count: 1 }]);
  });

  it("reads the 8-bit strings an older client writes, through the message's own code page", () => {
    const streams = message();
    streams.delete("__substg1.0_0037001F");
    streams.set("__substg1.0_0037001E", ansi("R\xe9sum\xe9"));
    expect(formatMsg(streams).text).toContain("Subject: R\u00e9sum\u00e9");
  });

  it("flattens an HTML-only body, as the new Outlook writes them", () => {
    const streams = message();
    streams.delete("__substg1.0_1000001F");
    streams.set("__substg1.0_10130102", new TextEncoder().encode("<html><body><p>See the <b>attached</b>.</p></body></html>"));
    streams.set(
      "__properties_version1.0",
      properties([
        [0x0e06, 0x0040, filetime(SENT)],
        [0x3fde, 0x0003, 65001],
      ]),
    );
    expect(formatMsg(streams).text).toContain("\n\nSee the attached.");
  });

  it("names an attached message by its subject when it has no filename", () => {
    const streams = message();
    streams.delete("__attach_version1.0_#00000000/__substg1.0_3707001F");
    streams.set("__attach_version1.0_#00000000/__substg1.0_0037001F", utf16("Fwd: the original"));
    expect(formatMsg(streams).text).toContain("Attachments (1, not included): Fwd: the original");
  });

  it("answers empty for a container with nothing to say", () => {
    expect(formatMsg(new Map())).toEqual({ text: "" });
  });
});
