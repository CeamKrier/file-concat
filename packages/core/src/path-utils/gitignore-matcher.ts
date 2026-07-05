import ignore, { type Ignore } from "ignore";

/**
 * One `.gitignore` file and the directory it governs. `dir` is relative to the
 * tree root the matcher works in — `""` for the root `.gitignore`, `"packages/x"`
 * for a nested one — with no leading or trailing slash. Its patterns are matched
 * relative to `dir`, mirroring git's per-directory semantics.
 */
export interface GitignoreSource {
  dir: string;
  content: string;
}

export interface GitignoreMatcher {
  /**
   * True when `path` (relative to the tree root, forward slashes, no leading
   * slash) is excluded by the composed `.gitignore` hierarchy.
   */
  ignores(path: string): boolean;
}

interface CompiledSource {
  dir: string;
  depth: number;
  ig: Ignore;
}

/**
 * Pick the `.gitignore` files out of a flat list of `{ path, content }` files
 * (e.g. the web app's ingested `entries`) and derive the directory each one
 * governs. The result feeds straight into {@link createGitignoreMatcher}.
 */
export function collectGitignoreSources(
  files: Array<{ path: string; content: string }>,
): GitignoreSource[] {
  const sources: GitignoreSource[] = [];
  for (const file of files) {
    const slash = file.path.lastIndexOf("/");
    const name = slash === -1 ? file.path : file.path.slice(slash + 1);
    if (name !== ".gitignore") continue;
    sources.push({ dir: slash === -1 ? "" : file.path.slice(0, slash), content: file.content });
  }
  return sources;
}

function normalizeDir(dir: string): string {
  return dir.replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * Path of `path` relative to `dir`, or `null` when `path` is not under `dir`.
 * `dir === ""` means the tree root, so every path is relative to it.
 */
function relativeTo(dir: string, path: string): string | null {
  if (dir === "") return path;
  if (path === dir) return "";
  if (path.startsWith(`${dir}/`)) return path.slice(dir.length + 1);
  return null;
}

/**
 * Compose a set of `.gitignore` files into a single matcher with git's
 * hierarchical semantics: each file's patterns are anchored to its own
 * directory, and a deeper file overrides a shallower one (so a nested
 * `!pattern` can re-include what a parent ignored). This is why we keep one
 * {@link Ignore} instance per source rather than flattening every pattern into
 * a single list.
 */
export function createGitignoreMatcher(sources: GitignoreSource[]): GitignoreMatcher {
  const compiled: CompiledSource[] = sources.map((source) => {
    const dir = normalizeDir(source.dir);
    return {
      dir,
      depth: dir === "" ? 0 : dir.split("/").length,
      ig: ignore().add(source.content),
    };
  });
  // Shallow first so deeper files get the last, overriding word.
  compiled.sort((a, b) => a.depth - b.depth);

  return {
    ignores(path: string): boolean {
      const normalized = path.replace(/^\/+/, "");
      if (!normalized) return false;

      let ignored = false;
      for (const source of compiled) {
        const rel = relativeTo(source.dir, normalized);
        if (rel === null || rel === "") continue;
        const result = source.ig.test(rel);
        if (result.ignored) ignored = true;
        else if (result.unignored) ignored = false;
      }
      return ignored;
    },
  };
}
