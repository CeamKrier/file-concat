import React from "react";
import FileViewerContent from "@/components/file-viewer-content";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface FileViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

const FileViewerModal: React.FC<FileViewerModalProps> = ({ open, onOpenChange, ...rest }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        unstyled
        displayClose={false}
        className="h-[85vh] w-[98vw] max-w-screen-lg overflow-hidden p-2 sm:w-[95vw] sm:p-4 md:w-[85vw] lg:w-[80vw]"
      >
        <div className="h-full min-h-0 w-full">
          <FileViewerContent {...rest} onClose={() => onOpenChange(false)} />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FileViewerModal;
