import { encoding_for_model, TiktokenModel } from "@dqbd/tiktoken";
import { FileValidationResult, ProcessingConfig, GitLabFile } from "./types";

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

        // First, get the default branch
        const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
        if (!repoResponse.ok) {
            throw new Error("Failed to fetch repository information");
        }
        const repoData = await repoResponse.json();
        const defaultBranch = repoData.default_branch;

        // Get the complete tree in one request with recursive flag
        const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`;
        const treeResponse = await fetch(treeUrl);
        if (!treeResponse.ok) {
            throw new Error("Failed to fetch repository contents");
        }

        const treeData = await treeResponse.json();

        // Filter for files (skip directories) and fetch their contents in parallel
        const filePromises = treeData.tree
            .filter((item: { type: string }) => item.type === "blob")
            .map(async (item: { path: string; type: string; size: number }) => {
                // Use raw GitHub content URL for direct file access
                const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${item.path}`;
                try {
                    const contentResponse = await fetch(rawUrl);
                    if (!contentResponse.ok) {
                        throw new Error(`Failed to fetch ${item.path}`);
                    }
                    const content = await contentResponse.text();

                    return {
                        name: item.path.split("/").pop() || "",
                        path: item.path,
                        type: "file",
                        size: item.size,
                        content,
                        download_url: rawUrl
                    };
                } catch (error) {
                    console.warn(`Failed to fetch content for ${item.path}:`, error);
                    return null;
                }
            });

        // Wait for all files to be fetched
        const fetchedFiles = await Promise.all(filePromises);

        // Filter out any failed fetches
        const files = fetchedFiles.filter((file): file is RepoFile => file !== null);

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

        // Get all files with recursive parameter
        const treeUrl = `https://gitlab.com/api/v4/projects/${projectId}/repository/tree?recursive=true&per_page=100`;
        const response = await fetch(treeUrl);
        if (!response.ok) {
            throw new Error("Failed to fetch repository contents");
        }

        const data = await response.json();

        // Filter for files and fetch their contents in parallel
        const filePromises = data
            .filter((item: GitLabFile) => item.type === "blob")
            .map(async (item: GitLabFile) => {
                const contentUrl = `https://gitlab.com/api/v4/projects/${projectId}/repository/files/${encodeURIComponent(item.path)}/raw`;
                try {
                    const contentResponse = await fetch(contentUrl);
                    if (!contentResponse.ok) {
                        throw new Error(`Failed to fetch ${item.path}`);
                    }
                    const content = await contentResponse.text();

                    return {
                        name: item.name,
                        path: item.path,
                        type: "file",
                        size: content.length, // GitLab API doesn't provide size, so we use content length
                        content
                    };
                } catch (error) {
                    console.warn(`Failed to fetch content for ${item.path}:`, error);
                    return null;
                }
            });

        // Wait for all files to be fetched
        const fetchedFiles = await Promise.all(filePromises);

        // Filter out any failed fetches
        const files = fetchedFiles.filter((file): file is RepoFile => file !== null);

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
