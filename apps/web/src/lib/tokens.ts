import { encoding_for_model, TiktokenModel } from "@dqbd/tiktoken";

export const TOKEN_MODEL: TiktokenModel = "o1-preview-2024-09-12";

/**
 * Count tokens for `text` against the named tiktoken model. WASM-backed
 * and synchronous once the plugin's top-level await has resolved the
 * tiktoken module; if encoding fails we fall back to a `chars / 4`
 * approximation rather than throwing.
 */
export function estimateTokenCount(text: string, model: TiktokenModel = TOKEN_MODEL): number {
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
