import type { FileStatus } from "@fileconcat/core";

export type InclusionState = "included" | "excluded" | "partial";

/** `name` folders before files, A-Z; `size` heaviest first, folders and files mixed. */
export type TreeOrder = "name" | "size";

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: TreeNode[];
  status?: FileStatus;
  /** Characters of readable text at or under this node, from `chars`. */
  weight: number;
}

/**
 * Build the displayable tree from a flat `FileStatus[]`, which may be a filtered
 * subset: each file keeps its own `status.index`, so a toggle still addresses
 * the right file. `chars[index]` is that file's text length; binaries weigh 0.
 */
export function buildFileTree(
  fileStatuses: FileStatus[],
  chars: readonly number[] = [],
  order: TreeOrder = "name",
): TreeNode {
  const root: TreeNode = { name: "root", path: "", type: "directory", children: [], weight: 0 };
  // By path, so a folder of thousands of files is not a linear search per file.
  const byPath = new Map<string, TreeNode>();

  for (const status of fileStatuses) {
    const parts = status.path.split("/").filter((p) => p.length > 0);
    let current = root;

    parts.forEach((part, i) => {
      const currentPath = parts.slice(0, i + 1).join("/");
      const isFile = i === parts.length - 1;

      let existing = byPath.get(currentPath);
      if (!existing) {
        existing = {
          name: part,
          path: currentPath,
          type: isFile ? "file" : "directory",
          children: isFile ? undefined : [],
          status: isFile ? status : undefined,
          weight: 0,
        };
        byPath.set(currentPath, existing);
        current.children!.push(existing);
      } else if (isFile) {
        existing.status = status;
      }

      current = existing;
    });
  }

  computeWeight(root, chars);
  sortChildren(root, order);
  return root;
}

function sortChildren(node: TreeNode, order: TreeOrder): void {
  if (!node.children) return;
  node.children.sort((a, b) => {
    if (order === "size" && a.weight !== b.weight) return b.weight - a.weight;
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) sortChildren(child, order);
}

function computeWeight(node: TreeNode, chars: readonly number[]): number {
  if (node.type === "file") {
    const status = node.status;
    node.weight = status && status.classification !== "binary" ? (chars[status.index] ?? 0) : 0;
    return node.weight;
  }
  node.weight = (node.children ?? []).reduce((acc, child) => acc + computeWeight(child, chars), 0);
  return node.weight;
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

/**
 * Which files a filter-box query names. Plain text matches anywhere in the path,
 * case-folded, so a folder's name brings everything under it (GitHub's changed-
 * files filter). Text holding `*` or `?` is a glob, read by the same matcher the
 * pattern fields use.
 */
export function queryMatcher(
  query: string,
  matchesGlob: (path: string, pattern: string) => boolean,
): ((path: string) => boolean) | null {
  const q = query.trim();
  if (!q) return null;
  if (/[*?]/.test(q)) return (path) => matchesGlob(path, q);
  const folded = q.toLowerCase();
  return (path) => path.toLowerCase().includes(folded);
}

/** The extension a type chip groups by: `.json`, or `""` for none. */
export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

export interface TypeFacet {
  ext: string;
  /** Readable files of this type, and how many of them are in. */
  count: number;
  included: number;
  weight: number;
  indices: number[];
}

/** One facet per extension among readable files, heaviest first. */
export function typeFacets(fileStatuses: FileStatus[], chars: readonly number[]): TypeFacet[] {
  const byExt = new Map<string, TypeFacet>();
  for (const status of fileStatuses) {
    if (status.classification === "binary") continue;
    const ext = extensionOf(status.path);
    let facet = byExt.get(ext);
    if (!facet) {
      facet = { ext, count: 0, included: 0, weight: 0, indices: [] };
      byExt.set(ext, facet);
    }
    facet.count += 1;
    if (status.included) facet.included += 1;
    facet.weight += chars[status.index] ?? 0;
    facet.indices.push(status.index);
  }
  return [...byExt.values()].sort((a, b) => b.weight - a.weight || b.count - a.count);
}

/** A share as people read it: whole percents, one decimal under 10, never a bare 0. */
export function shareLabel(part: number, total: number): string {
  if (total <= 0 || part <= 0) return "0%";
  const percent = (part / total) * 100;
  if (percent < 0.1) return "<0.1%";
  return percent < 10 ? `${percent.toFixed(1)}%` : `${Math.round(percent)}%`;
}
