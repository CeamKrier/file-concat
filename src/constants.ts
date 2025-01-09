import { LLMContextLimit, ProcessingConfig } from "./types";

export const LLM_CONTEXT_LIMITS: LLMContextLimit[] = [
    { name: "GPT-4", limit: 8_192 },
    { name: "GPT-4-32k", limit: 32_768 },
    { name: "GPT-4-turbo", limit: 128_000 },
    { name: "Claude 3 Haiku", limit: 128_000 },
    { name: "Claude 3 Sonnet", limit: 200_000 },
    { name: "Llama 3", limit: 128_000 },
    { name: "Google Gemini Pro", limit: 32_000 },
    { name: "Google Gemini 1.5 Pro", limit: 2_000_000 }
];

export const MULTI_OUTPUT_LIMIT = 100_000;
export const MULTI_OUTPUT_CHUNK_SIZE = 32_000;

export const DEFAULT_CONFIG: ProcessingConfig = {
    maxFileSizeMB: 10,
    excludeHiddenFiles: true,
    excludeBinaryFiles: true
};
