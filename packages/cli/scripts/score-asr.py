"""Word error rate per set for extract-candidate speech results, against `build-asr-corpus.py`'s manifest.

The Open ASR Leaderboard's method: both sides through Whisper's normalizer
(English for English, the basic one otherwise), then corpus WER per set (all
edits over all reference words, so a long file weighs by its words), with
jiwer. A failed file counts as an empty hypothesis, all deletions. Speed is
the real-time factor: processing time over audio time (below 1 is faster
than real time).

Usage:
  python packages/cli/scripts/score-asr.py <manifest.json> <results.json>...
"""

import collections
import json
import sys

import jiwer
from whisper_normalizer.basic import BasicTextNormalizer
from whisper_normalizer.english import EnglishTextNormalizer

manifest = json.load(open(sys.argv[1]))
normalize = {"en": EnglishTextNormalizer(), "tr": BasicTextNormalizer()}

assert jiwer.wer("a b c d", "a b x d") == 0.25

print("| reader | set | files | WER % | failed | RTF | ms p50 |")
print("| --- | --- | --- | --- | --- | --- | --- |")
for path in sys.argv[2:]:
    data = json.load(open(path))
    sets = collections.defaultdict(lambda: {"ref": [], "hyp": [], "ms": [], "sec": 0.0, "failed": 0})
    for r in data["results"]:
        key = next((k for k in manifest if r["fixture"].endswith(k)), None)
        if key is None:
            continue
        row = manifest[key]
        norm = normalize[row["lang"]]
        s = sets[key.split("/")[0]]
        ref = norm(row["text"]).strip()
        if not ref:
            continue
        s["ref"].append(ref)
        s["hyp"].append(norm("" if r["error"] else r["text"]).strip())
        s["ms"].append(r["ms"])
        s["sec"] += row["seconds"]
        s["failed"] += bool(r["error"])
    for name, s in sorted(sets.items()):
        wer = jiwer.wer(s["ref"], s["hyp"]) * 100
        ms = sorted(s["ms"])
        rtf = sum(ms) / 1000 / s["sec"]
        print(f"| {data['reader']} | {name} | {len(ms)} | {wer:.1f} | {s['failed']} | {rtf:.3f} | {ms[len(ms) // 2]} |")
