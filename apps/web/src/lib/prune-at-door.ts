import { isPrunedDirectory, prunedAtWalk } from "@fileconcat/core";

import type { IncomingFile } from "~/hooks/use-file-ingestion";
import { addToTally, type Tally } from "~/lib/metrics";

/** Final extension, lowercased: the only thing a counter ever carries from a path. */
export function extensionOf(path: string): string {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Extensionless files are a real category, and the empty string is not a valid counter value. */
export const NO_EXTENSION = "none";

/**
 * What the walk-time prune turned away at the door, never read
 * (`prunedAtWalk`): a directory the defaults name, or a file whose extension
 * never holds text.
 */
export interface PrunedAtDoor {
  /** Directory names from the defaults the walk refused, each once. */
  dirs: string[];
  /** Files refused for their extension, `n` per extension. */
  exts: Tally;
  /** Entries refused: files, plus one per directory the walk never entered. */
  count: number;
  /**
   * Dropped roots whose own name the defaults would prune (`dist`, `.output`,
   * `node_modules`), read because someone chose them. The screen says so,
   * since the same folder inside a drop is turned away without a word.
   */
  roots: string[];
}

/**
 * Run the door prune over a list and say what it turned away. The first
 * path segment is exempt: someone who drops `dist` or `vendor` by itself
 * chose it, and only what sits inside a drop is judged by name. The same
 * holds for an archive, whose entries arrive rooted at a folder named after
 * it: `build.zip` is opened whatever it is called, and the `fonts/` inside
 * it is turned away like the `fonts/` beside it. `refusedDirs` is what the
 * drag walk already declined to enter, one entry per directory.
 */
export function pruneAtDoor<T extends IncomingFile>(
  list: T[],
  refusedDirs: readonly string[] = [],
): { kept: T[]; pruned: PrunedAtDoor } {
  const kept: T[] = [];
  const dirs = new Set(refusedDirs);
  const exts: Tally = new Map();
  const roots = new Set<string>();
  for (const item of list) {
    const path = item.path || item.file.name;
    const slash = path.indexOf("/");
    if (slash > 0 && isPrunedDirectory(path.slice(0, slash))) roots.add(path.slice(0, slash));
    const inside = path.slice(slash + 1);
    if (!prunedAtWalk(inside)) {
      kept.push(item);
      continue;
    }
    const dir = inside.split("/").slice(0, -1).find(isPrunedDirectory);
    if (dir) dirs.add(dir);
    else addToTally(exts, extensionOf(inside) || NO_EXTENSION);
  }
  return {
    kept,
    pruned: {
      dirs: [...dirs],
      exts,
      count: list.length - kept.length + refusedDirs.length,
      roots: [...roots],
    },
  };
}

function mergeTallies(a: Tally, b: Tally): Tally {
  const out: Tally = new Map(a);
  for (const [key, amounts] of b) {
    const existing = out.get(key);
    out.set(key, existing ? { n: existing.n + amounts.n } : { ...amounts });
  }
  return out;
}

/**
 * `a` plus `b`: an append's record on top of the drop it landed on, or what
 * the archives in a drop held on top of what the door itself refused.
 */
export function mergePruned(a: PrunedAtDoor | null, b: PrunedAtDoor | null): PrunedAtDoor | null {
  if (!a || !b) return a ?? b;
  return {
    dirs: [...new Set([...a.dirs, ...b.dirs])],
    exts: mergeTallies(a.exts, b.exts),
    count: a.count + b.count,
    roots: [...new Set([...a.roots, ...b.roots])],
  };
}
