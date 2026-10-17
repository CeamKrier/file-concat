#!/bin/bash
# Reruns FileConcat's rows of browser-text-extraction-benchmark at the version
# in apps/web/package.json, the way the 2.1 rows were measured on 2026-10-07:
# the production build served by vite preview, every file dropped into the page
# by measure-live-build.mjs, the Plain bundle scored by each corpus's own scorer.
#   pdf        olmOCR-bench average score, docs/corpora/olmocr-bench (1403 pages)
#   web-pages  AEB F1 x100 on 181 pages saved by Chrome (the "saved from url"
#              comment added), links and images stripped, title and Saved-from
#              lines dropped: the reader-only view the 2.1 row scored
#   archives   built archives whose every text member hashes to the
#              build-archive-corpus.py key (2.1: 25 of 26)
# Writes docs/measurements/bench-browser-<version>.json; logs and raw results
# stay (gitignored) in docs/measurements/bench-browser-<version>/.
#
# Rivals are not rerun. Needs the olmOCR venv (docs/corpora/.venv-olmocr) and
# Playwright's Chromium. The PDF corpus takes the better part of an hour.
#
# usage, from the repo root: bash packages/cli/scripts/bench/rerun-browser.sh
set -euo pipefail

V=$(node -p 'require("./apps/web/package.json").version.split(".").slice(0, 2).join(".")')
DAY=$(date +%F)
C=docs/corpora
W=docs/measurements/bench-browser-$V
OUT=docs/measurements/bench-browser-$V.json
URL=http://localhost:4719/
LIVE="node packages/cli/scripts/measure-live-build.mjs $URL"
CAND=fileconcat+live-$DAY
mkdir -p "$W"
took() { echo "$1 $(( $(date +%s) - $2 ))s" | tee -a "$W/times.txt" >&2; }

pnpm build >"$W/build.log" 2>&1
# setsid: the preview is its own process group, so the trap stops vite too.
(cd apps/web && exec setsid pnpm vite preview --port 4719 --strictPort) >"$W/preview.log" 2>&1 &
P=$!
trap 'kill -- -$P 2>/dev/null || true' EXIT
until curl -sf -o /dev/null $URL; do sleep 2; done

# PDF: one Markdown file per page into a new olmOCR candidate dir.
t=$(date +%s)
$LIVE $C/olmocr-bench/pdfs "$W/pdf.json" --ext pdf --olmocr $C/olmocr-bench/$CAND >"$W/pdf-drop.log" 2>&1
docs/corpora/.venv-olmocr/bin/python -I -m olmocr.bench.benchmark --dir $C/olmocr-bench --candidate $CAND >"$W/pdf-score.log" 2>&1
took pdf "$t"

# Web pages: each AEB page with Chrome's Save-as comment after the doctype.
t=$(date +%s)
python3 -I - $C/html-aeb "$W/aeb/marked" <<'PY'
import gzip, json, os, re, sys
A, out = sys.argv[1:3]
os.makedirs(out, exist_ok=True)
for k, v in json.load(open(f"{A}/ground-truth.json")).items():
    raw = gzip.open(f"{A}/html/{k}.html.gz").read()
    url = v["url"]
    m = re.match(rb"\s*<!doctype[^>]*>\s*", raw, re.I)
    at = m.end() if m else 0
    open(f"{out}/{k}.html", "wb").write(raw[:at] + f"<!-- saved from url=({len(url):04d}){url} -->\n".encode() + raw[at:])
PY
$LIVE "$W/aeb" "$W/aeb.json" >"$W/aeb-drop.log" 2>&1
# AEB scores every output/*.json; this run's row is named after the candidate.
python3 -I - "$W/aeb.json" $C/html-aeb/output/$CAND.json <<'PY'
import json, re, sys
src, out = sys.argv[1:3]
def body(t):  # the product's title heading and Saved-from line are not the article
    return re.sub(r"\A# [^\n]*\n+(Saved from \S+\n+)?", "", t)
def strip(t):  # no-URL view, as AEB's own -nolinks rows
    t = re.sub(r"!\[([^\]]*)\]\([^)]*\)", "", t)
    return re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", t)
rows = json.load(open(src))["results"]
json.dump({r["fixture"].split("/")[-1][:-5]: {"articleBody": strip(body(r["text"]))} for r in rows}, open(out, "w"))
PY
(cd $C/html-aeb && python3 evaluate.py) >"$W/aeb-score.log" 2>&1
took web-pages "$t"

# Archives: one archive per drop, so every bundled part is that archive's.
t=$(date +%s)
$LIVE $C/archives "$W/archives.json" --batch 1 --only built >"$W/archives-drop.log" 2>&1
took archives "$t"

python3 -I - "$V" "$W" $C "$CAND" "$OUT" <<'PY'
import datetime, hashlib, json, re, sys
v, w, c, cand, out = sys.argv[1:6]
pdf = re.search(rf"^{re.escape(cand)} : Average Score: ([\d.]+)%", open(f"{w}/pdf-score.log").read(), re.M)
web = next(l.split()[1] for l in open(f"{w}/aeb-score.log") if l.split()[:1] == [cand])
# A bundle carries text, not bytes: a member matches as written or plus the one
# trailing newline the split trims. Empty and .bin members cannot be carried.
key = json.load(open(f"{c}/archives/built/manifest.json"))
sha = lambda s: hashlib.sha256(s.encode()).hexdigest()
exact = 0
for r in json.load(open(f"{w}/archives.json"))["results"]:
    name = r["fixture"].split("/")[-1]
    if name not in key:  # manifest.json itself is dropped too
        continue
    got = {m["path"].split("/", 1)[-1]: m["text"] for m in r.get("members") or []}
    if r["text"] and not got:  # a lone compressed file (README.md.gz) bundles under its own name
        got = {name[:-3]: r["text"]}
    want = [m for m in key[name] if m["size"] > 0 and not m["path"].endswith(".bin")]
    exact += all(m["path"] in got and m["sha256"] in (sha(got[m["path"]]), sha(got[m["path"]] + "\n")) for m in want)
rows = {"pdf": float(pdf[1]), "web-pages": round(float(web) * 100, 1), "archives": exact}
json.dump({"study": "browser-text-extraction-benchmark", "version": v, "measured": datetime.date.today().isoformat(), "rows": rows}, open(out, "w"), indent=1)
print(out, rows)
PY
