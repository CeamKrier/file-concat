import React from "react";
import FileViewerContent from "@/components/file-viewer-content";

interface FileViewerPaneProps {
  path: string;
  size: number;
  included: boolean;
  reason?: string;
  content: string | null;
  onToggleInclude?: () => void;
  isProcessing?: boolean;
  editingEnabled?: boolean;
  isEditing?: boolean;
  isDirty?: boolean;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
  onSaveEdit?: () => void;
  onChangeEdit?: (value: string) => void;
}

const FileViewerPane: React.FC<FileViewerPaneProps> = (props) => {
  return (
    <div className="md:sticky md:top-4">
      <FileViewerContent {...props} />
    </div>
  );
};

export default FileViewerPane;
