import { LLMContextLimit } from "./types";

export const SUPPORTED_EXTENSIONS = new Set([
    // Code Files
    "js",
    "jsx",
    "ts",
    "tsx",
    "py",
    "java",
    "cpp",
    "c",
    "cs",
    "go",
    "rb",
    "php",
    "swift",
    "kt",
    "rs",
    "sh",
    "ps1",
    // Web Files
    "html",
    "css",
    "scss",
    "sass",
    "less",
    "svg",
    "json",
    "xml",
    "yaml",
    "yml",
    // Documentation/Text
    "md",
    "txt",
    "rtf",
    "csv",
    "log",
    "env",
    "ini",
    "conf",
    "properties",
    // Config Files (no extension)
    ""
]);

export const LLM_CONTEXT_LIMITS: LLMContextLimit[] = [
    { name: "GPT-3.5", limit: 16385, inputLimit: 4096 },
    { name: "GPT-4", limit: 128000, inputLimit: 128000 },
    { name: "Claude 3 Haiku", limit: 128000 },
    { name: "Claude 3 Sonnet", limit: 200000 },
    { name: "Claude 3 Opus", limit: 200000 },
    { name: "Anthropic Claude 2", limit: 100000 },
    { name: "Google Gemini Pro", limit: 32000 }
];
