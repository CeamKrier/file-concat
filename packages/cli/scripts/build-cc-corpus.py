"""Sample real documents from a Common Crawl crawl, one directory per format.

The coverage map scores one hand-built probe per spec construct, which says a
construct is read, not how often real files carry it or how real writers
encode it. This draws the real files: documents people published on the web,
the public stand-in Apache Tika's regression corpus also uses (its
"commoncrawl3" set). Our users' private files are not on the web, so this is
a proxy for them, not a sample of them.

The crawl's columnar index (one parquet table per crawl, read over HTTPS with
DuckDB) picks records by the crawler's detected MIME type; each record is then
fetched by byte range from its WARC file. A record the crawler cut short
(`content_truncated`) is skipped, which leaves out the largest files. At most
two files are kept per registered domain so one site cannot fill a format, and
byte-identical files are kept once. The draw is seeded, so a rerun picks the
same files while the crawl stays online.

Only a seeded share of the index is read (`--parts`, of about 300 parquet
parts a crawl): the columns a fetch needs cost about 150 MB a part, so the
whole index is some 45 GB. Each part is a slice of the crawl's URL order, so
the rare formats (pptx, xlsx, rtf, epub: about one a part) come out small;
the summary prints the count per format.

Needs DuckDB (`pip install duckdb`, kept out of the workspace on purpose).

Usage:
    python3 packages/cli/scripts/build-cc-corpus.py <out dir> [--crawl CC-MAIN-2026-34] [--parts 60] [--per-format 200]
Writes <out dir>/<format>/<sha8>.<ext> and <out dir>/manifest.tsv.
"""

import argparse
import concurrent.futures
import gzip
import hashlib
import io
import pathlib
import random
import time
import urllib.request

import duckdb

BASE = "https://data.commoncrawl.org/"
FORMATS = {
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/rtf": "rtf",
    "text/rtf": "rtf",
    "application/vnd.oasis.opendocument.text": "odt",
    "application/vnd.oasis.opendocument.spreadsheet": "ods",
    "application/vnd.oasis.opendocument.presentation": "odp",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/epub+zip": "epub",
    "message/rfc822": "eml",
    "application/vnd.ms-outlook": "msg",
    "text/vtt": "vtt",
}
# HTML is a few hundred thousand records a part; a hash slice keeps the scan small.
HTML_SLICE = 4000


def get(url: str, headers: dict | None = None, tries: int = 5) -> bytes:
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "fileconcat-corpus/1", **(headers or {})})
            return urllib.request.urlopen(req, timeout=180).read()
        except Exception:
            if attempt == tries - 1:
                raise
            time.sleep(2 ** attempt * 3)
    raise AssertionError


def index_rows(crawl: str, part: str) -> list[tuple]:
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    mimes = ",".join(f"'{m}'" for m in FORMATS)
    sql = f"""
      select content_mime_detected, url, url_host_registered_domain,
             warc_filename, warc_record_offset, warc_record_length
      from read_parquet('{BASE}{part}')
      where fetch_status = 200 and content_truncated is null
        and (content_mime_detected in ({mimes})
             or (content_mime_detected = 'text/html' and hash(url) % {HTML_SLICE} = 0))"""
    for attempt in range(5):
        try:
            return con.execute(sql).fetchall()
        except Exception:
            if attempt == 4:
                raise
            time.sleep(2 ** attempt * 3)
    return []


def body_of(record: bytes) -> bytes:
    raw = gzip.decompress(record)
    _, _, rest = raw.partition(b"\r\n\r\n")  # WARC headers
    _, _, body = rest.partition(b"\r\n\r\n")  # HTTP headers
    return body


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--crawl", default="CC-MAIN-2026-34")
    ap.add_argument("--parts", type=int, default=60)
    ap.add_argument("--per-format", type=int, default=200)
    ap.add_argument("--seed", type=int, default=20261016)
    args = ap.parse_args()
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    listing = gzip.decompress(get(f"{BASE}crawl-data/{args.crawl}/cc-index-table.paths.gz")).decode().split()
    parts = sorted(p for p in listing if "/subset=warc/" in p)
    rng = random.Random(args.seed)
    parts = rng.sample(parts, min(args.parts, len(parts)))
    cache = out / "index.tsv"
    if cache.exists():
        rows = [tuple(line.split("\t")) for line in cache.read_text().splitlines()]
    else:
        rows = []
        with concurrent.futures.ThreadPoolExecutor(8) as pool:
            for n, got in enumerate(pool.map(lambda p: index_rows(args.crawl, p), parts), 1):
                rows.extend(got)
                print(f"index {n}/{len(parts)}: {len(rows)} rows", flush=True)
        cache.write_text("".join("\t".join(str(c) for c in r) + "\n" for r in rows))

    rng.shuffle(rows)
    picked: dict[str, list[tuple]] = {}
    per_domain: dict[tuple[str, str], int] = {}
    for row in rows:
        mime, domain = row[0], row[2]
        fmt = "html" if mime == "text/html" else FORMATS[mime]
        if len(picked.get(fmt, [])) >= args.per_format or per_domain.get((fmt, domain), 0) >= 2:
            continue
        per_domain[(fmt, domain)] = per_domain.get((fmt, domain), 0) + 1
        picked.setdefault(fmt, []).append(row)

    def fetch(item: tuple[str, tuple]) -> str | None:
        fmt, (_, url, _, warc, offset, length) = item
        start = int(offset)
        try:
            body = body_of(get(BASE + warc, {"Range": f"bytes={start}-{start + int(length) - 1}"}))
        except Exception as err:
            print(f"skip {url}: {err}", flush=True)
            return None
        if not body:
            return None
        sha = hashlib.sha256(body).hexdigest()
        name = f"{fmt}/{sha[:8]}.{fmt}"
        if (out / name).exists():
            return None
        (out / fmt).mkdir(exist_ok=True)
        (out / name).write_bytes(body)
        return "\t".join([name, sha, str(len(body)), url, warc])

    items = [(fmt, row) for fmt, group in sorted(picked.items()) for row in group]
    with concurrent.futures.ThreadPoolExecutor(4) as pool:
        lines = [line for line in pool.map(fetch, items) if line]
    (out / "manifest.tsv").write_text("file\tsha256\tbytes\turl\twarc\n" + "\n".join(sorted(lines)) + "\n")
    for fmt, group in sorted(picked.items()):
        print(f"{fmt}: {sum(1 for line in lines if line.startswith(fmt + '/'))} of {len(group)} picked")


if __name__ == "__main__":
    main()
