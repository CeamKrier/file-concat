export type FileEntry = {
    file: File;
    path: string;
    content: string; // Add this field
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
    forceInclude?: boolean;
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

export interface FileValidationResult {
    isValid: boolean;
    reason?: string;
}

export interface GitHubFile {
    name: string;
    path: string;
    type: "file" | "dir";
    size: number;
    sha: string;
    url: string;
    download_url: string | null;
    content?: string;
}

export interface GitLabFile {
    id: string;
    name: string;
    type: "tree" | "blob";
    path: string;
    mode: string;
}

export interface RepoFile {
    name: string;
    path: string;
    type: string;
    size: number;
    content?: string;
    download_url?: string;
}

export interface RepositoryContent {
    files: RepoFile[];
    error?: string;
}
