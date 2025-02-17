import { fileTypeFromBuffer } from "file-type";
import { encoding_for_model, TiktokenModel } from "@dqbd/tiktoken";
import { FileValidationResult, ProcessingConfig, GitLabFile, DownloadProgress, RepositoryContent, RepoFile } from "./types";

// Binary file signatures (magic numbers) to detect binary files
const BINARY_EXTENSIONS = [
    "3dm",
    "3ds",
    "3g2",
    "3gp",
    "7z",
    "a",
    "aac",
    "adp",
    "afdesign",
    "afphoto",
    "afpub",
    "ai",
    "aif",
    "aiff",
    "alz",
    "ape",
    "apk",
    "appimage",
    "ar",
    "arj",
    "asf",
    "au",
    "avi",
    "bak",
    "baml",
    "bh",
    "bin",
    "bk",
    "bmp",
    "btif",
    "bz2",
    "bzip2",
    "cab",
    "caf",
    "cgm",
    "class",
    "cmx",
    "cpio",
    "cr2",
    "cur",
    "dat",
    "dcm",
    "deb",
    "dex",
    "djvu",
    "dll",
    "dmg",
    "dng",
    "doc",
    "docm",
    "docx",
    "dot",
    "dotm",
    "dra",
    "DS_Store",
    "dsk",
    "dts",
    "dtshd",
    "dvb",
    "dwg",
    "dxf",
    "ecelp4800",
    "ecelp7470",
    "ecelp9600",
    "egg",
    "eol",
    "eot",
    "epub",
    "exe",
    "f4v",
    "fbs",
    "fh",
    "fla",
    "flac",
    "flatpak",
    "fli",
    "flv",
    "fpx",
    "fst",
    "fvt",
    "g3",
    "gh",
    "gif",
    "graffle",
    "gz",
    "gzip",
    "h261",
    "h263",
    "h264",
    "icns",
    "ico",
    "ief",
    "img",
    "ipa",
    "iso",
    "jar",
    "jpeg",
    "jpg",
    "jpgv",
    "jpm",
    "jxr",
    "key",
    "ktx",
    "lha",
    "lib",
    "lvp",
    "lz",
    "lzh",
    "lzma",
    "lzo",
    "m3u",
    "m4a",
    "m4v",
    "mar",
    "mdi",
    "mht",
    "mid",
    "midi",
    "mj2",
    "mka",
    "mkv",
    "mmr",
    "mng",
    "mobi",
    "mov",
    "movie",
    "mp3",
    "mp4",
    "mp4a",
    "mpeg",
    "mpg",
    "mpga",
    "mxu",
    "nef",
    "npx",
    "numbers",
    "nupkg",
    "o",
    "odp",
    "ods",
    "odt",
    "oga",
    "ogg",
    "ogv",
    "otf",
    "ott",
    "pages",
    "pbm",
    "pcx",
    "pdb",
    "pdf",
    "pea",
    "pgm",
    "pic",
    "png",
    "pnm",
    "pot",
    "potm",
    "potx",
    "ppa",
    "ppam",
    "ppm",
    "pps",
    "ppsm",
    "ppsx",
    "ppt",
    "pptm",
    "pptx",
    "psd",
    "pya",
    "pyc",
    "pyo",
    "pyv",
    "qt",
    "rar",
    "ras",
    "raw",
    "resources",
    "rgb",
    "rip",
    "rlc",
    "rmf",
    "rmvb",
    "rpm",
    "rtf",
    "rz",
    "s3m",
    "s7z",
    "scpt",
    "sgi",
    "shar",
    "snap",
    "sil",
    "sketch",
    "slk",
    "smv",
    "snk",
    "so",
    "stl",
    "suo",
    "sub",
    "swf",
    "tar",
    "tbz",
    "tbz2",
    "tga",
    "tgz",
    "thmx",
    "tif",
    "tiff",
    "tlz",
    "ttc",
    "ttf",
    "txz",
    "udf",
    "uvh",
    "uvi",
    "uvm",
    "uvp",
    "uvs",
    "uvu",
    "viv",
    "vob",
    "war",
    "wav",
    "wax",
    "wbmp",
    "wdp",
    "weba",
    "webm",
    "webp",
    "whl",
    "wim",
    "wm",
    "wma",
    "wmv",
    "wmx",
    "woff",
    "woff2",
    "wrm",
    "wvx",
    "xbm",
    "xif",
    "xla",
    "xlam",
    "xls",
    "xlsb",
    "xlsm",
    "xlsx",
    "xlt",
    "xltm",
    "xltx",
    "xm",
    "xmind",
    "xpi",
    "xpm",
    "xwd",
    "xz",
    "z",
    "zip",
    "zipx"
];

