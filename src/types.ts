export type FileEntry = {
    file: File;
    path: string;
};

export type FileContent = {
    path: string;
    content: string;
};

export type FileStatus = {
    path: string;
    included: boolean;
    reason?: string;
    size: number;
    type: string;
};

export type ProcessingConfig = {
    maxFileSizeMB: number;
    excludeHiddenFiles: boolean;
    excludeBinaryFiles: boolean;
};

export type TokenCount = {
    total: number;
    byFile: Record<string, number>;
};

export type LLMContextLimit = {
    name: string;
    limit: number;
    inputLimit?: number;
};

export type OutputFormat = "single" | "multi";
