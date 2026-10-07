/**
 * Which frames of a video to read for on-screen text (extraction router, D6),
 * and what to keep of their readings. Pure, so it is tested without a decoder.
 *
 * Docling's scene sampler (`video_frame_sampling.py`): 1 fps 64x64 thumbnails,
 * mean absolute difference between neighbours, peaks of that series with
 * scipy's prominence above max(floor, median + 5 MAD) and at least 2 s apart,
 * one frame from the middle of each scene. The floor is 0.003, not Docling's
 * 0.012: a new paragraph on the same slide background differs by 0.0106-0.0116,
 * and at 0.012 19 of 127 slide changes were lost. Measured in the extraction
 * eval on 127 slides: F1 0.839 with 125 frames read, against 0.806 for reading
 * every second (963 frames).
 */

const FLOOR = 0.003;
/** Seconds between two cuts, Docling's `distance`. */
const MIN_SCENE = 2;

/** Mean absolute difference of each thumbnail from the one before, 0..1. */
export function thumbnailDiffs(thumbs: readonly Uint8ClampedArray[]): number[] {
  const diffs: number[] = [];
  for (let i = 1; i < thumbs.length; i++) {
    const [a, b] = [thumbs[i - 1], thumbs[i]];
    let sum = 0;
    for (let j = 0; j < a.length; j++) sum += Math.abs(a[j] - b[j]);
    diffs.push(sum / a.length / 255);
  }
  return diffs;
}

/**
 * scipy.signal.find_peaks(x, prominence, distance) as Docling calls it: strict
 * local maxima, prominence over the higher of the two lowest points before a
 * taller value on either side, then the tallest kept first and any other within
 * `distance` dropped.
 */
export function scenePeaks(x: readonly number[], floor = FLOOR, distance = MIN_SCENE): number[] {
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
  const m = median([...x]);
  const mad = median(x.map((v) => Math.abs(v - m)));
  const threshold = Math.max(floor, m + 5 * 1.4826 * mad);
  const peaks: number[] = [];
  for (let i = 1; i < x.length - 1; i++) {
    if (!(x[i] > x[i - 1] && x[i] > x[i + 1])) continue;
    let left = x[i];
    let right = x[i];
    for (let j = i - 1; j >= 0 && x[j] <= x[i]; j--) left = Math.min(left, x[j]);
    for (let j = i + 1; j < x.length && x[j] <= x[i]; j++) right = Math.min(right, x[j]);
    if (x[i] - Math.max(left, right) >= threshold) peaks.push(i);
  }
  const kept: number[] = [];
  for (const p of peaks.sort((a, b) => x[b] - x[a])) {
    if (kept.every((k) => Math.abs(k - p) >= distance)) kept.push(p);
  }
  return kept.sort((a, b) => a - b);
}

/**
 * The second to read in each scene, given one thumbnail per second. Diff `i`
 * compares second `i + 1` with second `i`, so a peak there starts a scene at
 * `i + 1`.
 */
export function sceneTimes(thumbs: readonly Uint8ClampedArray[]): number[] {
  if (thumbs.length === 0) return [];
  const last = thumbs.length - 1;
  const starts = [0, ...scenePeaks(thumbnailDiffs(thumbs)).map((p) => p + 1).filter((s) => s >= MIN_SCENE)];
  return starts.map((start, i) => (start + (starts[i + 1] ?? last)) / 2);
}

const normal = (line: string) => line.replace(/\W+/g, " ").trim();

/**
 * The lines of each reading the reading before it lacked. A burned-in subtitle
 * changes under a slide that does not, and keeping whole readings repeated the
 * slide once per subtitle (precision 0.46); dropping the lines the last frame
 * already had lifted burned-in subtitle F1 from 0.561 to 0.722. A reading with
 * nothing new comes back empty.
 */
export function newLines(readings: readonly string[]): string[] {
  let previous = new Set<string>();
  return readings.map((text) => {
    const lines = text.split("\n").filter((l) => normal(l));
    const fresh = lines.filter((l) => !previous.has(normal(l)));
    previous = new Set(lines.map(normal));
    return fresh.join("\n");
  });
}
