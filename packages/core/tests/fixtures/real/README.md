# Real-document fixtures

Measurement input for the extraction-quality reading. **Not part of the test
suite** — nothing in `tests/*.test.ts` reads this directory, and the contents are
gitignored (only this file and `generate.mjs` are tracked).

The committed fixtures in `../containers.ts` and `../pdf.ts` are hand-built bytes
on purpose: a reader can see exactly what makes each one interesting. They can
only prove what was encoded into them. A real Word table with merged cells, or a
two-column PDF from a LaTeX engine, behaves differently — that is what this
directory is for.

## What belongs here

Files written by real software are worth far more than generated ones. Ranked by
what the counters say we actually extract (60 days to 2026-08-15, by Runs):

| Priority           | Wanted                                                        | Why                                                                             |
| ------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **pdf** (31 runs)  | A two-column academic paper                                    | Column reading order is the classic failure, and "summarize papers" is a keyword |
| **pdf**            | A PDF with a table drawn as positioned text                    | No table structure exists in PDF; whether cells survive is unknown               |
| **pdf**            | A PDF with running headers and footers on every page           | Repeated furniture between every page of prose                                   |
| **pdf**            | A scanned PDF (no text layer)                                  | 23% of dropped PDFs fail extraction; this is the OCR path                        |
| **pdf**            | An encrypted / password-protected PDF                          | Failure mode unmeasured                                                          |
| **ipynb** (18)     | A notebook with an image attachment in a markdown cell         | Second most extracted format                                                     |
| **docx** (17)      | A Word document with a **merged-cell** table and numbered list | `tableDocx()` only covers a plain 3-column grid                                  |
| **docx**           | A Word document with tracked changes and comments              | A tracked deletion reaching the bundle as current text is a correctness bug      |
| **docx**           | A Word document with footnotes, hyperlinks, headers, footers   | All unmeasured                                                                   |
| xlsx / pptx / rest | Anything real                                                  | ≤1 Run in 60 days; floor check only                                              |

Name files after what makes them interesting, not after where they came from:
`docx-merged-cells.docx`, `pdf-two-column.pdf`, `pdf-scanned.pdf`.

**Strip anything private before dropping a file here.** It is gitignored, but it
still sits on disk in a public repo's working tree.

## If you have no real files

`node generate.mjs` writes a synthetic corpus covering the same structures using
real writer libraries (`docx`, `exceljs`, `pptxgenjs`, `pdfkit`), which is far
closer to a real file than hand-written XML. It prints what it wrote and what it
could not express. Generated files are named `gen-*` so a report can say plainly
which findings came from real documents and which did not.

The generator libraries are **not** workspace dependencies — nothing that ships
needs them. `generate.mjs` names the install command in its header.
