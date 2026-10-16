"""Compare two run-corpus.sh outputs over the same real corpus, file by file.

Real files have no answer key, so this follows Apache Tika's tika-eval, which
compares two extractor versions over its Common Crawl regression corpus the
same way: per file, did it fail, time out, come back empty, carry replacement
characters; and between the runs, how much of the text is shared (tika-eval's
dice and overlap over lowercased word tokens, digits kept). A pair counts as
changed under tika-eval's own rule (overlap below 0.95, or more than 30 tokens
apart). It does not say which side is right: the changed files are the ones to
read by hand.

One thing tika-eval has no need for: the product labels what it adds
(`[Comment ...]`, `[Image: ...]`, `[^1]`, `[text](url)`, `--- Page header ---`),
so counting each label per side shows which constructs real files carry and
where a reader now finds them.

Usage:
    python3 packages/cli/scripts/compare-corpus-runs.py <corpus dir> <run A> <run B> [--tsv <file>]
"""

import argparse
import collections
import pathlib
import re

TOKEN = re.compile(r"\w+")
LABEL = re.compile(r"\[(Comment|Image|Table|Chart|Link|Attachment|Form field|Hidden|Slide|Sheet|Note|Hyperlink|Video|Audio|Equation|Field)\b")
SHAPES = {
    "link": re.compile(r"\]\((?:https?|mailto|ftp):"),
    "footnote": re.compile(r"\[\^\d+\]"),
    "section": re.compile(r"^--- [A-Z][^\n]* ---$", re.M),
    "table-row": re.compile(r"^\|.*\|\s*$", re.M),
    "heading": re.compile(r"^#{1,6} ", re.M),
}
REPLACEMENT = "�"
PRIVATE = re.compile("[-]")


def read(run: pathlib.Path, rel: str) -> dict:
    out, ex = run / f"{rel}.out.txt", run / f"{rel}.exit"
    code, ms = (ex.read_text().split() + ["?", "0"])[:2] if ex.exists() else ("missing", "0")
    raw = out.read_text(errors="replace") if out.exists() else ""
    head, _, text = raw.partition("\n")
    status = "ok"
    if code == "124":
        status = "timeout"
    elif code not in ("0", "?"):
        status = "crash"
    elif "| ERROR:" in head:
        status = "error"
    elif not head.startswith("--- "):
        status = "crash"
    elif " | extract/" not in head and ":readability" not in head and ":turndown" not in head and "/html" not in head:
        status = "declined"
    elif not text.strip():
        status = "empty"
    tokens = collections.Counter(t.lower() for t in TOKEN.findall(text))
    marks = collections.Counter(m.group(1) for m in LABEL.finditer(text))
    for name, rx in SHAPES.items():
        n = len(rx.findall(text))
        if n:
            marks[name] = n
    return {
        "status": status,
        "ms": int(ms) if ms.isdigit() else 0,
        "chars": len(text),
        "tokens": tokens,
        "fffd": text.count(REPLACEMENT),
        "private": len(PRIVATE.findall(text)),
        "marks": marks,
        "head": head,
    }


def contrast(a: collections.Counter, b: collections.Counter) -> tuple[float, float]:
    ua, ub = len(a), len(b)
    shared = sum(1 for t in a if t in b)
    dice = 2 * shared / (ua + ub) if ua + ub else 1.0
    ta, tb = sum(a.values()), sum(b.values())
    overlap = 2 * sum(min(a[t], b[t]) for t in a if t in b) / (ta + tb) if ta + tb else 1.0
    return dice, overlap


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("corpus")
    ap.add_argument("a")
    ap.add_argument("b")
    ap.add_argument("--tsv")
    args = ap.parse_args()
    corpus, run_a, run_b = map(pathlib.Path, (args.corpus, args.a, args.b))
    files = sorted(str(p.relative_to(corpus)) for p in corpus.glob("*/*") if p.is_file())

    per_fmt: dict[str, list] = collections.defaultdict(list)
    rows = []
    for rel in files:
        fmt = rel.split("/")[0]
        a, b = read(run_a, rel), read(run_b, rel)
        dice, overlap = contrast(a["tokens"], b["tokens"])
        ta, tb = sum(a["tokens"].values()), sum(b["tokens"].values())
        changed = (ta + tb > 10) and (overlap < 0.95 or abs(ta - tb) > 30)
        per_fmt[fmt].append((a, b, changed, overlap))
        only_b = [t for t, _ in (b["tokens"] - a["tokens"]).most_common(8)]
        only_a = [t for t, _ in (a["tokens"] - b["tokens"]).most_common(8)]
        rows.append([rel, a["status"], b["status"], ta, tb, f"{dice:.3f}", f"{overlap:.3f}", int(changed),
                     a["fffd"], b["fffd"], b["private"], a["ms"], b["ms"],
                     " ".join(f"{k}:{v}" for k, v in sorted(a["marks"].items())),
                     " ".join(f"{k}:{v}" for k, v in sorted(b["marks"].items())),
                     " ".join(only_a), " ".join(only_b)])

    if args.tsv:
        head = ["file", "status_a", "status_b", "tokens_a", "tokens_b", "dice", "overlap", "changed", "fffd_a", "fffd_b",
                "private_b", "ms_a", "ms_b", "marks_a", "marks_b", "more_in_a", "more_in_b"]
        pathlib.Path(args.tsv).write_text("\t".join(head) + "\n" + "".join("\t".join(map(str, r)) + "\n" for r in rows))

    def pct(n: int, d: int) -> str:
        return f"{100 * n / d:.0f}%" if d else "-"

    print("| Format | Files | Read A | Read B | Failed A | Failed B | Empty A | Empty B | Changed | Tokens B/A | U+FFFD files B |")
    print("|---|---|---|---|---|---|---|---|---|---|---|")
    for fmt, items in sorted(per_fmt.items()):
        n = len(items)
        def count(side: int, *states: str) -> int:
            return sum(1 for it in items if it[side]["status"] in states)
        tok_a = sum(sum(it[0]["tokens"].values()) for it in items)
        tok_b = sum(sum(it[1]["tokens"].values()) for it in items)
        print(f"| {fmt} | {n} | {pct(count(0, 'ok'), n)} | {pct(count(1, 'ok'), n)} "
              f"| {count(0, 'error', 'crash', 'timeout')} | {count(1, 'error', 'crash', 'timeout')} "
              f"| {count(0, 'empty')} | {count(1, 'empty')} | {pct(sum(1 for it in items if it[2]), n)} "
              f"| {tok_b / tok_a:.2f} | {sum(1 for it in items if it[1]['fffd'])} |" if tok_a else
              f"| {fmt} | {n} | {pct(count(0, 'ok'), n)} | {pct(count(1, 'ok'), n)} | - | - | - | - | - | - | - |")

    print("\nFiles carrying each label (A -> B), where either side has it:\n")
    print("| Format | Label | Files A | Files B | Share of files B |")
    print("|---|---|---|---|---|")
    for fmt, items in sorted(per_fmt.items()):
        labels = sorted({k for it in items for side in (0, 1) for k in it[side]["marks"]})
        for label in labels:
            fa = sum(1 for it in items if it[0]["marks"].get(label))
            fb = sum(1 for it in items if it[1]["marks"].get(label))
            print(f"| {fmt} | {label} | {fa} | {fb} | {pct(fb, len(items))} |")


if __name__ == "__main__":
    main()
