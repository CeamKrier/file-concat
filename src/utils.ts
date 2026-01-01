import { fileTypeFromBuffer } from "file-type";
import { encoding_for_model, TiktokenModel } from "@dqbd/tiktoken";
import {
  FileValidationResult,
  ProcessingConfig,
  GitLabFile,
  DownloadProgress,
  RepositoryContent,
  RepoFile,
} from "./types";

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
  "avif",
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
  "zipx",
];

// Define common paths to skip across different project types
export const SKIP_PATHS = {
  // JavaScript/Node.js
  javascript: [
    "node_modules",
    "dist",
    "build",
    "coverage",
    ".next",
    ".nuxt",
    ".output",
    ".cache",
    "pnpm-lock.yaml",
    "package-lock.json",
    "tsconfig.tsbuildinfo",
    "yarn.lock",
    ".turbo",
    ".vercel",
    ".parcel-cache",
    ".expo",
  ],
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
  build: ["build", "dist", "out", "release", "debug", "logs", "temp", "tmp"],
};

export const isBinaryFile = async (file: File): Promise<boolean> => {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension && BINARY_EXTENSIONS.includes(extension)) {
    return true;
  }

  return false;
};

export const validateFile = async (
  file: File,
  config: ProcessingConfig,
): Promise<FileValidationResult> => {
  const result: FileValidationResult = {
    isValid: true,
    reason: undefined,
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

export const estimateTokenCount = (text: string, model = "o1-preview-2024-09-12") => {
  return new Promise<number>((resolve, reject) => {
    const enc = encoding_for_model(model as TiktokenModel);

    const tokens = enc.encode(text);
    enc.free();
    const tokenCount = tokens.length;

    if (isNaN(tokenCount)) {
      reject(new Error("Token count is NaN"));
    } else {
      resolve(tokenCount);
    }
  });
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
      .map((part) => encodeURIComponent(part)) // Encode each part
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
          .map((part) => encodeURIComponent(part))
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
            content,
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
      error: error instanceof Error ? error.message : "Failed to fetch repository",
    };
  }
};

