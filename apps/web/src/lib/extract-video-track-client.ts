import { createFile, MP4BoxBuffer } from "mp4box";
import { transcriptFromCues } from "@fileconcat/core";

/**
 * A video's own subtitle track, read without decoding a frame (extraction
 * router, D4). When a video carries one, it is the transcript: 12 of 12 exact on
 * each container in the extraction eval, in milliseconds, where speech
 * recognition downloads a model and still gets words wrong. LangChain's YouTube
 * loader takes the caption track first for the same reason.
 *
 * The file is never read whole: a video is gigabytes, and the extract path's
 * `arrayBuffer()` would hold all of it in memory. MP4 has an index (moov) that
 * says where every subtitle sample sits, so only the index and those samples
 * are read. Matroska is read once, front to back, a window at a time.
 */

/** Text from every subtitle track, or "" when the video has none. */
export async function readSubtitleTrack(file: Blob, format: string): Promise<string> {
  const tracks = format === "matroska" ? await matroskaTracks(file) : await mp4Tracks(file);
  const read = tracks
    .map((track) => ({ ...track, text: transcriptFromCues(track.cues) }))
    .filter((track) => track.text);
  if (read.length <= 1) return read[0]?.text ?? "";
  return read.map((track) => `## Subtitles (${track.language || "und"})\n\n${track.text}`).join("\n\n");
}

interface TextTrack {
  language: string;
  cues: string[];
}

const CHUNK = 1 << 20;
/**
 * Bytes fed to mp4box before giving up on finding the index. It skips a whole
 * mdat when the index comes after it, so a normal file never gets near this. A
 * fragmented MP4 indexes its samples in moof boxes spread through the file,
 * which mp4box only reaches by reading on linearly. ponytail: fragmented MP4
 * subtitles are not read; walk the moof headers if such files turn up.
 */
const MP4_READ_LIMIT = 64 * CHUNK;

async function mp4Tracks(file: Blob): Promise<TextTrack[]> {
  const mp4 = createFile();
  let ready = false;
  mp4.onReady = () => {
    ready = true;
  };
  let read = 0;
  for (let at = 0; !ready && at < file.size && read < MP4_READ_LIMIT; ) {
    const chunk = await file.slice(at, at + CHUNK).arrayBuffer();
    read += chunk.byteLength;
    // appendBuffer answers with the next offset it wants, past an mdat it can skip.
    at = mp4.appendBuffer(MP4BoxBuffer.fromArrayBuffer(chunk, at));
  }
  if (!ready) return [];

  const tracks: TextTrack[] = [];
  for (const track of mp4.getInfo().tracks) {
    const decode = MP4_TEXT[track.codec.split(".")[0]];
    if (!decode) continue;
    const cues: string[] = [];
    for (const sample of mp4.getTrackSamplesInfo(track.id)) {
      const bytes = new Uint8Array(await file.slice(sample.offset, sample.offset + sample.size).arrayBuffer());
      const text = decode(bytes);
      if (text) cues.push(text);
    }
    tracks.push({ language: track.language, cues });
  }
  return tracks;
}

/**
 * Sample payload to cue text. tx3g (QuickTime text, ffmpeg's mov_text) is a
 * 16-bit length and UTF-8. wvtt (WebVTT in MP4) holds `vttc` boxes with the cue
 * text in a `payl` child. ponytail: stpp (TTML) and CEA-608 are not read.
 */
const MP4_TEXT: Record<string, (bytes: Uint8Array) => string> = {
  tx3g: (bytes) => (bytes.length < 2 ? "" : utf8(bytes.subarray(2, 2 + ((bytes[0] << 8) | bytes[1])))),
  wvtt: (bytes) => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const texts: string[] = [];
    const walk = (start: number, end: number) => {
      for (let at = start; at + 8 <= end; ) {
        const size = view.getUint32(at);
        if (size < 8) return;
        const type = utf8(bytes.subarray(at + 4, at + 8));
        if (type === "vttc") walk(at + 8, at + size);
        else if (type === "payl") texts.push(utf8(bytes.subarray(at + 8, at + size)));
        at += size;
      }
    };
    walk(0, bytes.length);
    return texts.join("\n");
  },
};

const utf8 = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** How much of a Matroska file is held at once. */
const WINDOW = 16 * CHUNK;

