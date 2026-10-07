"""Build videos whose speech, subtitle track and on-screen text are all known.

Each video concatenates consecutive utterances from `build-asr-corpus.py`'s sets
(known transcripts and durations, so the subtitle cues are exact), over slides of
Project Gutenberg paragraphs drawn with drawtext (known on-screen text). Every
video is written in five variants so a reader can be scored per path:

  mp4-sub     h264 + aac + mov_text track
  mkv-sub     h264 + opus + srt track
  webm-sub    vp9 + opus + webvtt track
  mp4-nosub   h264 + aac, no track (speech only reachable by ASR)
  mp4-hardsub h264 + aac, subtitles burned into the picture, no track

Answer key `<out>/manifest.json`: {"<variant>/<name>.<ext>": {"speech", "slides",
"lang", "seconds", "track"}}. A fixed seed, so a rerun writes the same files.
ffmpeg here is a local corpus tool, never shipped.

Usage:
  python packages/cli/scripts/build-video-corpus.py <asr_dir> <gutenberg_dir> <out_dir> [videos]
"""

import glob
import json
import os
import random
import subprocess
import sys
import tempfile
import textwrap

asr_dir, pg_dir, out = sys.argv[1:4]
videos = int(sys.argv[4]) if len(sys.argv) > 4 else 12
manifest_in = json.load(open(os.path.join(asr_dir, "manifest.json")))
rng = random.Random(0)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
SLIDE_SECONDS = 8
GAP = 0.4

paragraphs = []
for path in sorted(glob.glob(os.path.join(pg_dir, "*.txt"))):
    body = open(path, encoding="utf-8", errors="replace").read()
    for p in body.split("\n\n")[200:]:
        words = p.split()
        if 20 <= len(words) <= 40:
            paragraphs.append(" ".join(words))
rng.shuffle(paragraphs)


def ts(sec, sep):
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h):02d}:{int(m):02d}:{s:06.3f}".replace(".", sep)


def run(*args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


# Two Turkish videos, the rest English (clean and other read speech, FLEURS).
sources = ["fleurs-tr_tr"] * 2 + ["librispeech_asr-clean", "librispeech_asr-other", "fleurs-en_us"] * 4
manifest = {}
with tempfile.TemporaryDirectory() as tmp:
    for v in range(videos):
        set_name = sources[v]
        pool = sorted(k for k in manifest_in if k.startswith(set_name + "/"))
        start = rng.randrange(0, len(pool) - 8)
        utts = pool[start : start + 8]
        lang = manifest_in[utts[0]]["lang"]
        # Speech track and exact cues.
        concat, cues, t = [], [], 0.0
        run("-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", str(GAP), os.path.join(tmp, "gap.wav"))
        for i, u in enumerate(utts):
            sec = manifest_in[u]["seconds"]
            cues.append((t, t + sec, manifest_in[u]["text"].strip()))
            # Same codec on both sides of the concat demuxer: every piece as 16 kHz mono PCM.
            run("-i", os.path.join(asr_dir, u), "-ar", "16000", "-ac", "1", os.path.join(tmp, f"u{i}.wav"))
            concat.append(f"file '{os.path.join(tmp, f'u{i}.wav')}'")
            concat.append(f"file '{os.path.abspath(os.path.join(tmp, 'gap.wav'))}'")
            t += sec + GAP
        duration = t
        open(os.path.join(tmp, "list.txt"), "w").write("\n".join(concat))
        speech = os.path.join(tmp, "speech.wav")
        run("-f", "concat", "-safe", "0", "-i", os.path.join(tmp, "list.txt"), "-ar", "16000", "-ac", "1", speech)
        srt = os.path.join(tmp, "subs.srt")
        with open(srt, "w", encoding="utf-8") as f:
            for i, (a, b, text) in enumerate(cues, 1):
                f.write(f"{i}\n{ts(a, ',')} --> {ts(b, ',')}\n{text}\n\n")
        # Slides: one Gutenberg paragraph per SLIDE_SECONDS, wrapped, drawn from text files.
        slides, draws = [], []
        for i in range(int(duration // SLIDE_SECONDS) + 1):
            text = paragraphs.pop()
            slides.append(text)
            tf = os.path.join(tmp, f"slide{i}.txt")
            open(tf, "w", encoding="utf-8").write(textwrap.fill(text, 42))
            a, b = i * SLIDE_SECONDS, (i + 1) * SLIDE_SECONDS
            draws.append(
                f"drawtext=fontfile={FONT}:textfile={tf}:fontsize=40:fontcolor=white:line_spacing=12"
                f":x=80:y=120:enable='gte(t,{a})*lt(t,{b})'"
            )
        picture = f"color=c=0x1e2a3a:s=1280x720:r=10:d={duration:.2f}," + ",".join(draws)
        name = f"v{v:02d}-{lang}"
        base = os.path.join(tmp, "base.mp4")
        run("-f", "lavfi", "-i", picture, "-i", speech, "-c:v", "libx264", "-tune", "stillimage", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "64k", "-shortest", base)
        variants = {
            "mp4-sub/" + name + ".mp4": ["-i", base, "-i", srt, "-map", "0", "-map", "1", "-c:v", "copy", "-c:a", "copy", "-c:s", "mov_text"],
            "mkv-sub/" + name + ".mkv": ["-i", base, "-i", srt, "-map", "0", "-map", "1", "-c:v", "copy", "-c:a", "libopus", "-c:s", "srt"],
            "webm-sub/" + name + ".webm": ["-i", base, "-i", srt, "-map", "0", "-map", "1", "-c:v", "libvpx-vp9", "-deadline", "realtime",
                                            "-cpu-used", "8", "-b:v", "300k", "-c:a", "libopus", "-c:s", "webvtt"],
            "mp4-nosub/" + name + ".mp4": ["-i", base, "-c", "copy"],
            "mp4-hardsub/" + name + ".mp4": ["-i", base, "-vf", f"subtitles={srt}:force_style='FontSize=22'", "-c:v", "libx264",
                                              "-tune", "stillimage", "-c:a", "copy"],
        }
        for fixture, args in variants.items():
            os.makedirs(os.path.join(out, os.path.dirname(fixture)), exist_ok=True)
            run(*args, os.path.join(out, fixture))
            manifest[fixture] = {
                "speech": " ".join(c[2] for c in cues),
                "slides": slides,
                "lang": lang,
                "seconds": round(duration, 2),
                "track": fixture.split("/")[0].endswith("-sub"),
                "burned": fixture.startswith("mp4-hardsub"),
            }
        print(fixture.split("/")[1], set_name, f"{duration:.1f}s", len(slides), "slides")

with open(os.path.join(out, "manifest.json"), "w") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=1)