// Define common paths to skip across different project types
export const SKIP_PATHS = {
    // JavaScript/Node.js
    javascript: ["node_modules", "dist", "build", "coverage", ".next", ".nuxt", ".output", ".cache", "pnpm-lock.yaml", "package-lock.json"],
    // Python
    python: ["__pycache__", ".pytest_cache", "venv", "env", ".env", "build", "dist", "*.egg-info"],
    // Java
    java: ["target", "build", ".gradle", "out", "bin"],
    // Go
    go: ["vendor", "bin", "pkg"],
    // Rust
    rust: ["target", "cargo.lock"],
    // Common version control and IDE folders
    common: [".git", ".svn", ".hg", ".idea", ".vscode", ".vs", ".DS_Store", "Thumbs.db"],
    // Build and dependency artifacts
    build: ["build", "dist", "out", "release", "debug", "logs", "temp", "tmp"]
};

export const isBinaryFile = async (file: File): Promise<boolean> => {
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension && BINARY_EXTENSIONS.includes(extension)) {
        return true;
    }

    return false;
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

export const estimateTokenCount = async (text: string, model = "o1-preview-2024-09-12") => {
    const enc = encoding_for_model(model as TiktokenModel);

    const tokens = enc.encode(text);
    enc.free();
    return tokens.length;
};

