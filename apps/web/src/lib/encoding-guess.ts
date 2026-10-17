import type { EncodingGuesser } from "@fileconcat/core";

let loading: Promise<EncodingGuesser | undefined> | undefined;

/**
 * The encoding guesser, loaded once per page and only when a file is neither
 * UTF-8 nor says what it is. Same facade as `ocr.ts`: the SSR guard keeps the
 * wasm out of the worker graph. A failed load means no guesser, so the file
 * still reads, as windows-1252, flagged.
 */
export function encodingGuesser(): Promise<EncodingGuesser | undefined> {
  if (import.meta.env.SSR) return Promise.resolve(undefined);
  loading ??= import("./encoding-guess-client")
    .then((m) => m.loadGuesser())
    .catch(() => {
      loading = undefined;
      return undefined;
    });
  return loading;
}

/** A `TextDecoder` label as people write it: `Windows-1251`, `Shift_JIS`, `GBK`. */
export function encodingName(label: string): string {
  if (label.startsWith("windows-")) return `Windows-${label.slice(8)}`;
  if (label === "shift_jis") return "Shift_JIS";
  if (label === "big5") return "Big5";
  return label.toUpperCase();
}

/** The line under a file read in a guessed or picked encoding. */
export function encodingWhy(label: string, picked: boolean): string {
  return picked
    ? `Read as ${encodingName(label)} (picked).`
    : `Read as ${encodingName(label)} (guessed). Wrong letters? Pick the encoding.`;
}
