import { LLMContextLimit, ProcessingConfig } from "./types";

export const LLM_CONTEXT_LIMITS: LLMContextLimit[] = [
  { name: "GPT-5", limit: 2_000_000 },
  { name: "Claude Sonnet 4.5", limit: 200_000 },
  { name: "Gemini 2.5 Pro", limit: 2_097_152 },
  { name: "Qwen-2.5", limit: 1_000_000 },
  { name: "Codestral 2508", limit: 256_000 },
  { name: "DeepSeek R1", limit: 128_000 },
  { name: "Llama 3.3", limit: 128_000 },
  { name: "Mistral Large 2.1", limit: 128_000 },
  { name: "Phi-3", limit: 128_000 },
];

export const MULTI_OUTPUT_LIMIT = 100_000;
export const MULTI_OUTPUT_CHUNK_SIZE = 32_000;

/**
 * Multi-part ("split into parts") output is currently disabled. It was built
 * for LLMs with small per-paste or per-file upload limits; a bundle handed over
 * as a file no longer touches a context window, and the old ~1 MB upload caps
 * are gone — so the feature has no current justification and its "big bundle"
 * card only added noise. The code is kept dormant behind this flag rather than
 * deleted, ready to revive if a concrete limit (e.g. a small local-LLM context)
 * makes splitting worthwhile again.
 */
export const SPLIT_OUTPUT_ENABLED = false;

export const DEFAULT_CONFIG: ProcessingConfig = {
  maxFileSizeMB: 10,
  excludeHiddenFiles: true,
  excludeBinaryFiles: true,
};