/**
 * Matroska and WebM: one pass over the EBML elements, reading each element's
 * header and keeping only blocks on a text subtitle track. A video or audio
 * block is skipped by its size, but the blocks sit side by side, so a file
 * with a text track is read nearly whole: at disk speed, a window at a time.
 *
 * Containers are entered rather than recursed into, so a live-written file
 * whose Segment and Clusters have unknown size (MediaRecorder) reads like any
 * other. ponytail: both muxers cue every subtitle block, so Cues could take a
 * file with an index straight to its blocks; add that when big MKV drops show.
 */
async function matroskaTracks(file: Blob): Promise<TextTrack[]> {
  let windowStart = 0;
  let window = new Uint8Array(0);
  const bytes = async (at: number, length: number): Promise<Uint8Array> => {
    if (at < windowStart || at + length > windowStart + window.length) {
      windowStart = at;
      window = new Uint8Array(await file.slice(at, at + Math.max(WINDOW, length)).arrayBuffer());
    }
    return window.subarray(at - windowStart, at - windowStart + length);
  };
  const vint = (head: Uint8Array, at: number, keepMarker: boolean): [number, number] => {
    const first = head[at];
    let length = 1;
    while (length <= 8 && !(first & (0x80 >> (length - 1)))) length++;
    let value = keepMarker ? first : first & (0xff >> length);
    for (let i = 1; i < length; i++) value = value * 256 + head[at + i];
    return [value, length];
  };

  const tracks = new Map<number, TextTrack & { codec: string }>();
  for (let at = 0; at < file.size; ) {
    const head = await bytes(at, Math.min(16, file.size - at));
    if (head.length < 2 || head[0] === 0) break;
    const [id, idLength] = vint(head, 0, true);
    const [size, sizeLength] = vint(head, idLength, false);
    const body = at + idLength + sizeLength;
    const unknown = size === 2 ** (7 * sizeLength) - 1;
    // Tracks comes before the first Cluster: a video with no text track ends
    // here, after its header, however large it is.
    if (id === CLUSTER && tracks.size === 0) break;
    if (CONTAINERS.has(id)) {
      at = body;
      continue;
    }
    if (unknown) break;
    if (id === TRACK_ENTRY) {
      const track = trackEntry(await bytes(body, size), vint);
      if (track.type === 0x11 && TEXT_CODEC.test(track.codec)) {
        tracks.set(track.number, { language: track.language, codec: track.codec, cues: [] });
      }
    } else if ((id === SIMPLE_BLOCK || id === BLOCK) && tracks.size > 0) {
      const [number, numberLength] = vint(await bytes(body, 8), 0, false);
      const track = tracks.get(number);
      const payload = body + numberLength + 3;
      if (track && payload < body + size) {
        const text = utf8(await bytes(payload, body + size - payload));
        track.cues.push(/^S_TEXT\/(ASS|SSA)/.test(track.codec) ? assText(text) : text);
      }
    }
    at = body + size;
  }
  return [...tracks.values()];
}

/** Segment, Tracks, Cluster, BlockGroup: walked into, never read whole. */
const CLUSTER = 0x1f43b675;
const CONTAINERS = new Set([0x18538067, 0x1654ae6b, CLUSTER, 0xa0]);
const TRACK_ENTRY = 0xae;
const SIMPLE_BLOCK = 0xa3;
const BLOCK = 0xa1;
/** Text codecs only: a VobSub or PGS track is pictures of words. */
const TEXT_CODEC = /^(S_TEXT\/|D_WEBVTT\/)/;

function trackEntry(entry: Uint8Array, vint: (head: Uint8Array, at: number, keepMarker: boolean) => [number, number]) {
  const track = { number: 0, type: 0, codec: "", language: "" };
  for (let at = 0; at < entry.length; ) {
    const [id, idLength] = vint(entry, at, true);
    const [size, sizeLength] = vint(entry, at + idLength, false);
    const value = entry.subarray(at + idLength + sizeLength, at + idLength + sizeLength + size);
    if (id === 0xd7) track.number = value.reduce((n, b) => n * 256 + b, 0);
    else if (id === 0x83) track.type = value[0];
    else if (id === 0x86) track.codec = utf8(value);
    else if (id === 0x22b59c || id === 0x22b59d) track.language ||= utf8(value).replace(/\0+$/, "");
    at += idLength + sizeLength + size;
  }
  return track;
}

/**
 * An ASS/SSA block is `ReadOrder, Layer, Style, Name, MarginL, MarginR,
 * MarginV, Effect, Text`; the text may hold commas, and `\N` is its line break.
 */
function assText(block: string): string {
  return block.split(",").slice(8).join(",").replace(/\\[Nn]/g, "\n");
}
