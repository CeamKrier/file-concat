// Probe generator for EML and Outlook MSG. Every file is hand-built.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const XLSX = createRequire(new URL("../../../../../apps/web/package.json", import.meta.url))("xlsx");

const S = path.resolve(import.meta.dirname, "..");
const OUT = path.join(S, "probes", "email");
fs.mkdirSync(OUT, { recursive: true });

const b64 = (s, enc = "utf8") => (Buffer.isBuffer(s) ? s : Buffer.from(s, enc)).toString("base64");
const wrap = (s) => s.replace(/.{1,76}/g, "$&\r\n");
const crlf = (s) => s.replace(/\r?\n/g, "\r\n");
const eml = (name, parts) => {
  const buf = Buffer.concat(parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(crlf(p), "utf8"))));
  fs.writeFileSync(path.join(OUT, name), buf);
};
const HDR = `Date: Tue, 13 Oct 2026 09:15:00 +0200\nMessage-ID: <probe@example.com>\nMIME-Version: 1.0\n`;
const FROM = `From: Ann Probe <ann@example.com>\nTo: Bob <bob@example.com>\n`;

// 1. Headers
eml("eml-headers.eml", [
  `Received: from QZRECEIVED.example.com by mx.example.com; Tue, 13 Oct 2026 09:15:01 +0200
From: =?UTF-8?B?${b64("QZFROMNAME Müller")}?= <from@example.com>
Sender: QZSENDERNAME <sender@example.com>
Reply-To: QZREPLYTONAME <reply@example.com>
To: =?ISO-8859-1?Q?QZTONAME_J=F6rg?= <to@example.com>
Cc: =?UTF-8?Q?QZCCNAME_=C3=89lise?= <cc@example.com>, QZGROUPNAME: g1@example.com, g2@example.com;
Bcc: =?ISO-8859-2?B?${b64(Buffer.concat([Buffer.from("QZBCCNAME "), Buffer.from([0xa3]), Buffer.from("ukasz")]))}?= <bcc@example.com>
Subject: =?UTF-8?B?${b64("QZSUBJ")}?=
 =?UTF-8?Q?ECTSPLIT_caf=C3=A9?=
Date: Tue, 13 Oct 2026 09:15:00 +0200
Comments: QZCOMMENTSHEADER about
 the draft
Keywords: QZKEYWORDONE, QZKEYWORDTWO
Message-ID: <QZMESSAGEID@example.com>
In-Reply-To: <QZINREPLYTO@example.com>
X-Mailer: QZXMAILER 1.0
Thread-Topic: QZTHREADTOPIC
MIME-Version: 1.0
Content-Type: text/plain

QZPLAINNOCHARSET body in us-ascii.
`,
]);

// 2. windows-1252 8bit body
eml("eml-win1252.eml", [
  `${FROM}Subject: cp1252\n${HDR}Content-Type: text/plain; charset=windows-1252\nContent-Transfer-Encoding: 8bit\n\n`,
  Buffer.concat([Buffer.from("QZWINDOWS "), Buffer.from([0x93]), Buffer.from("quoted"), Buffer.from([0x94]), Buffer.from(" costs 5"), Buffer.from([0x80]), Buffer.from(" na"), Buffer.from([0xef]), Buffer.from("ve\r\n")]),
]);

// 3. quoted-printable
eml("eml-qp.eml", [
  `${FROM}Subject: qp\n${HDR}Content-Type: text/plain; charset=utf-8\nContent-Transfer-Encoding: quoted-printable\n\nQZQUOTED=\nPRINTABLE caf=C3=A9 =E2=80=94 end\nline with trailing=20\n`,
]);

// 4. base64
eml("eml-base64.eml", [
  `${FROM}Subject: b64\n${HDR}Content-Type: text/plain; charset=utf-8\nContent-Transfer-Encoding: base64\n\n${wrap(b64("QZBASE64BODY übung line one.\r\nSecond line.\r\n"))}`,
]);

// 5. format=flowed; delsp=yes
eml("eml-flowed.eml", [
  `${FROM}Subject: flowed\n${HDR}Content-Type: text/plain; charset=utf-8; format=flowed; delsp=yes\nContent-Transfer-Encoding: 7bit\n\nThis paragraph QZFLOW \nED together and continues \nhere.\n\n> QZFLOWQUOTE quoted  \n> line two\n`,
]);

