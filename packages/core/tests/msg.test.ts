import { describe, expect, it } from "vitest";
import { formatMsg } from "../src/file-processing/parsers/msg";
import { decompressRtf } from "../src/file-processing/parsers/msg-rtf";

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

  it("names the author as From and the sender as Sender when sent on their behalf", () => {
    const { text } = formatMsg(
      message({ "__substg1.0_0042001F": utf16("Boss"), "__substg1.0_5D02001F": utf16("boss@example.com") }),
    );
    expect(text).toContain("From: Boss <boss@example.com>\nSender: Alice Example <alice@example.com>\nTo:");
    // Outlook fills the same properties for a message sent in one's own name.
    const own = formatMsg(message({ "__substg1.0_0042001F": utf16("Alice Example") })).text;
    expect(own).toContain("From: Alice Example <alice@example.com>\nTo:");
  });

  it("reads the 8-bit strings an older client writes, through the message's own code page", () => {
    const streams = message();
    streams.delete("__substg1.0_0037001F");
    streams.set("__substg1.0_0037001E", ansi("R\xe9sum\xe9"));
    expect(formatMsg(streams).text).toContain("Subject: R\u00e9sum\u00e9");
  });

  it("falls back to the internet code page when the message names none", () => {
    const streams = message({
      "__properties_version1.0": properties([[0x3fde, 0x0003, 950]]),
    });
    streams.delete("__substg1.0_0037001F");
    // "中文" (Chinese) in Big5.
    streams.set("__substg1.0_0037001E", Uint8Array.from([0xa4, 0xa4, 0xa4, 0xe5]));
    expect(formatMsg(streams).text).toContain("Subject: 中文");
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

  /** A message whose only body is the given PidTagRtfCompressed stream. */
  const rtfOnly = (stream: Uint8Array) => {
    const streams = message();
    streams.delete("__substg1.0_1000001F");
    streams.set("__substg1.0_10090102", stream);
    return formatMsg(streams).text;
  };
  /** RTF stored uncompressed (MELA, MS-OXRTFCP 2.2.3.1): a 16-byte header, then the RTF. */
  const mela = (rtf: string) => {
    const out = new Uint8Array(16 + rtf.length);
    new DataView(out.buffer).setUint32(8, 0x414c454d, true);
    out.set(ansi(rtf), 16);
    return out;
  };
  const hex = (bytes: string) => Uint8Array.from(bytes.split(" "), (byte) => parseInt(byte, 16));
  /** MS-OXRTFCP 3.1.1, the spec's own compressed example. */
  const SPEC_EXAMPLE = hex(
    "2d 00 00 00 2b 00 00 00 4c 5a 46 75 f1 c5 c7 a7 03 00 0a 00 72 63 70 67 31 32 35 42 32 0a f3 20 68 65 6c 09 00 20 62 77 05 b0 6c 64 7d 0a 80 0f a0",
  );

  it("decompresses the spec's examples, and refuses a corrupt or oversized stream", () => {
    const decode = (bytes: Uint8Array | undefined) => bytes && new TextDecoder().decode(bytes);
    expect(decode(decompressRtf(SPEC_EXAMPLE))).toBe("{\\rtf1\\ansi\\ansicpg1252\\pard hello world}\r\n");
    // MS-OXRTFCP 3.1.2: a run that reads from the bytes it is still writing.
    expect(decode(decompressRtf(hex("1a 00 00 00 1c 00 00 00 4c 5a 46 75 e2 d4 4b 51 41 00 04 20 57 58 59 5a 0d 6e 7d 01 0e b0")))).toBe(
      "{\\rtf1 WXYZWXYZWXYZWXYZWXYZ}",
    );
    const corrupt = SPEC_EXAMPLE.slice();
    corrupt[20] ^= 1;
    expect(decompressRtf(corrupt)).toBeUndefined();
    const forged = SPEC_EXAMPLE.slice();
    new DataView(forged.buffer).setUint32(0, 0x7fffffff, true);
    expect(decompressRtf(forged)?.length).toBe(43);
  });

  it("reads a body kept only as compressed RTF", () => {
    expect(rtfOnly(SPEC_EXAMPLE)).toContain("\n\nhello world");
  });

  it("reads native RTF paragraph by paragraph, without its font table", () => {
    const text = rtfOnly(
      mela("{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0 Calibri;}}{\\*\\generator Riched20;}\\f0 First para.\\par Caf\\'e9 second\\u8217?s.\\par}"),
    );
    expect(text).toContain("\n\nFirst para.\nCafé second\u2019s.\n\nAttachments");
    expect(text).not.toContain("Calibri");
    expect(text).not.toContain("Riched20");
  });

  it("reads each font's text in its own charset, and a Symbol bullet as a dot", () => {
    const text = rtfOnly(
      mela(
        "{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0 Arial;}{\\f1\\fcharset136 PMingLiU;}{\\f2\\fcharset2 Symbol;}}" +
          "{\\pntext\\f2\\'B7\\tab}\\f0 Big5: \\f1\\'a4\\'a4\\'a4\\'e5\\f0  done\\par}",
      ),
    );
    expect(text).toContain("\n\n\u00b7\tBig5: \u4e2d\u6587 done\n");
  });

  it("reads the HTML Outlook wrapped in RTF as the HTML body", () => {
    const text = rtfOnly(
      mela(
        "{\\rtf1\\ansi\\ansicpg1252\\fromhtml1 \\deff0{\\fonttbl{\\f0\\fswiss Arial;}}" +
          "{\\*\\htmltag19 <html>}{\\*\\htmltag50 <body>}\\htmlrtf {\\htmlrtf0 " +
          "{\\*\\htmltag64 <p>}\\htmlrtf {\\htmlrtf0 Caf\\'e9 &amp; \\u351?ok\\htmlrtf\\par}\\htmlrtf0 {\\*\\htmltag72 </p>}" +
          "\\htmlrtf }\\htmlrtf0 {\\*\\htmltag58 </body>}{\\*\\htmltag27 </html>}}",
      ),
    );
    expect(text).toContain("\n\nCafé & şok\n\nAttachments");
    expect(text).not.toContain("Arial");
  });

  it("reads an HTML body stored as a string", () => {
    const streams = message();
    streams.delete("__substg1.0_1000001F");
    streams.set(
      "__substg1.0_1013001F",
      utf16("<!--[if gte mso 9]><xml><w:View>Normal</w:View></xml><![endif]--><p>Stored <i>as text</i>&reg; &#x2192;.</p>"),
    );
    const { text } = formatMsg(streams);
    expect(text).toContain("\n\nStored as text\u00ae \u2192.");
    expect(text).not.toContain("Normal");
  });

  it("reads recipient storages for addresses and the Bcc a sent copy keeps", () => {
    // A recipient storage's property stream has an 8-byte header, not 32.
    const recipient = (index: number, type: number, name: string, smtp: string) => ({
      [`__recip_version1.0_#0000000${index}/__properties_version1.0`]: properties([[0x0c15, 0x0003, type]]).subarray(24),
      [`__recip_version1.0_#0000000${index}/__substg1.0_3001001F`]: utf16(name),
      [`__recip_version1.0_#0000000${index}/__substg1.0_39FE001F`]: utf16(smtp),
    });
    const { text } = formatMsg(
      message({
        ...recipient(0, 1, "Bob", "bob@example.net"),
        ...recipient(1, 2, "Dave", "dave@example.net"),
        ...recipient(2, 3, "Erin", "erin@example.net"),
      }),
    );
    expect(text).toContain("To: Bob <bob@example.net>\nCc: Dave <dave@example.net>\nBcc: Erin <erin@example.net>\nDate:");
  });

  it("says when and where a calendar item is, from its named properties", () => {
    // Name-id entries: PidLidLocation (0x8208) is property 0x8000, the start
    // (0x820D) 0x8001, both in the first GUID of the GUID stream (index 3).
    const entries = new Uint8Array(16);
    const view = new DataView(entries.buffer);
    view.setUint32(0, 0x8208, true);
    view.setUint32(4, (0 << 16) | (3 << 1), true);
    view.setUint32(8, 0x820d, true);
    view.setUint32(12, (1 << 16) | (3 << 1), true);
    const streams = message({
      "__substg1.0_001A001F": utf16("IPM.Appointment"),
      "__substg1.0_8000001F": utf16("Room 4"),
      "__nameid_version1.0/__substg1.0_00020102": hex("02 20 06 00 00 00 00 00 c0 00 00 00 00 00 00 46"),
      "__nameid_version1.0/__substg1.0_00030102": entries,
      "__properties_version1.0": properties([
        [0x0e06, 0x0040, filetime(SENT)],
        [0x8001, 0x0040, filetime("2026-10-20T09:00:00.000Z")],
      ]),
    });
    expect(formatMsg(streams).text).toContain("\n\nCalendar item: Appointment\nStarts: 2026-10-20 09:00 UTC\nLocation: Room 4\n\nAttachments");
    streams.set("__substg1.0_001A001F", utf16("IPM.Schedule.Meeting.Canceled"));
    expect(formatMsg(streams).text).toContain("\n\nCalendar item: Meeting cancellation\nStarts:");
    // A mail that happens to carry the same properties is not a meeting.
    streams.set("__substg1.0_001A001F", utf16("IPM.Note"));
    expect(formatMsg(streams).text).not.toContain("Starts:");
    expect(formatMsg(streams).text).not.toContain("Calendar item:");
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
