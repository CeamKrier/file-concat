# Coverage probes

One file per format, with a unique `QZ...` marker in every construct the format can hold
(a footnote, a hidden sheet, a speaker note, a form field). A probe goes through the
web chain and the output shows, marker by marker, what came through, what was lost and
what came through wrong. The scored map built from these outputs is kept outside the
repository; these are its inputs, and `compare/rows.json` holds its auto-scorable rows.

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

## Against Tika and markitdown

`compare/` scores other extractors on the same probes. The 2026-10-17 comparison ran
Tika 3.3.2 and markitdown 0.1.5; /benchmarks reran them on 2026-10-31 at Apache Tika app
4.2.0 (`--text`, one JVM per file, `tika-app-4.2.0.jar` from the release's
`tika-app-4.2.0.zip`) and markitdown 0.1.9, whose `[all]` extra needs `uvx --prerelease
allow`. file 5.45, git 2.43.0, rg 15.2.0.

```bash
D=packages/cli/scripts/coverage/compare
git worktree add ../fc-v2.3.0 v2.3.0 && (cd ../fc-v2.3.0 && pnpm install)
bash packages/cli/scripts/coverage/run.sh . out/fc-HEAD
bash packages/cli/scripts/coverage/run.sh ../fc-v2.3.0 out/fc-v2.3.0
TIKA_JAR=tika-app-4.2.0.jar bash $D/run-tools.sh tika packages/cli/scripts/coverage/probes out/tika
bash $D/run-tools.sh markitdown packages/cli/scripts/coverage/probes out/markitdown
RULE=2 python3 -I $D/score.py $D/rows.json packages/cli/scripts/coverage/probes out $D/prevalence-2026-10-16 report.json
python3 -I $D/tables.py report.json
```

`score.py` credits a show or label row when every marker of the row is in the output, and
a hide row when its marker is absent while the probe still gave QZ output. `tables.py`
prints the raw and the prevalence-weighted tables and counts raw-source passthrough as not
read: markitdown printing `.eml` and `.rtf` as their own source, Tika printing `.ipynb` as
JSON. `prevalence-2026-10-16/` holds, per real file of a format, the map rows it carries
(from `prevalence/run.mjs` over a Common Crawl sample); a row's weight is its share of
those files.

The 45 hard files of `packages/core/tests/fixtures/unreadable-corpus.ts`:

```bash
tsx $D/dump-corpus.mts c45
TIKA_JAR=tika-app-4.2.0.jar bash $D/run-corpus45.sh c45 out45
tsx $D/fc-corpus.mts . c45 fc-head.json
tsx $D/fc-corpus.mts ../fc-v2.3.0 c45 fc-v230.json
python3 -I $D/score45.py c45 out45 report45.json fc-HEAD=fc-head.json fc-v2.3.0=fc-v230.json
python3 -I $D/tables.py report.json --json figures.json report45.json
```
