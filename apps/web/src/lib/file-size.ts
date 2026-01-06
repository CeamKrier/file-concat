export const getSizeSeverity = (bytes: number) => {
  const KB = 1024;
  if (bytes > 500 * KB) return "text-red-600 font-bold dark:text-red-400"; // Very Large (>500KB)
  if (bytes > 100 * KB) return "text-orange-600 font-semibold dark:text-orange-400"; // Large (>100KB)
  if (bytes > 20 * KB) return "text-yellow-600 font-medium dark:text-yellow-400"; // Medium (>20KB)
  return "text-muted-foreground"; // Small (<=20KB)
};
