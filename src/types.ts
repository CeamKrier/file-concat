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
