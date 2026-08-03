import { describe, expect, it } from "vitest";
import { strToU8 } from "fflate";
import PostalMime from "postal-mime";
import { routeBytes } from "../src/file-processing/routing";
import { formatEmail } from "../src/file-processing/parsers/email";

const utf8 = (s: string) => strToU8(s);

const MESSAGE = [
  "Return-Path: <alice@example.com>",
  "Received: from mail.example.com by mx.example.net; Tue, 4 Aug 2026 09:58:12 +0000",
  "MIME-Version: 1.0",
  "Message-ID: <abc123@example.com>",
  "Date: Tue, 4 Aug 2026 09:58:00 +0000",
  "From: Alice Example <alice@example.com>",
  "To: Bob <bob@example.net>, carol@example.net",
  "Subject: Quarterly numbers",
  'Content-Type: multipart/mixed; boundary="BOUND"',
  "",
  "--BOUND",
  "Content-Type: text/plain; charset=utf-8",
  "Content-Transfer-Encoding: quoted-printable",
  "",
  "Numbers are attached. Revenue is up 12=25 on the quarter.",
  "",
  "--BOUND",
  'Content-Type: application/pdf; name="q3.pdf"',
  "Content-Disposition: attachment; filename=\"q3.pdf\"",
  "Content-Transfer-Encoding: base64",
  "",
  "JVBERi0xLjcK",
  "",
  "--BOUND--",
  "",
].join("\r\n");

describe("routing messages", () => {
  it("routes a saved message to the email parser", async () => {
    expect(await routeBytes(utf8(MESSAGE))).toEqual({
      kind: "extract",
      parserId: "email",
      format: "eml",
    });
  });

  it("leaves a config that happens to use `key: value` alone", async () => {
    // The reason the envelope headers are required: plenty of files open with
    // colon-separated pairs, and `From:` alone is not evidence of a message.
    const yaml = ["name: deploy", "from: main", "to: production", "", "steps: []"].join("\n");
    expect(await routeBytes(utf8(yaml))).toEqual({ kind: "unknown" });
  });

  it("leaves prose that opens with something other than a header alone", async () => {
    const notes = "Meeting notes\nFrom: the standup\nMessage-ID: none\n";
    expect(await routeBytes(utf8(notes))).toEqual({ kind: "unknown" });
  });
});

describe("formatEmail", () => {
  it("keeps the four headers that matter and the decoded body", async () => {
    const { text } = formatEmail(await PostalMime.parse(MESSAGE));
    expect(text).toContain("From: Alice Example <alice@example.com>");
    expect(text).toContain("To: Bob <bob@example.net>, carol@example.net");
    expect(text).toContain("Subject: Quarterly numbers");
    expect(text).toContain("Revenue is up 12% on the quarter.");
    // Routing exhaust stays out.
    expect(text).not.toContain("Received:");
    expect(text).not.toContain("--BOUND");
  });

  it("names attachments in the text and counts them in the notes", async () => {
    // ADR-0008: a message whose whole content is "see attached" is unreadable
    // if the attachment vanishes without a word.
    const { text, notes } = formatEmail(await PostalMime.parse(MESSAGE));
    expect(text).toContain("Attachments (1, not included): q3.pdf");
    expect(notes).toEqual([{ kind: "attachments-skipped", count: 1 }]);
    expect(text).not.toContain("JVBERi0xLjcK");
  });

  it("flattens an HTML-only message rather than dropping it", async () => {
    const html = [
      "From: newsletter@example.com",
      "MIME-Version: 1.0",
      "Subject: Weekly",
      "Content-Type: text/html; charset=utf-8",
      "",
      "<html><head><style>p{color:red}</style></head><body>",
      "<p>Three things happened.</p><p>Tea &amp; biscuits.</p>",
      "</body></html>",
      "",
    ].join("\r\n");
    const { text } = formatEmail(await PostalMime.parse(html));
    // A closing tag and the next opening tag each become a break, so paragraphs
    // stay separated instead of running together.
    expect(text).toContain("Three things happened.\n\nTea & biscuits.");
    expect(text).not.toContain("color:red");
    expect(text).not.toContain("<p>");
  });

  it("answers 'couldn't extract' for a message with nothing in it", async () => {
    expect(formatEmail({ headers: [], headerLines: [], attachments: [] })).toEqual({ text: "" });
  });
});
