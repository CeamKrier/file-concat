"""Score olmOCR-bench runs on a subset of its PDFs, from the scorer's own log.

The official score averages every page; a reader that only touches some pages
(OCR over the pages with no text layer) moves it by a fraction that hides the
gain. This restricts the jsonl tests to the PDFs a page-image directory holds
(`<category>/<name>.png` for `<category>/<name>.pdf`, as `render-pdf-pages.ts`
writes them) and counts a test passed unless the log has a FAIL line for it.
Baseline tests are not in the jsonl files and are left out. "without absent"
also drops the absent tests (a header that must not appear), which an empty
page passes, so a reader that returns nothing is not credited for it.

Usage:
  python3 packages/cli/scripts/olmocr-subset.py <bench_dir> <page_image_dir> <benchmark.log>...
"""

import collections
import glob
import json
import os
import re
import sys

bench, pages, logs = sys.argv[1], sys.argv[2], sys.argv[3:]
subset = {
    os.path.relpath(p, pages)[: -len(".png")] + ".pdf"
    for p in glob.glob(os.path.join(pages, "**", "*.png"), recursive=True)
}
tests, absent = {}, set()
for f in glob.glob(os.path.join(bench, "*.jsonl")):
    for line in open(f):
        t = json.loads(line)
        if t["pdf"] in subset:
            tests[t["id"]] = os.path.basename(f)[: -len(".jsonl")]
            if t["type"] == "absent":
                absent.add(t["id"])

print(f"{len(subset)} pages, {len(tests)} tests")
for log in logs:
    fails = set(re.findall(r"\[FAIL\] Test (\S+) on ", open(log, errors="replace").read()))
    total, passed = collections.Counter(), collections.Counter()
    for test, category in tests.items():
        total[category] += 1
        passed[category] += test not in fails
    rate = lambda cats: 100 * sum(passed[c] for c in cats) / sum(total[c] for c in cats)
    per = " ".join(f"{c} {100 * passed[c] / total[c]:.1f} ({total[c]})" for c in sorted(total))
    no_math = [c for c in total if "math" not in c]
    shown = [t for t, c in tests.items() if t not in absent and "math" not in c]
    present = 100 * sum(t not in fails for t in shown) / len(shown)
    print(f"{os.path.basename(log)}: all {rate(list(total)):.1f}, without math {rate(no_math):.1f}, without math or absent {present:.1f} | {per}")
