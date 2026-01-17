// Re-export everything from core package
export {
  // Types
  type FileValidationResult,
  type ProcessingConfig,
  type GitLabFile,
  type DownloadProgress,
  type RepositoryContent,
  type RepoFile,
  type FileEntry,
  type FileStatus,
  type FileContent,
  type TokenCount,
  type LLMContextLimit,
  type OutputFormat,
  type GitHubFile,
  // Constants
  LLM_CONTEXT_LIMITS,
  MULTI_OUTPUT_LIMIT,
  MULTI_OUTPUT_CHUNK_SIZE,
  DEFAULT_CONFIG,
  // File processing
  BINARY_EXTENSIONS,
  isBinaryFile,
  validateFile,
  formatSize,
  calculateTotalSize,
  // Path utils
  SKIP_PATHS,
  ALL_SKIP_PATHS,
  shouldSkipPath,
  generateFileTree,
  getLanguageFromPath,
  generateProjectName,
} from "@fileconcat/core";

// Browser-specific imports that stay in web app
import { fileTypeFromBuffer } from "file-type";
import type { DownloadProgress, RepositoryContent, RepoFile, GitLabFile } from "@fileconcat/core";

// Tokenization - using WASM implementation
import { encoding_for_model, TiktokenModel } from "@dqbd/tiktoken";

export const estimateTokenCount = (text: string, model = "o1-preview-2024-09-12") => {
  return new Promise<number>((resolve) => {
    try {
      const enc = encoding_for_model(model as TiktokenModel);
      const tokens = enc.encode(text);
      enc.free();
      resolve(tokens.length);
    } catch (error) {
      console.warn("Token estimation failed (WASM error?), falling back to approximation", error);
      // Fallback: rough char count / 4
      resolve(Math.ceil(text.length / 4));
    }
  });
};

// Repository functions - stay here due to file-type browser dependency
export const fetchGitlabRepository = async (url: string): Promise<RepositoryContent> => {
  try {
    const match = url.match(/gitlab\.com\/(.+?)(?:\.git)?$/);
    if (!match) {
      throw new Error("Invalid GitLab URL");
    }

    const [, fullPath] = match;
    const projectId = fullPath
      .replace(/\.git$/, "")
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
    const doubleEncodedId = encodeURIComponent(projectId);

    const treeUrl = `https://gitlab.com/api/v4/projects/${doubleEncodedId}/repository/tree?recursive=true&per_page=100`;
    const response = await fetch(treeUrl);
    if (!response.ok) {
      throw new Error("Failed to fetch repository contents");
    }

    const data = await response.json();

    const filePromises = data
      .filter((item: GitLabFile) => item.type === "blob")
      .map(async (item: GitLabFile) => {
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

    const fetchedFiles = await Promise.all(filePromises);
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
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+)(?:\/(.+))?)?/);
    if (!match) {
      throw new Error("Invalid GitHub URL");
    }

    const [, owner, repo, branchOrCommit, subPath] = match;

    let branch = branchOrCommit;
    if (!branch) {
      const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { signal });
      if (!repoResponse.ok) {
        throw new Error("Failed to fetch repository information");
      }
      const repoData = await repoResponse.json();
      branch = repoData.default_branch;
    }

    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    const treeResponse = await fetch(treeUrl, { signal });
    if (!treeResponse.ok) {
      if (treeResponse.status === 404) {
        throw new Error(`Branch or commit '${branch}' not found in repository`);
      }
      throw new Error("Failed to fetch repository contents");
    }

    const treeData = await treeResponse.json();

    const files = treeData.tree.filter((item: { type: string; path: string }) => {
      if (item.type !== "blob") return false;
      if (subPath) {
        return item.path.startsWith(subPath + "/") || item.path === subPath;
      }
      return true;
    });

    if (subPath && files.length === 0) {
      throw new Error(`Path '${subPath}' not found in branch '${branch}'`);
    }

    const totalBytes = files.reduce((acc: number, file: { size: number }) => acc + file.size, 0);
    let downloadedBytes = 0;
    let completedFiles = 0;
    const startTime = Date.now();
    let lastUpdate = startTime;
    let lastBytes = 0;
    let currentSpeed = 0;

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

    const fetchedFiles = await Promise.all(filePromises);
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
