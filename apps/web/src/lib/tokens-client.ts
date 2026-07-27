import { encoding_for_model, type TiktokenModel } from "@dqbd/tiktoken";
import { LARGE_BUNDLE_CHARS } from "./tokens";

const TOKEN_MODEL: TiktokenModel = "o1-preview-2024-09-12";

export function estimateTokenCount(text: string): number {
  // Above LARGE_BUNDLE_CHARS the WASM tokenizer is too slow/heavy to run over
  // the whole bundle, so we forecast the count as chars/4 (see docs/adr/0010).
  if (text.length > LARGE_BUNDLE_CHARS) {
    return Math.ceil(text.length / 4);
  }
  try {
    const enc = encoding_for_model(TOKEN_MODEL);
    const tokens = enc.encode(text);
    enc.free();
    return tokens.length;
  } catch (error) {
    console.warn("Token estimation failed (WASM error?), falling back to approximation", error);
    return Math.ceil(text.length / 4);
  }
}