export const fetchGithubRepository = async (
  url: string,
  onProgress?: (progress: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<RepositoryContent> => {
  try {
    // Updated regex to support branch and sub-path
    // Captures: owner, repo, branch/commit (optional), sub-path (optional)
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+)(?:\/(.+))?)?/);
    if (!match) {
      throw new Error("Invalid GitHub URL");
    }

    const [, owner, repo, branchOrCommit, subPath] = match;

    // First, get the default branch if no branch specified
    let branch = branchOrCommit;
    if (!branch) {
      const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { signal });
      if (!repoResponse.ok) {
        throw new Error("Failed to fetch repository information");
      }
      const repoData = await repoResponse.json();
      branch = repoData.default_branch;
    }

    // Get the complete tree with the specified branch
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    const treeResponse = await fetch(treeUrl, { signal });
    if (!treeResponse.ok) {
      if (treeResponse.status === 404) {
        throw new Error(`Branch or commit '${branch}' not found in repository`);
      }
      throw new Error("Failed to fetch repository contents");
    }

    const treeData = await treeResponse.json();

    // Filter for blobs (files) and optionally by sub-path
    const files = treeData.tree.filter((item: { type: string; path: string }) => {
      if (item.type !== "blob") return false;

      // If sub-path is specified, filter by it
      if (subPath) {
        return item.path.startsWith(subPath + "/") || item.path === subPath;
      }

      return true;
    });

    // If sub-path was specified but no files found, throw error
    if (subPath && files.length === 0) {
      throw new Error(`Path '${subPath}' not found in branch '${branch}'`);
    }

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
        speed: currentSpeed,
      });
    };

    // Fetch files with progress and abort support
    const filePromises = files.map(async (item: { path: string; size: number }) => {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}`;
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

        // Adjust path to remove sub-path prefix if present
        const displayPath =
          subPath && item.path.startsWith(subPath + "/")
            ? item.path.substring(subPath.length + 1)
            : subPath && item.path === subPath
              ? item.path.split("/").pop() || item.path
              : item.path;

        return {
          name: displayPath.split("/").pop() || "",
          path: displayPath,
          type: detectedMime,
          size: item.size,
          content,
          download_url: rawUrl,
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
      error: error instanceof Error ? error.message : "Failed to fetch repository",
    };
  }
};

export const fetchRepositoryFiles = async (
  url: string,
  onProgress?: (progress: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<RepositoryContent> => {
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
  return ALL_SKIP_PATHS.some((skipPath) => {
    // Handle wildcard patterns
    if (skipPath.includes("*")) {
      const pattern = skipPath.replace("*", ".*");
      return new RegExp(pattern).test(normalizedPath);
    }
    // Check if the path includes the skip path as a directory name
    return normalizedPath.split("/").some((part) => part === skipPath);
  });
};

export const calculateTotalSize = (content: string): Promise<number> => {
  return new Promise((resolve) => {
    resolve(new TextEncoder().encode(content).length);
  });
};

/**
 * Generates a hierarchical file tree structure from a list of file paths
 * @param files - Array of file paths
 * @returns ASCII tree representation of the file structure
 */
export const generateFileTree = (files: string[]): string => {
  interface TreeNode {
    [key: string]: TreeNode | null;
  }

  const tree: TreeNode = {};

  // Build tree structure
  files.forEach((filePath) => {
    const parts = filePath.split("/");
    let current = tree;

    parts.forEach((part, index) => {
      if (!current[part]) {
        current[part] = index === parts.length - 1 ? null : {};
      }
      if (current[part] !== null) {
        current = current[part] as TreeNode;
      }
    });
  });

  // Convert tree to string representation
  const buildTreeString = (node: TreeNode, prefix = "", isLast = true): string => {
    const entries = Object.entries(node);
    let result = "";

    entries.forEach(([name, children], index) => {
      const isLastEntry = index === entries.length - 1;
      const connector = isLastEntry ? "└── " : "├── ";
      const extension = isLastEntry ? "    " : "│   ";

      result += prefix + connector + name + "\n";

      if (children !== null) {
        result += buildTreeString(children, prefix + extension, isLastEntry);
      }
    });

    return result;
  };

  return buildTreeString(tree);
};

/**
 * Gets the language identifier for syntax highlighting based on file extension
 * @param filePath - Path to the file
 * @returns Language identifier for code blocks (e.g., 'typescript', 'python', 'json')
 */
export const getLanguageFromPath = (filePath: string): string => {
  const extension = filePath.split(".").pop()?.toLowerCase() || "";

  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    rb: "ruby",
    java: "java",
    cpp: "cpp",
    c: "c",
    cs: "csharp",
    php: "php",
    go: "go",
    rs: "rust",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    sh: "bash",
    bash: "bash",
    zsh: "zsh",
    fish: "fish",
    ps1: "powershell",
    html: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    json: "json",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    ini: "ini",
    conf: "conf",
    cfg: "ini",
    md: "markdown",
    mdx: "mdx",
    sql: "sql",
    graphql: "graphql",
    gql: "graphql",
    proto: "protobuf",
    dockerfile: "dockerfile",
    makefile: "makefile",
    r: "r",
    m: "matlab",
    vim: "vim",
    lua: "lua",
    pl: "perl",
    ex: "elixir",
    exs: "elixir",
    erl: "erlang",
    hrl: "erlang",
    clj: "clojure",
    cljs: "clojure",
    dart: "dart",
    vue: "vue",
    svelte: "svelte",
  };

  // Special cases for files without extensions
  if (filePath.toLowerCase().includes("dockerfile")) return "dockerfile";
  if (filePath.toLowerCase().includes("makefile")) return "makefile";

  return languageMap[extension] || extension || "text";
};