// 6. multipart/alternative
eml("eml-alternative.eml", [
  `${FROM}Subject: alt\n${HDR}Content-Type: multipart/alternative; boundary="ALT"

--ALT
Content-Type: text/plain; charset=utf-8

QZALTBODY in plain.
--ALT
Content-Type: text/html; charset=utf-8

<html><body><p>QZALTBODY in html.</p></body></html>
--ALT--
`,
]);

// 7. HTML-only, Gmail reply history (two levels)
eml("eml-html-gmail.eml", [
  `${FROM}Subject: Re: plan\n${HDR}Content-Type: text/html; charset=utf-8

<div dir="ltr">QZGMAILREPLY thanks.</div><br><div class="gmail_quote"><div dir="ltr" class="gmail_attr">On Mon, Oct 12, 2026 at 9:00 AM Ann &lt;ann@example.com&gt; wrote:<br></div><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex"><div dir="ltr">QZGMAILQUOTED question?</div><br><div class="gmail_quote"><div dir="ltr" class="gmail_attr">On Sun, Oct 11, 2026 Bob wrote:<br></div><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex"><div dir="ltr">QZGMAILNESTED original.</div></blockquote></div></blockquote></div>
`,
]);

// 8. HTML-only, Outlook reply history, with head style and title
eml("eml-html-outlook.eml", [
  `${FROM}Subject: RE: plan\n${HDR}Content-Type: text/html; charset=utf-8

<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>QZHTMLTITLE</title><style type="text/css" style="display:none;"> P {margin-top:0;margin-bottom:0;} .QZSTYLECSS {color:red} </style></head><body dir="ltr"><div class="elementToProof">QZOUTLOOKREPLY see below.</div><div id="appendonsend"></div><hr style="display:inline-block;width:98%" tabindex="-1"><div id="divRplyFwdMsg" dir="ltr"><font face="Calibri, sans-serif" style="font-size:11pt" color="#000000"><b>From:</b> Ann Probe &lt;ann@example.com&gt;<br><b>Sent:</b> Monday, October 12, 2026 9:00 AM<br><b>To:</b> Bob<br><b>Subject:</b> plan</font><div>&nbsp;</div></div><div class="elementToProof">QZOUTLOOKQUOTED earlier text.</div></body></html>
`,
]);

// 9. HTML-only, Gmail forward (no blockquote)
eml("eml-html-gmail-fwd.eml", [
  `${FROM}Subject: Fwd: plan\n${HDR}Content-Type: text/html; charset=utf-8

<div dir="ltr">QZGMAILFWDNOTE fyi<br><br><div class="gmail_quote"><div dir="ltr" class="gmail_attr">---------- Forwarded message ---------<br>From: <strong class="gmail_sendername" dir="auto">Ann</strong> <span dir="auto">&lt;ann@example.com&gt;</span><br>Date: Mon, Oct 12, 2026 at 9:00 AM<br>Subject: plan<br>To: Bob &lt;bob@example.com&gt;<br></div><br><br><div dir="ltr">QZGMAILFWDBODY original words.</div></div></div>
`,
]);

// 10. HTML-only, Outlook forward (same divRplyFwdMsg block)
eml("eml-html-outlook-fwd.eml", [
  `${FROM}Subject: FW: plan\n${HDR}Content-Type: text/html; charset=utf-8

<html><body dir="ltr"><div>QZOUTLOOKFWDNOTE fyi.</div><hr style="display:inline-block;width:98%"><div id="divRplyFwdMsg" dir="ltr"><font face="Calibri, sans-serif"><b>From:</b> Ann<br><b>Sent:</b> Monday<br><b>Subject:</b> plan</font><div>&nbsp;</div></div><div>QZOUTLOOKFWDBODY original words.</div></body></html>
`,
]);

// 11. HTML-only, assorted markup
eml("eml-html-misc.eml", [
  `${FROM}Subject: html misc\n${HDR}Content-Type: text/html; charset=utf-8

<html><body><span style="display:none;max-height:0;overflow:hidden">QZHIDDENPREHEADER</span><p>QZENTNAMED&rsquo;s and QZENTHEX&#x2019;s and QZENTDEC&#8217;s</p><table><tr><td>QZCELLA</td><td>QZCELLB</td></tr></table><p><a href="https://example.com/QZLINKHREF">QZLINKTEXT</a></p><p><img src="https://example.com/x.png" alt="QZIMGALT"></p><ul><li>QZLISTONE</li><li>QZLISTTWO</li></ul><!-- QZHTMLCOMMENT --></body></html>
`,
]);

