# Coverage probes

One file per format, with a unique `QZ...` marker in every construct the format can hold
(a footnote, a hidden sheet, a speaker note, a form field). A probe goes through the
web chain and the output shows, marker by marker, what came through, what was lost and
what came through wrong. The scored map built from these outputs is kept outside the
repository; these are its inputs.

```bash
bash packages/cli/scripts/coverage/run.sh <repo root> <outdir>
```

writes `<outdir>/<dir>/<probe>.out.txt` for every probe. `<repo root>` can be a worktree
at any commit, so two commits can be compared on the same probes. About 2.5 minutes.

## What is here

- `probes/` - the files the map was scored on. They are committed, not rebuilt, so a
  probe stays available even if a source below disappears.
- `gen/` - how our own probes were written. Run one only to change a probe, then rerun
  the map: a rebuilt file differs in bytes (random GUIDs, zip times, encryption salt)
  but not in content.
  - `docx.mjs`, `xlsx.mjs`, `pptx.mjs`, `odf.mjs`, `pdf.mjs` take the output directory
    (`node gen/docx.mjs probes/docx`); a second directory also writes the XML parts out
    for a well-formedness check. The others write into `probes/` themselves.
  - `pptx-order-variant.mjs <src> <dst>` writes `pptx-order/` from the pptx probe.
  - `pdf.mjs` needs `fontkit` installed the way `packages/core/tests/fixtures/real/generate.mjs`
    describes, and the system's DejaVuSans. It also writes `plain-for-encryption.pdf.src`,
    which `python3 gen/pdf-encrypt.py <that file> probes/pdf` (pypdf) encrypts with RC4.
  - `run-html.mts.in` is the HTML runner `run.sh` fills in with the tree it runs.
- No generator here: `ppt/gen-ppt-coverage.ppt` and `xls/gen-xls-coverage.xls` were
  written with Apache POI's HSLF and HSSF writers; `rtf/*.rtf` were written by hand.
- `ORACLE-poi.txt` in `doc/`, `ppt/` and `xls/` is Apache POI's own text dump of each
  file there, the reference the 97-2003 outputs were judged against.

Not probed: MOBI/AZW3, PDF AES encryption, Type 3 fonts, Identity-V.

## Sources

70 files in `doc/`, `ppt/` and `xls/` are unchanged copies of test files from
[Apache POI](https://github.com/apache/poi/tree/trunk/test-data) (56) and
[Apache Tika](https://github.com/apache/tika) (14), both under the Apache License 2.0.
`SOURCES.tsv` lists each one with its upstream URL and SHA-256. Every other probe was
written for this map.
