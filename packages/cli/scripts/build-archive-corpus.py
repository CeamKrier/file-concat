"""Build archives whose contents are known, so an archive reader can be scored.

An archive reader is right when it hands back every file the archive holds,
under the right path, byte for byte. That needs an answer key, and the only
honest answer key is the set of files the archive was built from. This writes
each variant with Python's own zipfile/tarfile/gzip, which share no code with
any reader under test, and a `manifest.json` mapping each archive to the
`{path, size, sha256}` of every regular file inside it.

The variants are the cases readers disagree on: compression methods past
deflate, zip64, names that are not ASCII with and without the UTF-8 flag, tar
dialects (v7, ustar, GNU long names, pax), empty files, directory entries,
symlinks, a zip nested in a zip, and the compressed tar flavours. 7z comes from
7-Zip itself (the 7z-wasm build the CLI package installs), across its methods
and with solid blocks on and off; that one candidate reads its own writer's
output, every other one does not. rar cannot be written without WinRAR, so it
is not here (see the plan's E7 row).

Usage:
    python3 packages/cli/scripts/build-archive-corpus.py <out dir>
"""

import gzip
import hashlib
import io
import json
import os
import pathlib
import subprocess
import sys
import tarfile
import tempfile
import zipfile

# Fixed contents and a fixed mtime keep every build byte-identical.
MTIME = 1_700_000_000
FILES = {
    "README.md": b"# Archive corpus\n\nKnown contents for reader scoring.\n",
    "src/main.py": b"def main():\n    print('hello')\n" * 40,
    "src/deep/nested/util.ts": b"export const answer = 42;\n",
    "data/table.csv": b"region,q1,q2\nEMEA,1200,1350\nAPAC,980,\n" * 200,
    "empty.txt": b"",
    "binary.bin": bytes(range(256)) * 64,
}
UNICODE = {
    "docs/übersicht.txt": "Grüße aus München\n".encode(),
    "docs/日本語.txt": "こんにちは\n".encode(),
}
LONG = {("a-very-long-directory-name/" * 5) + "file-with-a-long-name.txt": b"long path\n"}


def manifest(files):
    return [
        {"path": p, "size": len(b), "sha256": hashlib.sha256(b).hexdigest()}
        for p, b in sorted(files.items())
    ]


def write_zip(path, files, method=zipfile.ZIP_DEFLATED, zip64=False, dirs=False, comment=b""):
    with zipfile.ZipFile(path, "w", compression=method, allowZip64=True) as z:
        z.comment = comment
        if dirs:
            for d in sorted({p.rsplit("/", 1)[0] + "/" for p in files if "/" in p}):
                z.writestr(zipfile.ZipInfo(d, date_time=(2023, 11, 14, 22, 13, 20)), b"")
        for p, b in files.items():
            info = zipfile.ZipInfo(p, date_time=(2023, 11, 14, 22, 13, 20))
            info.compress_type = method
            with z.open(info, "w", force_zip64=zip64) as f:
                f.write(b)


def write_cp437_zip(path, files):
    """Names in CP437 with the UTF-8 flag clear, as old Windows tools wrote them.

    zipfile always sets the flag for a non-ASCII name, so this stored zip is
    written field by field.
    """
    import struct
    import zlib

    out, central = bytearray(), bytearray()
    for p, b in files.items():
        name, crc, offset = p.encode("cp437"), zlib.crc32(b), len(out)
        out += struct.pack("<IHHHHHIIIHH", 0x04034B50, 20, 0, 0, 0, 0x5B6E, crc, len(b), len(b), len(name), 0)
        out += name + b
        central += struct.pack(
            "<IHHHHHHIIIHHHHHII", 0x02014B50, 20, 20, 0, 0, 0, 0x5B6E, crc, len(b), len(b), len(name), 0, 0, 0, 0, 0, offset
        )
        central += name
    start = len(out)
    out += central
    out += struct.pack("<IHHHHIIH", 0x06054B50, 0, 0, len(files), len(files), len(central), start, 0)
    pathlib.Path(path).write_bytes(bytes(out))


def write_tar(path, files, fmt=tarfile.PAX_FORMAT, mode="w", dirs=False, symlink=False):
    target = {"fileobj": path} if isinstance(path, io.BytesIO) else {"name": path}
    with tarfile.open(mode=mode, format=fmt, **target) as t:
        if dirs:
            for d in sorted({p.rsplit("/", 1)[0] for p in files if "/" in p}):
                info = tarfile.TarInfo(d)
                info.type, info.mode, info.mtime = tarfile.DIRTYPE, 0o755, MTIME
                t.addfile(info)
        for p, b in files.items():
            info = tarfile.TarInfo(p)
            info.size, info.mode, info.mtime = len(b), 0o644, MTIME
            t.addfile(info, io.BytesIO(b))
        if symlink:
            info = tarfile.TarInfo("link-to-readme")
            info.type, info.linkname, info.mtime = tarfile.SYMTYPE, "README.md", MTIME
            t.addfile(info)


