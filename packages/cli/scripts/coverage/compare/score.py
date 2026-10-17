# Auto-scores coverage-map rows for every tool's probe outputs.
# usage: python3 -I score.py <rows.json> <probes dir> <out dir> <prevalence dir> <report.json>
# Rule (fixed before totals were read):
#   rows without a QZ marker are not auto-scorable and leave every column;
#   show/label (and every other ideal): covered if every marker is in the tool's output
#     for the format's probes;
#   hide: covered if no marker is in that output AND the probe holding the marker gave
#     output with at least one QZ marker (a tool that reads nothing earns no hide rows).
import json, os, re, sys, zipfile, zlib, io, email, email.policy, collections

rows_path, P, OUT, PREV, report_path = sys.argv[1:6]
rows = json.load(open(rows_path))
TOOLS = ["fc-v2.3.0", "fc-HEAD", "tika", "markitdown"]

FMT_PROBES = {
    "Word .docx": ["docx"], "Email .eml": ["email:.eml"], "Outlook .msg": ["email:.msg"],
    "Word 97 .doc": ["doc"], "Excel 97 .xls": ["xls"], "PowerPoint 97 .ppt": ["ppt"],
    "ODT": ["odf:.odt"], "ODS": ["odf:.ods"], "ODP": ["odf:.odp"], "PDF": ["pdf"],
    "PowerPoint .pptx": ["pptx", "pptx-order"], "RTF": ["rtf"], "HTML": ["html"],
    "Notebook .ipynb": ["ipynb"], "WebVTT": ["vtt"], "SRT": ["srt"], "EPUB": ["epub"],
    "Excel .xlsx": ["xlsx"],
}
PREV_FMT = {"docx": "Word .docx", "odt": "ODT", "ods": "ODS", "odp": "ODP", "xlsx": "Excel .xlsx",
            "pptx": "PowerPoint .pptx", "epub": "EPUB", "eml": "Email .eml", "html": "HTML",
            "rtf": "RTF", "pdf": "PDF"}


def probes_of(fmt):
    out = []
    for spec in FMT_PROBES[fmt]:
        d, _, ext = spec.partition(":")
        if not os.path.isdir(os.path.join(P, d)):
            continue
        for f in sorted(os.listdir(os.path.join(P, d))):
            if f.endswith((".out.txt", ".txt", ".src")) or (ext and not f.endswith(ext)):
                continue
            if os.path.isfile(os.path.join(P, d, f)):
                out.append((d, f))
    return out


def searchable(path):
    """Every place a marker can sit in the probe's bytes, decompressed where we can."""
    b = open(path, "rb").read()
    parts = [b.decode("latin1"), b.decode("utf-16le", "ignore")]
    if b[:2] == b"PK":
        try:
            z = zipfile.ZipFile(io.BytesIO(b))
            for n in z.namelist():
                d = z.read(n)
                parts += [d.decode("utf-8", "ignore"), d.decode("utf-16le", "ignore")]
        except Exception:
            pass
    if b[:4] == b"%PDF":
        for m in re.finditer(rb"stream\r?\n(.*?)endstream", b, re.S):
            try:
                parts.append(zlib.decompress(m.group(1)).decode("latin1"))
            except Exception:
                pass
    if path.endswith(".eml"):
        msg = email.message_from_bytes(b, policy=email.policy.default)
        for k, v in msg.items():
            parts.append(str(v))
        for part in msg.walk():
            try:
                pl = part.get_payload(decode=True)
                if pl:
                    parts.append(pl.decode("utf-8", "ignore"))
                    parts.append(pl.decode("latin1"))
            except Exception:
                pass
    return "\n".join(parts)


def has(text, marker):
    # A marker run straight into the next one (QZTABLEFTQZTABRIGHT) still counts as present.
    return re.search(marker + r"(?!(?!QZ)[A-Z0-9])", text) is not None


RULE = int(os.environ.get("RULE", "1"))


def marker_kinds(r, kind):
    """Rule 2: a row can hold markers with their own ideal, written beside them in the
    map: "QZDDSECOND (show); QZDDFIRST, QZDDTHIRD (hide)", or "QZBKMKNAME (name)" with
    the ideal "name hide, text show". Unannotated markers take the next annotation in
    the same ';' segment, else the row's ideal."""
    words = dict(re.findall(r"(\w+) (show|hide)", r["ideal"].lower()))
    kinds = {}
    for seg in r["marker"].split(";"):
        pending = []
        for tok in re.finditer(r"QZ[A-Z0-9]+|\(([^)]*)\)", seg):
            if tok.group(0).startswith("QZ"):
                pending.append(tok.group(0))
                continue
            note = tok.group(1).lower()
            k = "hide" if note.startswith("hide") else "show" if note.startswith("show") else words.get(note.split()[0] if note.split() else "", None)
            if k:
                for m in pending:
                    kinds[m] = k
                pending = []
        for m in pending:
            kinds.setdefault(m, kind)
    return {m: kinds.get(m, kind) for m in r["markers"]}


def output(tool, d, f):
    p = os.path.join(OUT, tool, d, f + ".out.txt")
    return open(p, encoding="utf-8", errors="replace").read() if os.path.exists(p) else ""


src = {}
for fmt in FMT_PROBES:
    for d, f in probes_of(fmt):
        src[(d, f)] = searchable(os.path.join(P, d, f))

verdicts = {t: {} for t in TOOLS}
unlocated = []
for r in rows:
    if not r["markers"]:
        continue
    ideal = r["ideal"].lower()
    kind = "hide" if ideal.startswith("hide") else "label" if ideal.startswith("label") else "show"
    probes = probes_of(r["fmt"])
    homes = [pf for pf in probes if any(has(src[pf], m) for m in r["markers"])]
    if kind == "hide" and not homes:
        unlocated.append(r["key"])
    kinds = marker_kinds(r, kind) if RULE == 2 else {m: kind for m in r["markers"]}
    for t in TOOLS:
        text = "\n".join(output(t, d, f) for d, f in probes)
        shown = all(has(text, m) for m, k in kinds.items() if k != "hide")
        hidden = not any(has(text, m) for m, k in kinds.items() if k == "hide")
        if "hide" in kinds.values():
            read = any(re.search(r"QZ[A-Z0-9]+", output(t, d, f)) for d, f in (homes or probes))
            hidden = hidden and read
        verdicts[t][r["key"]] = shown and hidden

# prevalence weights: share of real files of the format carrying each row
weights = {}
for fn in os.listdir(PREV):
    if not fn.endswith(".tsv"):
        continue
    fmt = PREV_FMT[fn[:-4]]
    lines = [l.rstrip("\n").split("\t") for l in open(os.path.join(PREV, fn)) if l.strip()]
    n = len(lines)
    c = collections.Counter(i for _, ids in lines for i in ids.split(",") if i)
    weights[fmt] = {f"{fmt}#{i}": k / n for i, k in c.items()}

json.dump({"verdicts": verdicts, "weights": weights, "unlocated_hide": unlocated}, open(report_path, "w"), indent=1)
print("scored rows", len(verdicts["fc-HEAD"]), "unlocated hide rows", len(unlocated))