// 12. multipart/related with inline cid image
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
eml("eml-related.eml", [
  `${FROM}Subject: related\n${HDR}Content-Type: multipart/related; boundary="REL"; type="text/html"

--REL
Content-Type: text/html; charset=utf-8

<html><body><p>QZRELATEDHTML</p><img src="cid:logo@example.com" alt="QZCIDALT"></body></html>
--REL
Content-Type: image/png; name="QZINLINELOGO.png"
Content-Disposition: inline; filename="QZINLINELOGO.png"
Content-ID: <logo@example.com>
Content-Transfer-Encoding: base64

${wrap(b64(png))}--REL--
`,
]);

// 13. multipart/mixed with inline text part and assorted attachments
eml("eml-mixed.eml", [
  `${FROM}Subject: mixed\n${HDR}Content-Type: multipart/mixed; boundary="MIX"

--MIX
Content-Type: text/plain; charset=utf-8

QZMIXEDBODY first part.
--MIX
Content-Type: text/plain; charset=utf-8
Content-Disposition: inline

QZINLINETEXTPART second inline part.
--MIX
Content-Type: text/plain; charset=utf-8; name="QZATTACHNAME.txt"
Content-Disposition: attachment; filename="QZATTACHNAME.txt"
Content-Description: QZCONTENTDESC notes file

QZATTACHCONTENT inside the attachment.
--MIX
Content-Type: application/pdf
Content-Disposition: attachment; filename*=UTF-8''QZPARAMENC%C3%A9.pdf
Content-Transfer-Encoding: base64

${wrap(b64("%PDF-1.4 stub"))}--MIX
Content-Type: application/octet-stream
Content-Disposition: attachment;
 filename*0*=UTF-8''QZCONT;
 filename*1*=INUED%C3%A9.bin
Content-Transfer-Encoding: base64

${wrap(b64("bin"))}--MIX
Content-Type: application/zip; name="=?UTF-8?B?${b64("QZEWPARAMé.zip")}?="
Content-Disposition: attachment
Content-Transfer-Encoding: base64

${wrap(b64("PK"))}--MIX
Content-Type: application/octet-stream
Content-Disposition: attachment
Content-Transfer-Encoding: base64

${wrap(b64("noname"))}--MIX--
`,
]);

// 14. forwarded message inline (message/rfc822, no disposition)
const inner = (from, subj, body) => `From: ${from} <ff@example.com>\nTo: Ann <ann@example.com>\nSubject: ${subj}\nDate: Mon, 12 Oct 2026 08:00:00 +0000\nMIME-Version: 1.0\nContent-Type: text/plain; charset=utf-8\n\n${body}\n`;
eml("eml-forward-inline.eml", [
  `${FROM}Subject: Fwd: inline\n${HDR}Content-Type: multipart/mixed; boundary="FWD"

--FWD
Content-Type: text/plain; charset=utf-8

QZFWDINTRO see below.
--FWD
Content-Type: message/rfc822

${inner("QZFWDFROM", "QZFWDSUBJECT", "QZFWDBODY inner words.")}--FWD--
`,
]);

// 15. forwarded as attachment (message/rfc822, disposition attachment)
eml("eml-forward-attached.eml", [
  `${FROM}Subject: Fwd: attached\n${HDR}Content-Type: multipart/mixed; boundary="FWA"

--FWA
Content-Type: text/plain; charset=utf-8

QZFWAINTRO attached.
--FWA
Content-Type: message/rfc822; name="QZFWDATTACHED.eml"
Content-Disposition: attachment; filename="QZFWDATTACHED.eml"

${inner("QZATTFROM", "QZATTSUBJECT", "QZATTBODY inner words.")}--FWA--
`,
]);

// 16. delivery status notification
eml("eml-dsn.eml", [
  `From: Mail Delivery Subsystem <mailer-daemon@example.com>\nTo: ann@example.com\nSubject: Delivery Status Notification (Failure)\n${HDR}Content-Type: multipart/report; report-type=delivery-status; boundary="DSN"

--DSN
Content-Type: text/plain; charset=utf-8

QZDSNHUMAN Delivery to the following recipient failed permanently.
--DSN
Content-Type: message/delivery-status

Reporting-MTA: dns; mx.example.com

Final-Recipient: rfc822; qzfinal@example.com
Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 550 5.1.1 QZDIAGCODE user unknown

--DSN
Content-Type: text/rfc822-headers

From: ann@example.com
To: qzfinal@example.com
Subject: QZDSNORIGSUBJECT

--DSN--
`,
]);

