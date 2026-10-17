# Scores the 45-case unreadable corpus per tool.
# usage: python3 -I score45.py <corpus dir> <tool out dir> <report.json> <label>=<fc-corpus.mts json>...
# Extractors (Tika, markitdown, FileConcat): text cases pass when at least 90% of the
#   expected words (tags stripped) are in the output; binary cases pass only when the
#   tool names the file as unreadable (FileConcat's binary verdict, or an error message);
#   silent empty output or garbage fails. The empty file passes on empty output, no crash.
# Detectors (file, git, rg): pass when their text/binary call matches the case.
import json, os, re, sys, collections

C, O, REPORT = sys.argv[1:4]
cases = json.load(open(os.path.join(C, "manifest.json")))
fcs = {label: {r["name"]: r for r in json.load(open(path))} for label, path in (a.split("=", 1) for a in sys.argv[4:])}


def words(s):
    return re.findall(r"\w+", re.sub(r"<[^>]+>", " ", s or ""))


def text_ok(expected, got):
    exp = words(expected)
    if not exp:
        return True
    have = collections.Counter(words(got))
    hit = sum(1 for w in exp if have[w] > 0)
    return hit / len(exp) >= 0.9


def read(tool, name, ext):
    p = os.path.join(O, tool, name + ext)
    return open(p, encoding="utf-8", errors="replace").read() if os.path.exists(p) else ""


res = collections.defaultdict(dict)
for c in cases:
    n, exp = c["name"], c["expect"]
    for tool in ("tika", "markitdown"):
        out, err = read(tool, n, ".out"), read(tool, n, ".err")
        failed = "exit 0" not in err
        if exp == "text":
            ok = text_ok(c["text"], out)
        elif exp == "binary":
            ok = failed and not out.strip()
        else:
            ok = not out.strip()
        res[tool][n] = ok
    for label, fc in fcs.items():
        f = fc[n]
        if exp == "text":
            res[label][n] = f["verdict"] != "binary" and text_ok(c["text"], f.get("text", ""))
        elif exp == "binary":
            res[label][n] = f["verdict"] == "binary"
        else:
            res[label][n] = f["verdict"] != "binary" and not (f.get("text") or "").strip()
    binary = exp == "binary"
    res["file"][n] = ("text" not in read("file", n, ".out").lower()) == binary or (exp == "empty" and "empty" in read("file", n, ".out"))
    res["git"][n] = read("git", n, ".out").startswith("-\t-") == binary
    rg = read("rg", n, ".out")
    res["rg"][n] = ("binary file matches" in rg) == binary if exp != "empty" else "exit 1" in rg
json.dump(res, open(REPORT, "w"), indent=1)
for tool, r in res.items():
    print(tool, sum(r.values()), "/", len(r), "failed:", [k for k, v in r.items() if not v][:12])
