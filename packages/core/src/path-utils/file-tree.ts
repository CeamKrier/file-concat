interface TreeNode {
  [key: string]: TreeNode | null;
}

/**
 * Generates a hierarchical file tree structure from a list of file paths
 * @param files - Array of file paths
 * @returns ASCII tree representation of the file structure
 */
export const generateFileTree = (files: string[]): string => {
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
  const buildTreeString = (node: TreeNode, prefix = ""): string => {
    const entries = Object.entries(node);
    let result = "";

    entries.forEach(([name, children], index) => {
      const isLastEntry = index === entries.length - 1;
      const connector = isLastEntry ? "└── " : "├── ";
      const extension = isLastEntry ? "    " : "│   ";

      result += prefix + connector + name + "\n";

      if (children !== null) {
        result += buildTreeString(children, prefix + extension);
      }
    });

    return result;
  };

  return buildTreeString(tree);
};