// 17. S/MIME clear-signed
eml("eml-smime.eml", [
  `${FROM}Subject: smime\n${HDR}Content-Type: multipart/signed; protocol="application/pkcs7-signature"; micalg=sha-256; boundary="SIG"

This is a cryptographically signed message in MIME format.

--SIG
Content-Type: text/plain; charset=utf-8

QZSMIMESIGNED signed words.
--SIG
Content-Type: application/pkcs7-signature; name="smime.p7s"
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="smime.p7s"
Content-Description: S/MIME Cryptographic Signature

${wrap(b64("not a real pkcs7 blob"))}
--SIG--
`,
]);

// 18. PGP/MIME signed
eml("eml-pgp.eml", [
  `${FROM}Subject: pgp\n${HDR}Content-Type: multipart/signed; micalg=pgp-sha256; protocol="application/pgp-signature"; boundary="PGP"

This is an OpenPGP/MIME signed message (RFC 4880 and 3156)
--PGP
Content-Type: text/plain; charset=utf-8

QZPGPSIGNED signed words.
--PGP
Content-Type: application/pgp-signature; name="signature.asc"
Content-Description: OpenPGP digital signature
Content-Disposition: attachment; filename="signature.asc"

-----BEGIN PGP SIGNATURE-----

iQZPGPSIGBLOCKabc
-----END PGP SIGNATURE-----

--PGP--
`,
]);

// 19. calendar invite, Outlook shape: alternative(plain, calendar)
eml("eml-calendar.eml", [
  `From: Org <org@example.com>\nTo: Bob <bob@example.com>\nSubject: Invitation\n${HDR}Content-Type: multipart/alternative; boundary="CAL"

--CAL
Content-Type: text/plain; charset=utf-8

QZCALPLAIN agenda text.
--CAL
Content-Type: text/calendar; charset=utf-8; method=REQUEST
Content-Transfer-Encoding: 7bit

BEGIN:VCALENDAR
METHOD:REQUEST
PRODID:-//Probe//EN
VERSION:2.0
BEGIN:VEVENT
UID:probe-1@example.com
DTSTAMP:20261013T090000Z
DTSTART:20261020T090000Z
DTEND:20261020T100000Z
SUMMARY:QZCALSUMMARY review
LOCATION:QZCALLOCATION room 4
DESCRIPTION:QZCALDESC line one\\nline two\\, with comma
ORGANIZER;CN=QZCALORGANIZER:mailto:org@example.com
ATTENDEE;CN=QZCALATTENDEE;ROLE=REQ-PARTICIPANT:mailto:bob@example.com
END:VEVENT
END:VCALENDAR
--CAL--
`,
]);

// 20. calendar-only body
eml("eml-calendar-only.eml", [
  `From: Org <org@example.com>\nTo: Bob <bob@example.com>\nSubject: Invitation only\n${HDR}Content-Type: text/calendar; charset=utf-8; method=REQUEST

BEGIN:VCALENDAR
METHOD:REQUEST
VERSION:2.0
BEGIN:VEVENT
UID:probe-2@example.com
DTSTART:20261021T090000Z
SUMMARY:QZCALONLYSUMMARY
LOCATION:QZCALONLYLOCATION
END:VEVENT
END:VCALENDAR
`,
]);

// 21. text/enriched
eml("eml-enriched.eml", [
  `${FROM}Subject: enriched\n${HDR}Content-Type: text/enriched; charset=us-ascii

<bold>QZENRICHBOLD</bold> plain text

<excerpt>QZENRICHEXCERPT quoted</excerpt>
<<QZENRICHLT>
`,
]);

// 22. RFC 6532 raw UTF-8 headers
eml("eml-utf8hdr.eml", [
  `From: "QZUTFFROM Jürgen" <j@example.com>\nTo: Bob <bob@example.com>\nSubject: QZUTFSUBJECT Größe 日本語\n${HDR}Content-Type: text/plain; charset=utf-8\n\nQZUTFBODY ok.\n`,
]);

