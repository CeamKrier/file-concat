import type { FileStatus } from "@fileconcat/core";

export type InclusionState = "included" | "excluded" | "partial";

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: TreeNode[];
  status?: FileStatus;
  /** Sum of file sizes under this directory. Files leave it undefined. */
  totalSize?: number;
}

/**
 * Build the displayable tree from a flat `FileStatus[]`. Directories sort
 * before files; within each kind, sorted alphabetically. Each directory's
 * `totalSize` is the recursive sum of its file sizes.
 */
export function buildFileTree(fileStatuses: FileStatus[]): TreeNode {
  const root: TreeNode = { name: "root", path: "", type: "directory", children: [] };

  fileStatuses.forEach((status, index) => {
    const parts = status.path.split("/").filter((p) => p.length > 0);
    let current = root;

    parts.forEach((part, i) => {
      const currentPath = parts.slice(0, i + 1).join("/");
      const isFile = i === parts.length - 1;

      current.children ??= [];
      let existing = current.children.find((c) => c.name === part);

      if (!existing) {
        existing = {
          name: part,
          path: currentPath,
          type: isFile ? "file" : "directory",
          children: isFile ? undefined : [],
          status: isFile ? { ...status, index } : undefined,
        };
        current.children.push(existing);
      } else if (isFile && existing.status) {
        existing.status.index = index;
      }

      current = existing;
    });
  });

  sortChildren(root);
  computeTotalSize(root);
  return root;
}

function sortChildren(node: TreeNode): void {
  if (!node.children) return;
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  node.children.forEach(sortChildren);
}

function computeTotalSize(node: TreeNode): number {
  if (node.type === "file") return node.status?.size ?? 0;
  if (!node.children?.length) return 0;
  const total = node.children.reduce((acc, child) => acc + computeTotalSize(child), 0);
  node.totalSize = total;
  return total;
}

/**
 * Three-state inclusion: a directory is `included` when every descendant is
 * included, `excluded` when none are (and no partials exist), `partial`
 * otherwise. Files mirror their `status.included` flag.
 */
export function calculateInclusionState(node: TreeNode): InclusionState {
  if (node.type === "file") return node.status?.included ? "included" : "excluded";
  if (!node.children?.length) return "excluded";

  const states = node.children.map(calculateInclusionState);
  const included = states.filter((s) => s === "included").length;
  const partial = states.filter((s) => s === "partial").length;

  if (included === states.length) return "included";
  if (included === 0 && partial === 0) return "excluded";
  return "partial";
}

/** Flatten every file index under `node` for batch toggling. */
export function collectFileIndices(node: TreeNode): number[] {
  if (node.type === "file") {
    return typeof node.status?.index === "number" ? [node.status.index] : [];
  }
  if (!node.children) return [];
  return node.children.flatMap(collectFileIndices);
}

/** Every directory path under `node` (non-empty), for expand-all. */
export function collectDirectoryPaths(node: TreeNode): string[] {
  const out: string[] = [];
  const walk = (n: TreeNode): void => {
    if (n.type === "directory" && n.path) out.push(n.path);
    n.children?.forEach(walk);
  };
  walk(node);
  return out;
}
