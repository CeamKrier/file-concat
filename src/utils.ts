import { encoding_for_model, TiktokenModel } from "@dqbd/tiktoken";
import { FileValidationResult, ProcessingConfig, GitHubFile, GitLabFile } from "./types";

// Binary file signatures (magic numbers) to detect binary files
const BINARY_SIGNATURES = new Uint8Array([
    0xff,
    0xd8, // JPEG
    0x89,
    0x50, // PNG
    0x47,
    0x49, // GIF
    0x50,
    0x4b, // ZIP/DOCX/XLSX
    0x25,
    0x50, // PDF
    0x7f,
    0x45, // ELF
    0xca,
    0xfe, // Mac executable
    0x4d,
    0x5a // Windows executable
]);

export const isBinaryFile = async (file: File): Promise<boolean> => {
    try {
        // Read the first 16 bytes of the file
        const buffer = await file.slice(0, 16).arrayBuffer();
        const bytes = new Uint8Array(buffer);

        // Check for binary signatures
        for (let i = 0; i < BINARY_SIGNATURES.length; i += 2) {
            if (bytes[0] === BINARY_SIGNATURES[i] && bytes[1] === BINARY_SIGNATURES[i + 1]) {
                return true;
            }
        }

        // Check for high concentration of null bytes or non-printable characters
        let nonPrintable = 0;
        for (const byte of bytes) {
            if (byte === 0 || (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13)) {
                nonPrintable++;
            }
        }

        return nonPrintable > bytes.length * 0.3; // 30% threshold
    } catch (error) {
        console.error("Error checking file type:", error);
        return true; // Err on the side of caution
    }
};

export const validateFile = async (file: File, config: ProcessingConfig): Promise<FileValidationResult> => {
    const result: FileValidationResult = {
        isValid: true,
        reason: undefined
    };

    // Size check
    if (file.size > config.maxFileSizeMB * 1024 * 1024) {
        result.isValid = false;
        result.reason = `File size exceeds ${config.maxFileSizeMB}MB limit`;
        return result;
    }

    // Hidden file check
    if (config.excludeHiddenFiles && file.name.startsWith(".")) {
        result.isValid = false;
        result.reason = "Hidden file";
        return result;
    }

    // Binary file check
    if (config.excludeBinaryFiles && (await isBinaryFile(file))) {
        result.isValid = false;
        result.reason = "Binary file";
        return result;
    }

    return result;
};

export const formatSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

export const estimateTokenCount = async (text: string, model = "gpt-4") => {
    const enc = encoding_for_model(model as TiktokenModel);
    const tokens = enc.encode(text);
    enc.free();
    return tokens.length;
};

interface RepoFile {
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

export const fetchGithubRepository = async (url: string): Promise<RepositoryContent> => {
    try {
        const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
        if (!match) {
            throw new Error("Invalid GitHub URL");
        }

        const [, owner, repo] = match;
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;

        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error("Failed to fetch repository contents");
        }

        const data: GitHubFile[] = await response.json();
        const files: RepoFile[] = [];

        const fetchFiles = async (items: GitHubFile[], currentPath: string = "") => {
            for (const item of items) {
                if (item.type === "file") {
                    if (!item.download_url) {
                        console.warn(`No download URL for file: ${item.path}`);
                        continue;
                    }

                    const contentResponse = await fetch(item.download_url);
                    const content = await contentResponse.text();

                    files.push({
                        name: item.name,
                        path: currentPath + item.path,
                        type: item.type,
                        size: item.size,
                        content,
                        download_url: item.download_url
                    });
                } else if (item.type === "dir") {
                    const dirResponse = await fetch(item.url);
                    const dirContents: GitHubFile[] = await dirResponse.json();
                    await fetchFiles(dirContents, `${currentPath}${item.name}/`);
                }
            }
        };

        await fetchFiles(data);
        return { files };
    } catch (error) {
        return {
            files: [],
            error: error instanceof Error ? error.message : "Failed to fetch repository"
        };
    }
};

export const fetchGitlabRepository = async (url: string): Promise<RepositoryContent> => {
    try {
        const match = url.match(/gitlab\.com\/([^/]+)\/([^/]+)/);
        if (!match) {
            throw new Error("Invalid GitLab URL");
        }

        const [, owner, repo] = match;
        const projectId = encodeURIComponent(`${owner}/${repo}`);
        const apiUrl = `https://gitlab.com/api/v4/projects/${projectId}/repository/tree`;

        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error("Failed to fetch repository contents");
        }

        const data: GitLabFile[] = await response.json();
        const files: RepoFile[] = [];

        const fetchFiles = async (items: GitLabFile[], currentPath: string = "") => {
            for (const item of items) {
                if (item.type === "blob") {
                    // For GitLab, we need to fetch the file content separately
                    const contentUrl = `https://gitlab.com/api/v4/projects/${projectId}/repository/files/${encodeURIComponent(item.path)}/raw`;
                    const contentResponse = await fetch(contentUrl);
                    const content = await contentResponse.text();

                    files.push({
                        name: item.name,
                        path: currentPath + item.path,
                        type: "file",
                        size: content.length, // GitLab API doesn't provide size, so we use content length
                        content
                    });
                } else if (item.type === "tree") {
                    const dirUrl = `${apiUrl}?path=${encodeURIComponent(item.path)}`;
                    const dirResponse = await fetch(dirUrl);
                    const dirContents: GitLabFile[] = await dirResponse.json();
                    await fetchFiles(dirContents, `${currentPath}${item.name}/`);
                }
            }
        };

        await fetchFiles(data);
        return { files };
    } catch (error) {
        return {
            files: [],
            error: error instanceof Error ? error.message : "Failed to fetch repository"
        };
    }
};

export const fetchRepositoryFiles = async (url: string): Promise<RepositoryContent> => {
    if (url.includes("github.com")) {
        return fetchGithubRepository(url);
    } else if (url.includes("gitlab.com")) {
        return fetchGitlabRepository(url);
    }
    throw new Error("Unsupported repository host");
};
