import type { SourceMeta, SourceType } from "./types";

/** Source metadata definitions */
export const SOURCE_METADATA: Record<SourceType, SourceMeta> = {
  github: {
    type: "github",
    name: "GitHub",
    icon: "github",
    placeholder: "https://github.com/owner/repo",
    helpText: "Public GitHub repository. Supports branches and subdirectories.",
    examples: [
      "https://github.com/facebook/react",
      "https://github.com/vercel/next.js/tree/canary/packages/next",
    ],
  },
  gitlab: {
    type: "gitlab",
    name: "GitLab",
    icon: "gitlab",
    placeholder: "https://gitlab.com/owner/repo",
    helpText: "Public GitLab repository.",
    examples: ["https://gitlab.com/gitlab-org/gitlab", "https://gitlab.com/inkscape/inkscape"],
  },
  bitbucket: {
    type: "bitbucket",
    name: "Bitbucket",
    icon: "bitbucket",
    placeholder: "https://bitbucket.org/workspace/repo",
    helpText: "Public Bitbucket repository.",
    examples: ["https://bitbucket.org/atlassian/python-bitbucket"],
  },
  gist: {
    type: "gist",
    name: "Gist",
    icon: "file-code",
    placeholder: "https://gist.github.com/user/id",
    helpText: "GitHub Gist or GitLab Snippet.",
    examples: ["https://gist.github.com/octocat/6cad326836d38bd3a7ae"],
  },
  url: {
    type: "url",
    name: "URL",
    icon: "link",
    placeholder: "https://example.com/file.txt",
    helpText: "Any publicly accessible URL. Fetches raw content.",
    examples: [
      "https://raw.githubusercontent.com/owner/repo/main/file.ts",
      "https://example.com/code.js",
    ],
  },
  local: {
    type: "local",
    name: "Local Files",
    icon: "folder",
    placeholder: "Drag & drop or browse",
    helpText: "Upload files from your computer.",
    examples: [],
  },
};

/** Get metadata for source type */
export function getSourceMeta(type: SourceType): SourceMeta {
  return SOURCE_METADATA[type];
}

/** Get all source types (excluding local) */
export function getRemoteSourceTypes(): SourceType[] {
  return ["github", "gitlab", "bitbucket", "gist", "url"];
}
