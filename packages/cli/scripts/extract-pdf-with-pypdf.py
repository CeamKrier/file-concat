"""Read the PDF fixtures with an independent reader, so a loss can be attributed.

`measure-extraction-quality.ts` says what FileConcat recovers from a document.
On its own that cannot tell a reader's choice apart from a limit of the format,
and those are different findings: a structure every reader loses is inherent to
PDF and no library swap fixes it, while a structure another reader recovers is
ours to fix. This runs the identical bytes through `pypdf`, which shares no code
with our stack (officeparser wraps pdf.js), and writes what it got.

pypdf is not a workspace dependency and nothing that ships needs it:

    pip install pypdf

Output goes next to the TypeScript measurement, and
`measure-extraction-quality.ts --pypdf <file>` reads it to fill the comparison
column. Run this first, or that column reports "not run" rather than guessing.

Usage:
    python3 packages/cli/scripts/extract-pdf-with-pypdf.py
    python3 packages/cli/scripts/extract-pdf-with-pypdf.py --out /tmp/x.json
"""

import json
import pathlib
import sys

import pypdf

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
CORPUS = REPO_ROOT / "packages" / "core" / "tests" / "fixtures" / "real"


def extract(path: pathlib.Path) -> dict:
    """Page text joined the way our own reader joins it, one page per line group."""
    row = {"fixture": path.name, "text": "", "error": None}
    try:
        reader = pypdf.PdfReader(str(path))
        row["text"] = "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception as err:  # noqa: BLE001 - the failure itself is the measurement
        row["error"] = f"{type(err).__name__}: {err}"
    return row


def main() -> int:
    if not CORPUS.is_dir():
        print(f"No corpus at {CORPUS}. Run `node generate.mjs` there first.", file=sys.stderr)
        return 1

    argv = sys.argv[1:]
    out = pathlib.Path(argv[argv.index("--out") + 1]) if "--out" in argv else (
        REPO_ROOT / "docs" / "measurements" / "extraction-pypdf.json"
    )

    rows = [extract(p) for p in sorted(CORPUS.glob("*.pdf"))]
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"reader": f"pypdf {pypdf.__version__}", "results": rows}, indent=2))

    for row in rows:
        state = row["error"] or f'{len(row["text"])} chars'
        print(f"{row['fixture']}: {state}")
    print(f"\nWrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