export const fetchGitlabRepository = async (url: string): Promise<RepositoryContent> => {
    try {
        // Updated regex to capture everything after gitlab.com/
        const match = url.match(/gitlab\.com\/(.+?)(?:\.git)?$/);
        if (!match) {
            throw new Error("Invalid GitLab URL");
        }

        const [, fullPath] = match;
        // Double encode the path for nested groups
        const projectId = fullPath
            .replace(/\.git$/, "") // Remove .git suffix if present
            .split("/") // Split into parts
            .map(part => encodeURIComponent(part)) // Encode each part
            .join("/"); // Join with /
        const doubleEncodedId = encodeURIComponent(projectId); // Encode the whole path again

        // Get all files with recursive parameter
        const treeUrl = `https://gitlab.com/api/v4/projects/${doubleEncodedId}/repository/tree?recursive=true&per_page=100`;
        const response = await fetch(treeUrl);
        if (!response.ok) {
            throw new Error("Failed to fetch repository contents");
        }

        const data = await response.json();

        // Filter for files and fetch their contents in parallel
        const filePromises = data
            .filter((item: GitLabFile) => item.type === "blob")
            .map(async (item: GitLabFile) => {
                // Double encode the file path as well
                const encodedFilePath = item.path
                    .split("/")
                    .map(part => encodeURIComponent(part))
                    .join("/");
                const contentUrl = `https://gitlab.com/api/v4/projects/${doubleEncodedId}/repository/files/${encodeURIComponent(encodedFilePath)}/raw`;
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
                        size: content.length,
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

export const fetchGithubRepository = async (url: string, onProgress?: (progress: DownloadProgress) => void, signal?: AbortSignal): Promise<RepositoryContent> => {
    try {
        const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
        if (!match) {
            throw new Error("Invalid GitHub URL");
        }

        const [, owner, repo] = match;

        // First, get the default branch
        const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { signal });
        if (!repoResponse.ok) {
            throw new Error("Failed to fetch repository information");
        }
        const repoData = await repoResponse.json();
        const defaultBranch = repoData.default_branch;

        // Get the complete tree
        const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`;
        const treeResponse = await fetch(treeUrl, { signal });
        if (!treeResponse.ok) {
            throw new Error("Failed to fetch repository contents");
        }

        const treeData = await treeResponse.json();
        const files = treeData.tree.filter((item: { type: string }) => item.type === "blob");

        // Calculate total size and setup progress tracking
        const totalBytes = files.reduce((acc: number, file: { size: number }) => acc + file.size, 0);
        let downloadedBytes = 0;
        let completedFiles = 0;
        const startTime = Date.now();
        let lastUpdate = startTime;
        let lastBytes = 0;
        let currentSpeed = 0;

        // Progress update helper
        const updateProgress = (addedBytes: number, currentFile: string) => {
            downloadedBytes += addedBytes;

            const now = Date.now();
            if (now - lastUpdate > 500) {
                const timeDiff = (now - lastUpdate) / 1000;
                const bytesDiff = downloadedBytes - lastBytes;
                currentSpeed = bytesDiff / timeDiff;

                lastUpdate = now;
                lastBytes = downloadedBytes;
            }

            onProgress?.({
                currentFile,
                totalFiles: files.length,
                completedFiles,
                downloadedBytes,
                totalBytes,
                speed: currentSpeed
            });
        };

        // Fetch files with progress and abort support
        const filePromises = files.map(async (item: { path: string; size: number }) => {
            const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${item.path}`;
            try {
                const response = await fetch(rawUrl, { signal });
                if (!response.ok) throw new Error(`Failed to fetch ${item.path}`);

                const reader = response.body?.getReader();
                if (!reader) throw new Error("ReadableStream not supported");

                const chunks = [];
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (signal?.aborted) {
                        reader.cancel();
                        throw new Error("Aborted");
                    }

                    chunks.push(value);
                    updateProgress(value.length, item.path);
                }

                completedFiles++;
                const allChunks = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
                let position = 0;

                for (const chunk of chunks) {
                    allChunks.set(chunk, position);
                    position += chunk.length;
                }

                const content = new TextDecoder().decode(allChunks);

                const typeResult = await fileTypeFromBuffer(allChunks);
                const detectedMime = typeResult?.mime || "text/plain";

                return {
                    name: item.path.split("/").pop() || "",
                    path: item.path,
                    type: detectedMime,
                    size: item.size,
                    content,
                    download_url: rawUrl
                };
            } catch (error) {
                if (error instanceof Error && error.message === "Aborted") {
                    throw error;
                }
                console.warn(`Failed to fetch content for ${item.path}:`, error);
                return null;
            }
        });

        // Wait for all files to be fetched
        const fetchedFiles = await Promise.all(filePromises);

        // Filter out any failed fetches
        const validFiles = fetchedFiles.filter((file): file is RepoFile => file !== null);

        return { files: validFiles };
    } catch (error) {
        if (error instanceof Error && (error.name === "AbortError" || error.message === "Aborted")) {
            throw new Error("AbortError");
        }
        return {
            files: [],
            error: error instanceof Error ? error.message : "Failed to fetch repository"
        };
    }
};

export const fetchRepositoryFiles = async (url: string, onProgress?: (progress: DownloadProgress) => void, signal?: AbortSignal): Promise<RepositoryContent> => {
    if (url.includes("github.com")) {
        return fetchGithubRepository(url, onProgress, signal);
    }
    throw new Error("Unsupported repository host");
};

// Combine all skip paths into a single array
export const ALL_SKIP_PATHS = Object.values(SKIP_PATHS).flat();

// Function to check if a path should be skipped
export const shouldSkipPath = (path: string): boolean => {
    const normalizedPath = path.toLowerCase();
    return ALL_SKIP_PATHS.some(skipPath => {
        // Handle wildcard patterns
        if (skipPath.includes("*")) {
            const pattern = skipPath.replace("*", ".*");
            return new RegExp(pattern).test(normalizedPath);
        }
        // Check if the path includes the skip path as a directory name
        return normalizedPath.split("/").some(part => part === skipPath);
    });
};

export const calculateTotalSize = (content: string): number => {
    return new TextEncoder().encode(content).length;
};
