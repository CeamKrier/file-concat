import { encoding_for_model, type TiktokenModel } from "@dqbd/tiktoken";

const TOKEN_MODEL: TiktokenModel = "o1-preview-2024-09-12";

const TIKTOKEN_INPUT_LIMIT = 1 * 1024 * 1024;

export function estimateTokenCount(text: string): number {
  if (text.length > TIKTOKEN_INPUT_LIMIT) {
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
