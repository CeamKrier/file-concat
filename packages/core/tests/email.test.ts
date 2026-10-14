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

  it("names a message whose header block runs past the sniffed prefix", async () => {
    // A bounce: `From:` behind 6 KB of Received lines, the block cut mid-line.
    const received = "Received: from relay.example.net by mx.example.org; Mon, 5 Oct 2026 10:00:00 +0000\r\n";
    const head = received.repeat(70) + "From: Mail Delivery <mailer@example.org>\r\n" + received.repeat(50);
    expect(head.length).toBeGreaterThan(8192);
    expect(await routeBytes(utf8(head + "\r\nbody"))).toEqual({
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

  it("marks a quoted reply in HTML-only mail, as a plain-text client would", () => {
    const { text } = formatEmail({
      attachments: [],
      html:
        '<div dir="ltr">Fine by me.</div><div class="gmail_quote"><div class="gmail_attr">On Mon, Ada wrote:</div>' +
        '<blockquote class="gmail_quote"><div>Shall we ship Friday?</div><blockquote><div>Is it ready?</div></blockquote></blockquote></div>',
    });
    // Flattened, the question reads as the sender's own words.
    expect(text).toContain("Fine by me.\n\nOn Mon, Ada wrote:");
    expect(text).toContain("> Shall we ship Friday?");
    expect(text).toContain(">> Is it ready?");
    expect(text).not.toMatch(/^> Fine by me/m);
  });

  it("quotes only what sits inside the blockquote when text runs around it", () => {
    const { text } = formatEmail({ attachments: [], html: "Yes<blockquote>Ready?</blockquote>Ship it" });
    expect(text).toBe("Yes\n> Ready?\nShip it");
  });

  it("marks Outlook's reply history, which follows its header block to the end", () => {
    const { text } = formatEmail({
      attachments: [],
      html:
        "<div>Approved.</div><hr><div id=\"divRplyFwdMsg\"><b>From:</b> Ada<br><b>Sent:</b> Monday</div>" +
        "<div>Please approve the budget.</div>",
    });
    expect(text).toMatch(/^Approved\.$/m);
    expect(text).toContain("> From: Ada");
    expect(text).toContain("> Please approve the budget.");
  });

  it("leaves a forwarded message unmarked, since it is the content", () => {
    const { text } = formatEmail({
      attachments: [],
      html: '<div class="gmail_quote">---------- Forwarded message ---------<br>From: Ada<br><div>The report is attached.</div></div>',
    });
    expect(text).not.toContain(">");
    expect(text).toContain("The report is attached.");
  });

  it("answers 'couldn't extract' for a message with nothing in it", async () => {
    expect(formatEmail({ attachments: [] })).toEqual({ text: "" });
  });
});
