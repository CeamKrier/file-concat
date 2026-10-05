import { MAX_SPEECH_BYTES, SpeechTooLongError } from "./ocr";
import type { SpeechRequest } from "./speech.worker";

/**
 * Speech to text for audio and for video with no subtitle track (extraction
 * router, D5). Client-only, reached through the guarded dynamic import in
 * ./speech. Offered, never automatic, as images are (ADR-0017): the first run
 * downloads a model of 66 MB (English) or 244 MB (any other language).
 *
 * The models are the extraction eval's picks, measured on a GPU-less laptop:
 * Moonshine base for English (4.2 WER on long talks, real-time factor 0.076 on
 * one wasm thread) and Whisper small for the rest (18.3 WER on Turkish, 0.466).
 */

const RATE = 16000;

/**
 * A file is decoded whole, so this and `MAX_SPEECH_BYTES` bound the memory a
 * pass can take. Both are guesses: 60 minutes of stereo 48 kHz is about 1.4 GB
 * decoded before it is resampled. Bounded decoding (WebCodecs per packet) is
 * what lifts them.
 */
export const MAX_SPEECH_SECONDS = 60 * 60;

/** The model a language is read with. English has its own, smaller and better. */
export function speechModelFor(locale: string): { model: string; language?: string } {
  const primary = locale.toLowerCase().split("-")[0];
  return primary === "en"
    ? { model: "onnx-community/moonshine-base-ONNX" }
    : { model: "onnx-community/whisper-small", language: primary };
}

/**
 * Cut points no more than 30 s apart, each at the quietest 50 ms between 20 and
 * 30 s into its piece, so a word is rarely split. Both models read one piece at
 * a time: Moonshine has no windowing of its own, and Whisper's computes every
 * window's features before reading the first.
 */
export function quietCuts(audio: Float32Array): Float32Array[] {
  const FRAME = RATE / 20;
  const pieces: Float32Array[] = [];
  let start = 0;
  while (audio.length - start > 30 * RATE) {
    let best = start + 30 * RATE;
    let quietest = Infinity;
    for (let at = start + 20 * RATE; at + FRAME <= start + 30 * RATE; at += FRAME) {
      let energy = 0;
      for (let i = at; i < at + FRAME; i++) energy += audio[i] * audio[i];
      if (energy < quietest) {
        quietest = energy;
        best = at + FRAME / 2;
      }
    }
    pieces.push(audio.subarray(start, best));
    start = best;
  }
  pieces.push(audio.subarray(start));
  return pieces;
}

/** `[m:ss]`, or `[h:mm:ss]` past the hour. */
export function timestamp(seconds: number): string {
  const s = Math.floor(seconds);
  const two = (n: number) => String(n).padStart(2, "0");
  return s >= 3600
    ? `[${Math.floor(s / 3600)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}]`
    : `[${Math.floor(s / 60)}:${two(s % 60)}]`;
}

/** Duration from the container's own header, before a byte of it is decoded. */
function mediaSeconds(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  const element = document.createElement("audio");
  return new Promise<number>((resolve, reject) => {
    element.onloadedmetadata = () => resolve(element.duration);
    element.onerror = () => reject(new Error("the browser cannot play this file"));
    element.preload = "metadata";
    element.src = url;
  }).finally(() => {
    element.removeAttribute("src");
    URL.revokeObjectURL(url);
  });
}

async function decode(file: File): Promise<Float32Array> {
  const decoded = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(await file.arrayBuffer());
  if (decoded.numberOfChannels === 1) return decoded.getChannelData(0);
  const mono = new Float32Array(decoded.length);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const channel = decoded.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / decoded.numberOfChannels;
  }
  return mono;
}

let worker: Worker | null = null;

/**
 * One file, transcribed. `onNote` carries the model download and then the
 * position reached, since a pass over an hour of audio runs for minutes. A stop
 * terminates the worker, which is the only way to end a piece mid-way; the
 * model is cached, so the next pass reloads it from disk.
 */
export async function transcribe(
  file: File,
  locale: string,
  signal?: AbortSignal,
  onNote?: (note: string) => void,
): Promise<string> {
  if (file.size > MAX_SPEECH_BYTES) throw new SpeechTooLongError("over 1 GB");
  const seconds = await mediaSeconds(file);
  if (seconds > MAX_SPEECH_SECONDS) throw new SpeechTooLongError("over 60 minutes");
  const pieces = quietCuts(await decode(file));
  const { model, language } = speechModelFor(locale);

  worker ??= new Worker(new URL("./speech.worker.ts", import.meta.url), { type: "module" });
  const current = worker;
  const stop = () => {
    current.terminate();
    if (worker === current) worker = null;
  };
  // Download progress arrives per file; the note shows the sum over all of them.
  const downloads = new Map<string, { loaded: number; total: number }>();
  const send = (request: SpeechRequest) =>
    new Promise<string>((resolve, reject) => {
      const onAbort = () => {
        stop();
        reject(new DOMException("Stopped", "AbortError"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      const settle = () => signal?.removeEventListener("abort", onAbort);
      current.onmessage = ({ data }) => {
        if (data.progress) {
          downloads.set(data.progress.file, data.progress);
          const sum = [...downloads.values()].reduce((a, d) => ({ loaded: a.loaded + d.loaded, total: a.total + d.total }), {
            loaded: 0,
            total: 0,
          });
          // Sizes arrive with each file's first chunk; until then there is no sum.
          if (sum.total > 0) {
            onNote?.(`Downloading the speech model, ${Math.round(sum.loaded / 1e6)} of ${Math.round(sum.total / 1e6)} MB`);
          }
          return;
        }
        settle();
        if (data.error !== undefined) {
          stop();
          reject(new Error(data.error));
        } else resolve(data.result);
      };
      current.onerror = (event) => {
        settle();
        stop();
        reject(new Error(event.message || "speech worker failed"));
      };
      current.postMessage(request);
    });

  const lines: string[] = [];
  let at = 0;
  for (const piece of pieces) {
    signal?.throwIfAborted();
    onNote?.(`Listening at ${timestamp(at / RATE).slice(1, -1)} of ${timestamp(seconds).slice(1, -1)}`);
    // A copy, not the view: the decoded whole stays here, the piece is transferred.
    const audio = piece.slice();
    const text = await send({ model, audio, language });
    if (text) lines.push(`${timestamp(at / RATE)} ${text}`);
    at += piece.length;
  }
  return lines.join("\n");
}
