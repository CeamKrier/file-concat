"""Score extract-candidate results against a reference reader's text, per format.

For formats with no answer key (legacy doc/xls/ppt, rtf, msg), a mature reader is
the answer key: Apache Tika (Apache POI underneath) for real files, or the
modern OOXML original of a converted file. The metric is the article-extraction
benchmark's: word 4-gram shingle precision / recall / F1 per file, each file
weighted equally, mean with a 95% bootstrap interval. A failed or empty output
scores 0. Files whose reference has fewer than 20 words are left out (a broken
or encrypted fixture is not a quality question).

The reference is a Tika batch output directory (`<relpath>.txt`) or a results
JSON, and so is each reader (a Tika directory scores Tika itself, the ceiling
for a converted file). `--by-stem` matches on the base name without its
extension, for a legacy file converted from an OOXML original (`doc/a.doc`
against `src/a.docx`).

Usage:
  python3 packages/cli/scripts/score-against-reference.py [--by-stem] <reference> <reader>...
"""

import collections
import json
import os
import random
import re
import sys

WORD = re.compile(r"\w+", re.UNICODE)


def shingles(text, n=4):
    words = WORD.findall((text or "").lower())
    return collections.Counter(tuple(words[i : i + n]) for i in range(max(1, len(words) - n + 1)) if words)


def prf(ref, pred):
    t, p = shingles(ref), shingles(pred)
    tp = sum((t & p).values())
    prec = tp / sum(p.values()) if p else 0.0
    rec = tp / sum(t.values()) if t else 0.0
    return prec, rec, (2 * prec * rec / (prec + rec) if prec + rec else 0.0)


assert prf("one two three four five", "one two three four five")[2] == 1.0 and prf("a b c d", "")[2] == 0.0


def ci(values, rounds=1000):
    rng = random.Random(0)
    means = sorted(sum(rng.choices(values, k=len(values))) / len(values) for _ in range(rounds))
    return means[int(rounds * 0.025)], means[int(rounds * 0.975)]


def load(path):
    """A results JSON, or a Tika batch directory read as one."""
    if not os.path.isdir(path):
        return json.load(open(path))
    results = []
    for root, _, files in os.walk(path):
        for f in files:
            text = open(os.path.join(root, f), errors="replace").read()
            results.append({"fixture": os.path.relpath(os.path.join(root, f), path)[: -len(".txt")], "text": text, "error": None})
    return {"reader": "tika " + os.path.basename(path.rstrip("/")), "results": results}


args = sys.argv[1:]
by_stem = "--by-stem" in args
args = [a for a in args if a != "--by-stem"]
key = (lambda name: os.path.splitext(os.path.basename(name))[0]) if by_stem else (lambda name: name)

reference = {key(r["fixture"]): r["text"] for r in load(args[0])["results"] if not r["error"]}
reference = {k: v for k, v in reference.items() if len(WORD.findall(v)) >= 20}

print(f"reference {args[0]}: {len(reference)} files with 20+ words")
print("| reader | format | n | P | R | F1 (95% CI) | F1 < 0.5 |")
print("| --- | --- | --- | --- | --- | --- | --- |")
for path in args[1:]:
    data = load(path)
    rows = collections.defaultdict(list)
    for r in data["results"]:
        k = key(r["fixture"])
        if k in reference:
            rows[os.path.splitext(r["fixture"])[1][1:]].append(prf(reference[k], "" if r["error"] else r["text"]))
    for ext, scores in sorted(rows.items()):
        f1 = [s[2] for s in scores]
        lo, hi = ci(f1)
        mean = lambda i: sum(s[i] for s in scores) / len(scores)
        low = sum(f < 0.5 for f in f1)
        print(f"| {data['reader']} | {ext} | {len(scores)} | {mean(0):.3f} | {mean(1):.3f} | {mean(2):.3f} ({lo:.3f}-{hi:.3f}) | {low} |")
