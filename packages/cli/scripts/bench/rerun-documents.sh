#!/bin/bash
# Reruns FileConcat's rows of the two document studies at the version in
# apps/web/package.json, against rival outputs kept from their own runs:
#   markitdown-vs-tika-text-extraction  coverage, constructs, hidden, hard files, 11 formats
#   what-gets-lost-converting-documents-to-text  the 16 August defects, web chain
# Writes docs/measurements/bench-documents-<version>.json for add-rows.mjs.
#
# Rivals are not rerun: Tika, markitdown, file, git and rg are pinned to the
# versions their rows name, and their outputs live (gitignored) in
# docs/measurements/capability-2026-10-17/. A minute or two, no network.
#
# usage, from the repo root: bash packages/cli/scripts/bench/rerun-documents.sh
set -euo pipefail

V=$(node -p 'require("./apps/web/package.json").version.split(".").slice(0, 2).join(".")')
C=packages/cli/scripts/coverage
D=$C/compare
KEEP=docs/measurements/capability-2026-10-17
OUT=docs/measurements/bench-documents-$V.json
W=$(mktemp -d)
trap 'rm -rf "$W"' EXIT

# Coverage: this build's probe outputs beside the kept rival ones.
bash $C/run.sh . "$W/out/fc-HEAD" >/dev/null
for t in fc-v2.3.0 tika markitdown; do ln -s "$PWD/$KEEP/out/$t" "$W/out/$t"; done
RULE=2 python3 -I $D/score.py $D/rows.json $C/probes "$W/out" $D/prevalence-2026-10-16 "$W/report.json" >/dev/null

# Hard files: the 45 cases through this build, rivals from the kept run.
mkdir -p "$W/c45"
pnpm -s --filter @fileconcat/cli exec tsx "$PWD"/$D/dump-corpus.mts "$W/c45" >/dev/null
pnpm -s --filter @fileconcat/cli exec tsx "$PWD"/$D/fc-corpus.mts "$PWD" "$W/c45" "$W/fc-head.json" >/dev/null
python3 -I $D/score45.py "$W/c45" $KEEP/out45 "$W/report45.json" \
  fc-HEAD="$W/fc-head.json" fc-v2.3.0=$KEEP/fc-v230.json >/dev/null
FC_LABEL="FileConcat $V" python3 -I $D/tables.py "$W/report.json" --json "$W/figures.json" "$W/report45.json" $D/rows.json >/dev/null

# Defects: the web chain's tally of the 16.
pnpm -s --filter @fileconcat/cli measure-extraction --out "$W/extraction.json" --force >/dev/null

python3 -I - "$V" "$W/figures.json" "$W/extraction.json" "$OUT" <<'PY'
import json, sys, datetime
v, figures, extraction, out = sys.argv[1:5]
fig = json.load(open(figures))
ours = lambda rows: next(r["value"] for r in rows if r["label"] == f"FileConcat {v}")
# benchmarks.json chart id per format, as score.py names the formats.
FORMATS = {"Word .docx": "docx", "Excel .xlsx": "xlsx", "PowerPoint .pptx": "pptx", "PDF": "pdf-coverage",
           "Email .eml": "eml", "HTML": "html", "EPUB": "epub", "RTF": "rtf", "ODT": "odt", "ODS": "ods", "ODP": "odp"}
rows = {
    "document-coverage": ours(fig["weighted"]["rows"]),
    "constructs-read": ours(fig["raw"]["rows"]),
    "hidden-kept-out": ours(fig["hidden"]["rows"]),
    "hard-files": ours(fig["corpus"]["rows"]),
    "document-defects": json.load(open(extraction))["closed"]["web"]["closed"],
}
rows.update({FORMATS[f]: ours(r) for f, r in fig["formats"].items()})
json.dump({"version": v, "measured": datetime.date.today().isoformat(), "rows": rows}, open(out, "w"), indent=1)
print(out)
PY
