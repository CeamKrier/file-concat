/**
 * Format bytes to human-readable size (KB, MB, GB)
 */
export const formatSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

/**
 * Calculate the byte size of a string content
 */
export const calculateTotalSize = (content: string): Promise<number> => {
  return new Promise((resolve) => {
    resolve(new TextEncoder().encode(content).length);
  });
};
