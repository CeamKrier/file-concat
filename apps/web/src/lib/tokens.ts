import { encoding_for_model, TiktokenModel } from "@dqbd/tiktoken";

export const TOKEN_MODEL: TiktokenModel = "o1-preview-2024-09-12";

const TIKTOKEN_INPUT_LIMIT = 1 * 1024 * 1024;

/**
 * Count tokens for `text` against the named tiktoken model. WASM-backed
 * and synchronous once the plugin's top-level await has resolved the
 * tiktoken module. Inputs larger than {@link TIKTOKEN_INPUT_LIMIT} skip
 * the encoder and use a `bytes / 4` approximation — running the WASM
 * encoder on multi-MB blobs blocks the main thread and the approximation
 * is good enough for headline UI. Encoder failures fall back the same way.
 */
export function estimateTokenCount(text: string, model: TiktokenModel = TOKEN_MODEL): number {
  if (text.length > TIKTOKEN_INPUT_LIMIT) {
    return Math.ceil(text.length / 4);
  }
  try {
    const enc = encoding_for_model(model);
    const tokens = enc.encode(text);
    enc.free();
    return tokens.length;
  } catch (error) {
    console.warn("Token estimation failed (WASM error?), falling back to approximation", error);
    return Math.ceil(text.length / 4);
  }
}
