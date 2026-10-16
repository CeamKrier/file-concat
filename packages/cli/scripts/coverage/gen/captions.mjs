// Hand-built WebVTT and SubRip probes, one marker per construct.
import fs from "node:fs";
import path from "node:path";
const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "probes");

const vtt = `WEBVTT - QZVTTHEADER
Kind: captions

REGION
id:QZREGIONID
width:40%
regionanchor:0%,100%

STYLE
::cue(.QZSTYLECLASS) { color: peachpuff; }

NOTE QZNOTECOMMENT
spans two lines

QZCUEIDENT
00:00:01.000 --> 00:00:02.000 align:start position:10% region:QZREGIONID
Plain cue QZPLAINCUE

00:00:02.000 --> 00:00:03.000
<v Roger Bingham>QZVOICETEXT spoken</v>

00:00:03.000 --> 00:00:04.000
<v.loud QZSPEAKERTWO>QZVOICECLASSTEXT unclosed

00:00:04.000 --> 00:00:05.000
<c.QZCLASSNAME>QZCLASSSPAN</c> <b>QZBOLDSPAN</b> <i>QZITALICSPAN</i> <u>QZUNDERSPAN</u>

00:00:05.000 --> 00:00:06.000
<lang en-GB>QZLANGSPAN</lang>

00:00:06.000 --> 00:00:07.000
<ruby>QZRUBYBASE<rt>QZRUBYTEXT</rt></ruby> end

00:00:07.000 --> 00:00:08.000
QZKARAOKEONE <00:00:07.500>QZKARAOKETWO

00:00:08.000 --> 00:00:09.000
Tom &amp; Jerry &lt;QZENTITY&gt;&nbsp;x

00:00:09.000 --> 00:00:10.000
QZMULTIONE
QZMULTITWO

00:00:10.000 --> 00:00:11.000
QZROLLONE
QZROLLTWO

00:00:11.000 --> 00:00:12.000
QZROLLTWO
QZROLLTHREE

00:00:12.000 --> 00:00:13.000
QZROLLTHREE
QZROLLFOUR

00:00:13.000 --> 00:00:14.000
QZREPEATSAID

00:00:14.000 --> 00:00:15.000
QZREPEATSAID

00:00:15.000 --> 00:00:16.000
42
`;
fs.writeFileSync(path.join(root, "vtt", "probe.vtt"), vtt);

const chapters = `WEBVTT

1
00:00:00.000 --> 00:01:00.000
QZCHAPTERONE

2
00:01:00.000 --> 00:02:00.000
QZCHAPTERTWO
`;
fs.writeFileSync(path.join(root, "vtt", "chapters.vtt"), chapters);

const srtLines = [
  "1",
  "00:00:01,000 --> 00:00:02,000",
  "QZSRTPLAIN",
  "",
  "2",
  "00:00:02,000 --> 00:00:03,000 X1:100 X2:200 Y1:10 Y2:20",
  "QZSRTMULTIONE",
  "QZSRTMULTITWO",
  "",
  "3",
  "00:00:03,000 --> 00:00:04,000",
  '<i>QZSRTITALIC</i> <font color="#ffff00">QZSRTFONT</font> <b>QZSRTBOLD</b>',
  "",
  "4",
  "00:00:04,000 --> 00:00:05,000",
  "{\\an8}QZSRTAN8",
  "",
  "5",
  "00:00:05,000 --> 00:00:06,000",
  "QZSRTROLLA",
  "QZSRTROLLB",
  "",
  "6",
  "00:00:06,000 --> 00:00:07,000",
  "QZSRTROLLB",
  "QZSRTROLLC",
  "",
  "7",
  "00:00:07,000 --> 00:00:08,000",
  "- QZSRTDASHONE",
  "- QZSRTDASHTWO",
  "",
  "8",
  "00:00:08,000 --> 00:00:09,000",
  "1984",
  "",
  "9",
  "00:00:09,000 --> 00:00:10,000",
  "Café QZSRTUTF8",
  "",
];
fs.writeFileSync(path.join(root, "srt", "probe.srt"), "﻿" + srtLines.join("\r\n"));
console.log("wrote vtt, chapters.vtt, srt");