// 23. multipart/digest
eml("eml-digest.eml", [
  `From: list@example.com\nTo: Bob <bob@example.com>\nSubject: Digest\n${HDR}Content-Type: multipart/digest; boundary="DIG"

--DIG

From: a@example.com
Subject: QZDIGESTSUBJONE

QZDIGESTONE body.
--DIG

From: b@example.com
Subject: QZDIGESTSUBJTWO

QZDIGESTTWO body.
--DIG--
`,
]);

// ---------------- MSG (MS-OXMSG) ----------------
const u16 = (s) => Buffer.from(s + "\0", "utf16le");
const T = { LONG: 0x0003, BOOL: 0x000b, SYSTIME: 0x0040, STR8: 0x001e, UNICODE: 0x001f, BINARY: 0x0102, OBJECT: 0x000d };

// A storage's property set: variable ones become streams plus a 16-byte record;
// fixed ones are records only. headerBytes: 32 top, 24 embedded, 8 recip/attach.
function storage(cfb, prefix, props, header) {
  const recs = [];
  for (const p of props) {
    const tag = (p.id << 16) | p.type;
    const rec = Buffer.alloc(16);
    rec.writeUInt32LE(tag >>> 0, 0);
    rec.writeUInt32LE(0x6, 4); // readable | writable
    if (p.type === T.LONG || p.type === T.BOOL) rec.writeUInt32LE(p.value, 8);
    else if (p.type === T.SYSTIME) rec.writeBigUInt64LE(BigInt(p.value.getTime() + 11644473600000) * 10000n, 8);
    else if (p.type === T.OBJECT) rec.writeUInt32LE(0xffffffff, 8);
    else {
      const data = p.type === T.UNICODE ? u16(p.value) : p.type === T.STR8 ? Buffer.concat([Buffer.isBuffer(p.value) ? p.value : Buffer.from(p.value, "latin1"), Buffer.from([0])]) : p.value;
      rec.writeUInt32LE(data.length, 8);
      const hex = (((p.id << 16) | p.type) >>> 0).toString(16).toUpperCase().padStart(8, "0");
      XLSX.CFB.utils.cfb_add(cfb, `${prefix}__substg1.0_${hex}`, data);
    }
    recs.push(rec);
  }
  XLSX.CFB.utils.cfb_add(cfb, `${prefix}__properties_version1.0`, Buffer.concat([header, ...recs]));
}
function topHeader(recips, attachs) {
  const h = Buffer.alloc(32);
  h.writeUInt32LE(recips, 8); h.writeUInt32LE(attachs, 12); h.writeUInt32LE(recips, 16); h.writeUInt32LE(attachs, 20);
  return h;
}
function emptyNameid(cfb, prefix = "/") {
  for (const s of ["00020102", "00030102", "00040102"]) XLSX.CFB.utils.cfb_add(cfb, `${prefix}__nameid_version1.0/__substg1.0_${s}`, Buffer.alloc(0));
}
function recip(cfb, idx, name, smtp, type) {
  const p = `/__recip_version1.0_#${idx.toString(16).toUpperCase().padStart(8, "0")}/`;
  storage(cfb, p, [
    { id: 0x3000, type: T.LONG, value: idx }, // PidTagRowid
    { id: 0x0c15, type: T.LONG, value: type }, // PidTagRecipientType 1 To 2 Cc 3 Bcc
    { id: 0x3001, type: T.UNICODE, value: name },
    { id: 0x3002, type: T.UNICODE, value: "SMTP" },
    { id: 0x3003, type: T.UNICODE, value: smtp },
    { id: 0x39fe, type: T.UNICODE, value: smtp },
  ], Buffer.alloc(8));
}
function newCfb() {
  const cfb = XLSX.CFB.utils.cfb_new();
  return cfb;
}
function save(cfb, name) {
  XLSX.CFB.utils.cfb_del(cfb, "/\u0001Sh33tJ5");
  XLSX.CFB.utils.cfb_gc(cfb);
  const out = XLSX.CFB.write(cfb, { type: "buffer", fileType: "cfb" });
  fs.writeFileSync(path.join(OUT, name), out);
}
const when = new Date("2026-10-13T07:15:00Z");
const noteProps = (extra) => [
  { id: 0x001a, type: T.UNICODE, value: "IPM.Note" },
  { id: 0x0e06, type: T.SYSTIME, value: when },
  { id: 0x0039, type: T.SYSTIME, value: when },
  { id: 0x3ffd, type: T.LONG, value: 1252 },
  { id: 0x3fde, type: T.LONG, value: 65001 },
  ...extra,
];

