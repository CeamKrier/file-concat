/**
 * Generate a project name from file paths
 */
export const generateProjectName = (filePaths: string[]): string => {
  if (filePaths.length === 0) return "project";

  const cleanString = (str: string): string => {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  };

  // Split all paths into parts
  const splitPaths = filePaths.map((p) => p.split("/").filter(Boolean));

  // Case 1: Single file without path
  if (filePaths.length === 1 && splitPaths[0].length === 1) {
    const fileName = splitPaths[0][0].replace(/\.[^/.]+$/, ""); // Remove extension
    return cleanString(fileName);
  }

  // Find common root path
  const findCommonParts = (): string[] => {
    if (splitPaths.length === 0) return [];
    const commonParts: string[] = [];

    for (let i = 0; i < splitPaths[0].length; i++) {
      const part = splitPaths[0][i];
      if (splitPaths.every((p) => p[i] === part)) {
        commonParts.push(part);
      } else {
        break;
      }
    }

    return commonParts;
  };

  const commonParts = findCommonParts();

  // Case 2: All files share a deep common root (like "my-project/src/components")
  // Use the top-level folder name
  if (commonParts.length > 0) {
    return cleanString(commonParts[0]);
  }

  // Case 3: No common root - find the most frequent top-level directories
  const topLevelDirs = splitPaths
    .filter((p) => p.length > 1) // Only paths with directories
    .map((p) => p[0]);

  if (topLevelDirs.length > 0) {
    // Count frequency of each directory
    const dirCounts = topLevelDirs.reduce(
      (acc, dir) => {
        acc[dir] = (acc[dir] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Get unique directories sorted by frequency
    const sortedDirs = Object.entries(dirCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([dir]) => dir);

    // If one directory dominates (>50% of files), use it
    const totalFiles = topLevelDirs.length;
    const topDir = sortedDirs[0];
    if (dirCounts[topDir] / totalFiles > 0.5) {
      return cleanString(topDir);
    }

    // If 2-3 main directories, combine them
    if (sortedDirs.length <= 3) {
      return cleanString(sortedDirs.slice(0, 3).join("-"));
    }

    // Multiple directories - use the most common one + file count indicator
    return cleanString(`${topDir}-${filePaths.length}files`);
  }

  // Case 4: All files are in root (no directories)
  // Use a generic name with file count
  return cleanString(`${filePaths.length}files`);
};
