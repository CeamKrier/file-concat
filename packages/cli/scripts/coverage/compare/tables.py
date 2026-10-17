# Both probe tables from one score.py report (RULE=2), raw-source passthrough zeroed.
# usage: python3 -I tables.py <score report.json>
# Passthrough: the tool printed the file's own source (MIME and base64, RTF control
# words, notebook JSON) instead of extracting it, so every row of that format is missed.
import json, sys, collections

TOOLS = ["fc-HEAD", "fc-v2.3.0", "tika", "markitdown"]
NAMES = ["FileConcat HEAD", "FileConcat 2.3.0", "Tika 3.3.2", "markitdown 0.1.5"]
PASSTHROUGH = {("markitdown", "Email .eml"), ("markitdown", "RTF"), ("tika", "Notebook .ipynb")}

rep = json.load(open(sys.argv[1]))
v, weights = rep["verdicts"], rep["weights"]
by_fmt = collections.defaultdict(list)
for key in v["fc-HEAD"]:
    by_fmt[key.rsplit("#", 1)[0]].append(key)


def ok(tool, fmt, key):
    return (tool, fmt) not in PASSTHROUGH and v[tool][key]


def star(tool, fmt):
    return "*" if (tool, fmt) in PASSTHROUGH else ""


print("| Format | Rows | " + " | ".join(NAMES) + " |")
print("|---|---|" + "---|" * len(TOOLS))
totals = collections.Counter()
for fmt, keys in by_fmt.items():
    cells = []
    for t in TOOLS:
        n = sum(ok(t, fmt, k) for k in keys)
        totals[t] += n
        cells.append(f"{round(100 * n / len(keys))}{star(t, fmt)}")
    print(f"| {fmt} | {len(keys)} | " + " | ".join(cells) + " |")
rows = sum(len(k) for k in by_fmt.values())
print(f"| **Total** | **{rows}** | " + " | ".join(f"**{totals[t]} ({100 * totals[t] / rows:.1f}%)**" for t in TOOLS) + " |")

print()
print("| Format | Rows scored / carried | " + " | ".join(NAMES) + " |")
print("|---|---|" + "---|" * len(TOOLS))
means = collections.defaultdict(list)
for fmt, w in weights.items():
    scored = [k for k in by_fmt.get(fmt, []) if w.get(k, 0) > 0]
    total = sum(w[k] for k in scored)
    cells = []
    for t in TOOLS:
        pct = 100 * sum(w[k] for k in scored if ok(t, fmt, k)) / total
        means[t].append(pct)
        cells.append(f"{pct:.1f}{star(t, fmt)}")
    print(f"| {fmt} | {len(scored)}/{len(w)} | " + " | ".join(cells) + " |")
print(f"| **Mean of {len(weights)} formats** | | " + " | ".join(f"**{sum(means[t]) / len(means[t]):.1f}**" for t in TOOLS) + " |")

# --json <out> <score45.json>: the figures the blog post draws, from the same numbers.
if len(sys.argv) > 3 and sys.argv[2] == "--json":
    label = {"fc-HEAD": "FileConcat 2.6", "fc-v2.3.0": "FileConcat 2.3", "tika": "Tika 3.3.2", "markitdown": "markitdown 0.1.5"}
    corpus = json.load(open(sys.argv[4]))
    tools45 = {"fc-HEAD": "FileConcat 2.6", "fc-v2.3.0": "FileConcat 2.3", "tika": "Tika 3.3.2", "markitdown": "markitdown 0.1.5", "file": "file 5.45", "rg": "rg 15.2.0", "git": "git 2.43.0"}
    corpus_rows = [{"label": n, "value": sum(bool(x) for x in corpus[t].values())} for t, n in tools45.items()]
    out = {
        "weighted": {
            "title": "Coverage weighted by real files, mean of 11 formats",
            "rows": sorted(({"label": label[t], "value": round(sum(means[t]) / len(means[t]), 1)} for t in TOOLS), key=lambda r: -r["value"]),
        },
        "raw": {
            "title": f"Constructs read, {rows} rows over 17 formats",
            "rows": sorted(({"label": label[t], "value": round(100 * totals[t] / rows, 1)} for t in TOOLS), key=lambda r: -r["value"]),
        },
        "corpus": {
            "title": "Hard files handled, of 45",
            "rows": sorted(corpus_rows, key=lambda r: -r["value"]),
        },
    }
    json.dump(out, open(sys.argv[3], "w"), indent=1)
    open(sys.argv[3], "a").write("\n")
