import wasmUrl from "chardetng-wasm/dist/chardetng_wasm_bg.wasm?url";
import { createEncodingGuesser } from "@fileconcat/core";

/** Firefox's chardetng, fetched from this site (never a CDN) the first time a file needs it. */
export async function loadGuesser() {
  const response = await fetch(wasmUrl);
  return createEncodingGuesser(await response.arrayBuffer());
}
