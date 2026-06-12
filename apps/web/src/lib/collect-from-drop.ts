/**
 * DataTransfer / FileSystemEntry walker shared by the landing drop and the
 * workbench drop. Both surfaces need the same recursion, pagination, and
 * path-prefix logic; only what they do with the collected files differs.
 */

export interface CollectedFile {
  file: File;
  path: string;
}

export interface CollectFailure {
  path: string;
  error: string;
}

export interface CollectFromDataTransferResult {
  collected: CollectedFile[];
  failed: CollectFailure[];
}

export interface CollectFromDataTransferOptions {
  /** Return `true` to skip a directory (e.g. `node_modules`) without recursing. */
  skipDir?: (name: string) => boolean;
}

export async function collectFromDataTransfer(
  items: DataTransferItemList,
  options: CollectFromDataTransferOptions = {},
): Promise<CollectFromDataTransferResult> {
  const collected: CollectedFile[] = [];
  const failed: CollectFailure[] = [];
  const shouldSkip = options.skipDir ?? (() => false);

  const walk = async (entry: FileSystemEntry, prefix = ""): Promise<void> => {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      return new Promise((resolve) => {
        fileEntry.file(
          (file) => {
            collected.push({ file, path: prefix ? `${prefix}/${file.name}` : file.name });
            resolve();
          },
          () => {
            const full = prefix ? `${prefix}/${fileEntry.name}` : fileEntry.name;
            failed.push({ path: full, error: "File could not be read" });
            resolve();
          },
        );
      });
    }
    if (!entry.isDirectory) return;

    const dirEntry = entry as FileSystemDirectoryEntry;
    if (shouldSkip(dirEntry.name)) return;

    const nextPrefix = prefix ? `${prefix}/${dirEntry.name}` : dirEntry.name;
    const reader = dirEntry.createReader();
    const children: FileSystemEntry[] = [];
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve) => reader.readEntries(resolve));
      if (batch.length === 0) break;
      children.push(...batch);
    }
    await Promise.all(children.map((c) => walk(c, nextPrefix)));
  };

  const tops: Promise<void>[] = [];
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry();
    if (entry) tops.push(walk(entry));
  }
  await Promise.all(tops);
  return { collected, failed };
}