SEVENZIP = pathlib.Path(__file__).resolve().parents[1] / "node_modules" / ".bin" / "7z-wasm"


def write_7z(path, files, *switches):
    with tempfile.TemporaryDirectory() as tmp:
        for p, b in files.items():
            f = pathlib.Path(tmp, p)
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_bytes(b)
            os.utime(f, (MTIME, MTIME))
        # 7-Zip stores directory entries with their mtime too.
        for d, _, _ in os.walk(tmp):
            os.utime(d, (MTIME, MTIME))
        pathlib.Path(path).unlink(missing_ok=True)
        # Relative: the CLI mounts the host under /nodefs and chdirs there, so an
        # absolute path lands in its in-memory file system and is lost.
        target = os.path.relpath(path.resolve(), tmp)
        subprocess.run([SEVENZIP, "a", *switches, target, "."], cwd=tmp, check=True, capture_output=True)


def tar_bytes(files, **kw):
    buf = io.BytesIO()
    write_tar(buf, files, **kw)
    return buf.getvalue()


def main(out):
    out = pathlib.Path(out)
    out.mkdir(parents=True, exist_ok=True)
    key = {}

    def build(name, files, writer, *args, **kw):
        writer(out / name, files, *args, **kw)
        key[name] = manifest(files)

    build("zip-deflate.zip", FILES, write_zip)
    build("zip-stored.zip", FILES, write_zip, method=zipfile.ZIP_STORED)
    build("zip-bzip2.zip", FILES, write_zip, method=zipfile.ZIP_BZIP2)
    build("zip-lzma.zip", FILES, write_zip, method=zipfile.ZIP_LZMA)
    build("zip-zip64.zip", FILES, write_zip, zip64=True)
    build("zip-dir-entries.zip", FILES, write_zip, dirs=True, comment=b"archive comment")
    build("zip-utf8-names.zip", UNICODE, write_zip)
    cp437 = {"docs/übersicht.txt": UNICODE["docs/übersicht.txt"], "café.txt": b"cafe\n"}
    build("zip-cp437-names.zip", cp437, write_cp437_zip)
    build("zip-long-path.zip", LONG, write_zip)

    inner = io.BytesIO()
    write_zip(inner, {"inner.txt": b"inside the inner zip\n"})
    nested = {"outer.txt": b"outside\n", "inner.zip": inner.getvalue()}
    build("zip-nested.zip", nested, write_zip)

    build("tar-pax.tar", {**FILES, **UNICODE, **LONG}, write_tar)
    build("tar-gnu.tar", {**FILES, **LONG}, write_tar, fmt=tarfile.GNU_FORMAT)
    build("tar-ustar.tar", FILES, write_tar, fmt=tarfile.USTAR_FORMAT, dirs=True)
    build("tar-symlink.tar", FILES, write_tar, symlink=True)
    # tarfile's own w:gz stamps the gzip header with the wall clock.
    build("tar-gz.tar.gz", FILES, lambda p, f: p.write_bytes(gzip.compress(tar_bytes(f), mtime=MTIME)))
    build("tar-bz2.tar.bz2", FILES, write_tar, mode="w:bz2")
    build("tar-xz.tar.xz", FILES, write_tar, mode="w:xz")

    # v7: no magic, short names only; tarfile writes ustar, so blank the magic.
    v7 = {p: b for p, b in FILES.items() if len(p) < 100}
    data = bytearray(tar_bytes(v7, fmt=tarfile.USTAR_FORMAT))
    for off in range(0, len(data), 512):
        block = data[off : off + 512]
        if block[257:262] == b"ustar":
            block[257:265] = bytes(8)
            block[148:156] = b" " * 8
            block[148:155] = f"{sum(block):06o}\0".encode()
            data[off : off + 512] = block
    (out / "tar-v7.tar").write_bytes(bytes(data))
    key["tar-v7.tar"] = manifest(v7)

    readme = FILES["README.md"]
    (out / "README.md.gz").write_bytes(gzip.compress(readme, mtime=MTIME))
    key["README.md.gz"] = manifest({"README.md": readme})

    if SEVENZIP.exists():
        build("7z-lzma2.7z", FILES, write_7z)
        build("7z-lzma.7z", FILES, write_7z, "-m0=lzma")
        build("7z-ppmd.7z", FILES, write_7z, "-m0=ppmd")
        build("7z-bzip2.7z", FILES, write_7z, "-m0=bzip2")
        build("7z-copy.7z", FILES, write_7z, "-m0=copy")
        build("7z-nonsolid.7z", FILES, write_7z, "-ms=off")
        build("7z-names.7z", {**UNICODE, **LONG}, write_7z)
    else:
        print(f"no 7z: {SEVENZIP} missing, run pnpm install first")

    (out / "manifest.json").write_text(json.dumps(key, indent=2) + "\n")
    print(f"{len(key)} archives in {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "docs/corpora/archives/built")