// msg-note: the common shape with recipients, attachments, embedded message
{
  const cfb = newCfb();
  emptyNameid(cfb);
  storage(cfb, "/", noteProps([
    { id: 0x0037, type: T.UNICODE, value: "QZMSGSUBJECT plan" },
    { id: 0x0070, type: T.UNICODE, value: "QZMSGTOPIC" },
    { id: 0x1000, type: T.UNICODE, value: "QZMSGBODY first line.\r\nSecond line.\r\n" },
    { id: 0x0c1a, type: T.UNICODE, value: "QZMSGSENDER" },
    { id: 0x0c1f, type: T.UNICODE, value: "QZMSGSENDERADDR@example.com" },
    { id: 0x0c1e, type: T.UNICODE, value: "SMTP" },
    { id: 0x0042, type: T.UNICODE, value: "QZMSGREPRESENTING" },
    { id: 0x0e04, type: T.UNICODE, value: "QZMSGTOONE; QZMSGTOTWO" },
    { id: 0x0e03, type: T.UNICODE, value: "QZMSGCC" },
    { id: 0x0e02, type: T.UNICODE, value: "QZMSGBCC" },
    { id: 0x007d, type: T.UNICODE, value: "Received: from mx.example.com\r\nX-Mailer: QZMSGTRANSPORT\r\n" },
    { id: 0x1035, type: T.UNICODE, value: "<QZMSGMSGID@example.com>" },
  ]), topHeader(4, 2));
  recip(cfb, 0, "QZMSGTOONE", "QZRECIPADDRONE@example.com", 1);
  recip(cfb, 1, "QZMSGTOTWO", "qztotwo@example.com", 1);
  recip(cfb, 2, "QZMSGCC", "qzcc@example.com", 2);
  recip(cfb, 3, "QZMSGBCC", "qzbcc@example.com", 3);
  storage(cfb, "/__attach_version1.0_#00000000/", [
    { id: 0x0e21, type: T.LONG, value: 0 },
    { id: 0x3705, type: T.LONG, value: 1 },
    { id: 0x3707, type: T.UNICODE, value: "QZMSGATTACH.txt" },
    { id: 0x3704, type: T.UNICODE, value: "QZMSGA~1.TXT" },
    { id: 0x3001, type: T.UNICODE, value: "QZMSGATTACH.txt" },
    { id: 0x370e, type: T.UNICODE, value: "text/plain" },
    { id: 0x3701, type: T.BINARY, value: Buffer.from("QZMSGATTACHDATA file contents") },
  ], Buffer.alloc(8));
  storage(cfb, "/__attach_version1.0_#00000001/", [
    { id: 0x0e21, type: T.LONG, value: 1 },
    { id: 0x3705, type: T.LONG, value: 5 },
    { id: 0x3001, type: T.UNICODE, value: "QZEMBEDDISPLAY" },
    { id: 0x3701, type: T.OBJECT, value: null },
  ], Buffer.alloc(8));
  const emb = "/__attach_version1.0_#00000001/__substg1.0_3701000D/";
  const eh = Buffer.alloc(24);
  storage(cfb, emb, [
    { id: 0x001a, type: T.UNICODE, value: "IPM.Note" },
    { id: 0x0037, type: T.UNICODE, value: "QZEMBEDSUBJECT" },
    { id: 0x1000, type: T.UNICODE, value: "QZEMBEDBODY inner words." },
    { id: 0x0c1a, type: T.UNICODE, value: "QZEMBEDSENDER" },
    { id: 0x0e06, type: T.SYSTIME, value: when },
  ], eh);
  save(cfb, "msg-note.msg");
}

// msg-ansi: 8-bit strings in code page 1251
{
  const cfb = newCfb();
  emptyNameid(cfb);
  const cyr = new Uint8Array([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]); // "Привет" in cp1251
  storage(cfb, "/", [
    { id: 0x001a, type: T.STR8, value: "IPM.Note" },
    { id: 0x0e06, type: T.SYSTIME, value: when },
    { id: 0x3ffd, type: T.LONG, value: 1251 },
    { id: 0x0037, type: T.STR8, value: Buffer.concat([Buffer.from("QZANSISUBJECT "), Buffer.from(cyr)]) },
    { id: 0x1000, type: T.STR8, value: Buffer.concat([Buffer.from("QZANSIBODY "), Buffer.from(cyr)]) },
    { id: 0x0c1a, type: T.STR8, value: "QZANSISENDER" },
  ], topHeader(0, 0));
  save(cfb, "msg-ansi.msg");
}

