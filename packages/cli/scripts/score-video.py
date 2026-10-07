"""Score extract-candidate results on `build-video-corpus.py`'s videos, per variant.

Two questions, one per reader kind:
- speech (subtitle track, ASR): corpus WER against the spoken text, with the
  same normalizers and method as `score-asr.py`; a failure is all deletions.
- on-screen text (frames + OCR, whose output carries `[frame Ns]` markers):
  word 4-gram shingle precision / recall / F1 per file against the slide text
  (plus the subtitles when they are burned in), the metric of
  `score-against-reference.py`, mean over files. `frames` is how many frames
  survived the repeat filter.

Usage:
  python packages/cli/scripts/score-video.py <manifest.json> <results.json>...
"""

import collections
import json
import re
import sys

import jiwer
from whisper_normalizer.basic import BasicTextNormalizer
from whisper_normalizer.english import EnglishTextNormalizer

WORD = re.compile(r"\w+", re.UNICODE)
MARKER = re.compile(r"^\[frame [\d.]+s\]$", re.MULTILINE)


def shingles(text, n=4):
    words = WORD.findall((text or "").lower())
    return collections.Counter(tuple(words[i : i + n]) for i in range(max(1, len(words) - n + 1)) if words)


def prf(ref, pred):
    t, p = shingles(ref), shingles(pred)
    tp = sum((t & p).values())
    prec = tp / sum(p.values()) if p else 0.0
    rec = tp / sum(t.values()) if t else 0.0
    return prec, rec, (2 * prec * rec / (prec + rec) if prec + rec else 0.0)


assert prf("one two three four five", "one two three four five")[2] == 1.0
assert jiwer.wer("a b c d", "a b x d") == 0.25

manifest = json.load(open(sys.argv[1]))
normalize = {"en": EnglishTextNormalizer(), "tr": BasicTextNormalizer()}

print("| reader | variant | files | failed | WER % | P | R | F1 | frames | RTF |")
print("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
for path in sys.argv[2:]:
    data = json.load(open(path))
    groups = collections.defaultdict(list)
    for r in data["results"]:
        row = manifest.get(r["fixture"])
        if row:
            groups[r["fixture"].split("/")[0]].append((r, row))
    for variant, pairs in sorted(groups.items()):
        failed = sum(bool(r["error"]) for r, _ in pairs)
        rtf = sum(r["ms"] for r, _ in pairs) / 1000 / sum(row["seconds"] for _, row in pairs)
        ocr = any(MARKER.search(r["text"] or "") for r, _ in pairs) or data["reader"].startswith("frames-")
        wer = p = rec = f1 = frames = "-"
        if ocr:
            scores = []
            for r, row in pairs:
                ref = " ".join(row["slides"]) + (" " + row["speech"] if row["burned"] else "")
                scores.append(prf(ref, "" if r["error"] else MARKER.sub("", r["text"])))
            p, rec, f1 = (f"{sum(s[i] for s in scores) / len(scores):.3f}" for i in range(3))
            frames = sum(len(MARKER.findall(r["text"] or "")) for r, _ in pairs)
        else:
            refs = [normalize[row["lang"]](row["speech"]).strip() for _, row in pairs]
            hyps = [normalize[row["lang"]]("" if r["error"] else r["text"]).strip() for r, row in pairs]
            wer = f"{jiwer.wer(refs, hyps) * 100:.1f}"
        print(f"| {data['reader']} | {variant} | {len(pairs)} | {failed} | {wer} | {p} | {rec} | {f1} | {frames} | {rtf:.3f} |")
