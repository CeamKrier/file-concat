import { BlobSource, CanvasSink, Input, MATROSKA, MP4, QTFF, WEBM } from "mediabunny";
import { MAX_SPEECH_SECONDS, timestamp, type TimedLine } from "./extract-speech-client";
import { SpeechTooLongError } from "./ocr";
import { newLines, sceneTimes } from "./video-scenes";

/**
 * On-screen text in a video (extraction router, D6): slides, captions burned
 * into the picture, a terminal in a screen recording. Client-only, reached with
 * speech through the guarded dynamic import in ./ocr, so offered, never
 * automatic (ADR-0017).
 *
 * Frames come from Mediabunny over WebCodecs. Its sorted pass decodes each
 * packet once, where seeking a video element decodes again from the keyframe
 * on every seek; it reads mp4, mov, mkv and webm, and reads the file in slices,
 * so a 1 GB video is never held whole. Which frames to read is ./video-scenes.
 */

/** A guess: about 1 s of recognition per frame puts 200 at a few minutes. */
const MAX_FRAMES = 200;
/** As for an image: recognition gains nothing past roughly 300 DPI. */
const MAX_SIDE = 2000;

function open(file: File): Input {
  return new Input({ source: new BlobSource(file), formats: [MP4, QTFF, MATROSKA, WEBM] });
}

/** Which tracks a video container holds, so a silent screen recording skips
 * speech and an m4a skips frames. A file Mediabunny cannot parse is left to
 * speech alone, which is what reading it meant before frames were read. */
export async function mediaTracks(file: File): Promise<{ audio: boolean; video: boolean }> {
  try {
    const input = open(file);
    const [audio, video] = await Promise.all([input.getPrimaryAudioTrack(), input.getPrimaryVideoTrack()]);
    return { audio: audio !== null, video: video !== null && (await video.canDecode()) };
  } catch {
    return { audio: true, video: false };
  }
}

/** The RGB of a 64x64 canvas; alpha is always opaque and would dilute the
 * differences the floor in ./video-scenes was measured on. */
function rgb(canvas: HTMLCanvasElement | OffscreenCanvas): Uint8ClampedArray {
  const rgba = (canvas.getContext("2d") as CanvasRenderingContext2D).getImageData(0, 0, 64, 64).data;
  const out = new Uint8ClampedArray(64 * 64 * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4) {
    out[j++] = rgba[i];
    out[j++] = rgba[i + 1];
    out[j++] = rgba[i + 2];
  }
  return out;
}

function toBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob | null> {
  return "convertToBlob" in canvas ? canvas.convertToBlob() : new Promise((resolve) => canvas.toBlob(resolve));
}

/** The text on screen, one `[frame m:ss]` block per scene that showed
 * something the scene before it did not. */
export async function readFrames(
  file: File,
  language: string,
  signal?: AbortSignal,
  onNote?: (note: string) => void,
): Promise<TimedLine[]> {
  const input = open(file);
  const track = await input.getPrimaryVideoTrack();
  if (!track || !(await track.canDecode())) return [];
  const seconds = await input.computeDuration();
  if (seconds > MAX_SPEECH_SECONDS) throw new SpeechTooLongError("over 60 minutes");
  const end = timestamp(seconds).slice(1, -1);

  const thumbs: Uint8ClampedArray[] = [];
  const small = new CanvasSink(track, { width: 64, height: 64, fit: "fill", poolSize: 1 });
  const everySecond = Array.from({ length: Math.floor(seconds) + 1 }, (_, s) => s);
  for await (const frame of small.canvasesAtTimestamps(everySecond)) {
    signal?.throwIfAborted();
    // A timestamp past the last frame comes back null; the scan simply ends.
    if (!frame) break;
    if (thumbs.length % 10 === 0) onNote?.(`Looking for scene changes at ${timestamp(thumbs.length).slice(1, -1)} of ${end}`);
    thumbs.push(rgb(frame.canvas));
  }

  let times = sceneTimes(thumbs);
  // ponytail: evenly spaced past the cap, so a cut-heavy video is sampled end to
  // end rather than read for its first minutes; rank by cut size if that misses.
  if (times.length > MAX_FRAMES) times = Array.from({ length: MAX_FRAMES }, (_, k) => times[Math.floor((k * times.length) / MAX_FRAMES)]);

  const [width, height] = await Promise.all([track.getDisplayWidth(), track.getDisplayHeight()]);
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const full = new CanvasSink(track, {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    fit: "fill",
  });
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(language);
  const readings: string[] = [];
  try {
    for await (const frame of full.canvasesAtTimestamps(times)) {
      signal?.throwIfAborted();
      onNote?.(`Reading frame ${readings.length + 1} of ${times.length}`);
      const image = frame && (await toBlob(frame.canvas));
      readings.push(image ? (await worker.recognize(image)).data.text.trim() : "");
    }
  } finally {
    await worker.terminate();
  }
  return newLines(readings).flatMap((text, i) =>
    text ? [{ at: times[i], text: `[frame ${timestamp(times[i]).slice(1, -1)}]\n${text}` }] : [],
  );
}
