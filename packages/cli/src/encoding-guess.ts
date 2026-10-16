import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createEncodingGuesser, type EncodingGuesser } from "@fileconcat/core";

let guesser: Promise<EncodingGuesser | undefined> | undefined;

/**
 * chardetng, loaded the first time a file is not UTF-8 and kept for the run.
 * The wasm ships in the `chardetng-wasm` dependency, so it is read from disk
 * rather than bundled (ADR-0012). A load failure leaves the guess to the
 * windows-1252 fallback instead of failing the run.
 */
export function encodingGuesser(): Promise<EncodingGuesser | undefined> {
  guesser ??= (async () => {
    try {
      const wasm = readFileSync(createRequire(import.meta.url).resolve("chardetng-wasm/dist/chardetng_wasm_bg.wasm"));
      return await createEncodingGuesser(wasm);
    } catch {
      return undefined;
    }
  })();
  return guesser;
}
