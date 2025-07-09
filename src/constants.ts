import { LLMContextLimit, ProcessingConfig } from "./types";

export const LLM_CONTEXT_LIMITS: LLMContextLimit[] = [
    { name: "Claude 4", limit: 200_000 },
    { name: "Codestral", limit: 256_000 },
    { name: "DeepSeek R1", limit: 128_000 },
    { name: "Gemini 2.5", limit: 1_048_576 },
    { name: "GPT-4.1", limit: 1_000_000 },
    { name: "Llama 3.3", limit: 128_000 },
    { name: "o3", limit: 200_000 },
    { name: "o4-mini", limit: 200_000 },
    { name: "Phi-3", limit: 128_000 },
    { name: "Qwen-2.5", limit: 1_000_000 }
];

export const MULTI_OUTPUT_LIMIT = 100_000;
export const MULTI_OUTPUT_CHUNK_SIZE = 32_000;

export const DEFAULT_CONFIG: ProcessingConfig = {
    maxFileSizeMB: 10,
    excludeHiddenFiles: true,
    excludeBinaryFiles: true
};