// msg-rtfonly: the only body is PidTagRtfCompressed, uncompressed MELA form
{
  const cfb = newCfb();
  emptyNameid(cfb);
  const rtf = Buffer.from("{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0 Calibri;}}\\f0 QZRTFONLYBODY first para.\\par QZRTFSECOND second para.\\par}");
  const head = Buffer.alloc(16);
  head.writeUInt32LE(rtf.length + 12, 0);
  head.writeUInt32LE(rtf.length, 4);
  head.writeUInt32LE(0x414c454d, 8);
  head.writeUInt32LE(0, 12);
  storage(cfb, "/", noteProps([
    { id: 0x0037, type: T.UNICODE, value: "QZRTFSUBJECT" },
    { id: 0x0c1a, type: T.UNICODE, value: "Ann" },
    { id: 0x0e1f, type: T.BOOL, value: 1 },
    { id: 0x1009, type: T.BINARY, value: Buffer.concat([head, rtf]) },
  ]), topHeader(0, 0));
  save(cfb, "msg-rtfonly.msg");
}

// msg-htmlbin: HTML-only, PidTagHtml as binary (0x10130102) with a quote
{
  const cfb = newCfb();
  emptyNameid(cfb);
  storage(cfb, "/", noteProps([
    { id: 0x0037, type: T.UNICODE, value: "QZHTMLBINSUBJECT" },
    { id: 0x1013, type: T.BINARY, value: Buffer.from("<html><body><p>QZHTMLBINBODY café</p><blockquote>QZMSGQUOTED earlier.</blockquote></body></html>", "utf8") },
  ]), topHeader(0, 0));
  save(cfb, "msg-htmlbin.msg");
}

// msg-htmlstr: HTML-only, PidTagBodyHtml as PtypString (0x1013001F)
{
  const cfb = newCfb();
  emptyNameid(cfb);
  storage(cfb, "/", noteProps([
    { id: 0x0037, type: T.UNICODE, value: "QZHTMLSTRSUBJECT" },
    { id: 0x1013, type: T.UNICODE, value: "<html><body><p>QZHTMLSTRBODY</p></body></html>" },
  ]), topHeader(0, 0));
  save(cfb, "msg-htmlstr.msg");
}

// msg-appointment: IPM.Appointment with PidLidLocation via __nameid_version1.0
{
  const cfb = newCfb();
  // GUID stream: PSETID_Appointment {00062002-0000-0000-C000-000000000046}
  const guid = Buffer.from([0x02, 0x20, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0xc0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46]);
  // Entry: LID, then (PropertyIndex << 16) | (GuidIndex << 1) | Kind; GuidIndex 3 = first GUID in stream.
  const entry = Buffer.alloc(16);
  entry.writeUInt32LE(0x8208, 0); entry.writeUInt32LE((0 << 16) | (3 << 1) | 0, 4); // PidLidLocation -> 0x8000
  entry.writeUInt32LE(0x820d, 8); entry.writeUInt32LE((1 << 16) | (3 << 1) | 0, 12); // PidLidAppointmentStartWhole -> 0x8001
  XLSX.CFB.utils.cfb_add(cfb, "/__nameid_version1.0/__substg1.0_00020102", guid);
  XLSX.CFB.utils.cfb_add(cfb, "/__nameid_version1.0/__substg1.0_00030102", entry);
  XLSX.CFB.utils.cfb_add(cfb, "/__nameid_version1.0/__substg1.0_00040102", Buffer.alloc(0));
  storage(cfb, "/", [
    { id: 0x001a, type: T.UNICODE, value: "IPM.Appointment" },
    { id: 0x0e06, type: T.SYSTIME, value: when },
    { id: 0x0037, type: T.UNICODE, value: "QZAPPTSUBJECT" },
    { id: 0x1000, type: T.UNICODE, value: "QZAPPTBODY agenda." },
    { id: 0x0c1a, type: T.UNICODE, value: "QZAPPTORGANIZER" },
    { id: 0x8000, type: T.UNICODE, value: "QZAPPTLOCATION room 4" },
    { id: 0x8001, type: T.SYSTIME, value: new Date("2026-10-20T09:00:00Z") },
  ], topHeader(0, 0));
  save(cfb, "msg-appointment.msg");
}

console.log(fs.readdirSync(OUT).join("\n"));
