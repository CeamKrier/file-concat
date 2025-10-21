import React from "react";
import { Loader2 } from "lucide-react";

import { Progress } from "@/components/ui/progress";

interface DownloadProgressProps {
  currentFile: string;
  totalFiles: number;
  completedFiles: number;
  downloadedBytes: number;
  totalBytes: number;
  speed: number;
  isLoading: boolean;
}

const DownloadProgress: React.FC<DownloadProgressProps> = ({
  currentFile,
  totalFiles,
  completedFiles,
  downloadedBytes,
  totalBytes,
  speed,
  isLoading,
}) => {
  const progress = totalFiles > 0 ? (completedFiles / totalFiles) * 100 : 0;

  const formatSpeed = (bytesPerSecond: number) => {
    if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(1)} B/s`;
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!isLoading) return null;

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="max-w-[200px] truncate" title={currentFile}>
            Downloading: {currentFile}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span>{formatSpeed(speed)}</span>
          <span>
            {completedFiles} of {totalFiles} files
          </span>
        </div>
      </div>
      <div className="space-y-1">
        <Progress value={progress} className="h-2" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{formatBytes(downloadedBytes)}</span>
          <span>{formatBytes(totalBytes)}</span>
        </div>
      </div>
    </div>
  );
};

export default DownloadProgress;
