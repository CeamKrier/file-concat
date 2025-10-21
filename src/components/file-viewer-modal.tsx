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
        className="w-[98vw] sm:w-[95vw] md:w-[85vw] lg:w-[80vw] max-w-screen-lg h-[85vh] p-2 sm:p-4 overflow-hidden"
      >
        <div className="h-full w-full min-h-0">
          <FileViewerContent {...rest} onClose={() => onOpenChange(false)} />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FileViewerModal;
