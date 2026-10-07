"""Write a speech corpus with known transcripts from Hugging Face parquet test splits.

Reads `<asr_dir>/parquet/*.parquet` (LibriSpeech test-clean and test-other,
FLEURS en_us and tr_tr, TED-LIUM long-form; all from datasets-server's parquet
export, URLs in `parquet/urls.txt`), samples a fixed number of utterances per
set with a fixed seed (every long-form talk is kept), writes each audio file as
stored (flac or wav) to `<asr_dir>/<set>/` and the answer key to
`<asr_dir>/manifest.json`: {"<set>/<file>": {"text", "lang", "seconds"}}.
Rerunning writes the same files.

Usage:
  python packages/cli/scripts/build-asr-corpus.py <asr_dir> [per_set]
"""

import glob
import io
import json
import os
import random
import sys

import pyarrow.parquet as pq
import soundfile

root = sys.argv[1]
per_set = int(sys.argv[2]) if len(sys.argv) > 2 else 150
# raw_transcription is FLEURS' cased, punctuated text; the normalizer evens it out.
TEXT_COLUMNS = ["raw_transcription", "text", "transcription"]

manifest = {}
for path in sorted(glob.glob(os.path.join(root, "parquet", "*.parquet"))):
    name = os.path.basename(path)
    table = pq.read_table(path)
    print(name, table.num_rows, table.schema.names)
    audio_col = next(n for n in table.schema.names if n == "audio")
    text_col = next(n for n in TEXT_COLUMNS if n in table.schema.names)
    set_name = name.split("-test")[0]
    lang = "tr" if "tr_tr" in name else "en"
    rows = list(range(table.num_rows))
    if "long-form" not in name and len(rows) > per_set:
        rows = sorted(random.Random(0).sample(rows, per_set))
    os.makedirs(os.path.join(root, set_name), exist_ok=True)
    audio, text = table.column(audio_col), table.column(text_col)
    for i in rows:
        data = audio[i].as_py()["bytes"]
        ext = "flac" if data[:4] == b"fLaC" else "wav" if data[:4] == b"RIFF" else "bin"
        info = soundfile.info(io.BytesIO(data))
        fixture = f"{set_name}/{i:05d}.{ext}"
        with open(os.path.join(root, fixture), "wb") as f:
            f.write(data)
        manifest[fixture] = {"text": text[i].as_py(), "lang": lang, "seconds": round(info.frames / info.samplerate, 2)}

with open(os.path.join(root, "manifest.json"), "w") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=1)
by_set = {}
for fixture, row in manifest.items():
    s = by_set.setdefault(fixture.split("/")[0], [0, 0.0])
    s[0] += 1
    s[1] += row["seconds"]
for s, (n, sec) in by_set.items():
    print(f"{s}: {n} files, {sec / 60:.1f} min")
