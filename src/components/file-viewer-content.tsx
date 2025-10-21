import React, { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatSize } from "@/utils";
const LazyEditor = React.lazy(() => import("@/components/lazy-editor-codemirror"))

interface FileViewerContentProps {
  path: string;
  size: number;
  included: boolean;
  reason?: string;
  content: string | null;
  onClose?: () => void;
  onToggleInclude?: () => void;
  isProcessing?: boolean;
  // Editing (optional)
  editingEnabled?: boolean;
  isEditing?: boolean;
  isDirty?: boolean;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
  onSaveEdit?: () => void;
  onChangeEdit?: (value: string) => void;
}

const FileViewerContent: React.FC<FileViewerContentProps> = ({
  path,
  size,
  included,
  reason,
  content,
  onClose,
  onToggleInclude,
  isProcessing,
  editingEnabled,
  isEditing,
  isDirty,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onChangeEdit,
}) => {
  const isTooLarge = size > 1024 * 1024; // >1MB
  const cannotPreview = content == null || reason === "Binary file";

  let contentNode: React.ReactNode;

  if (cannotPreview) {
    contentNode = <div className="p-4 text-sm text-muted-foreground">Cannot preview this file type.</div>;
  } else if (isEditing && editingEnabled) {
    contentNode = (
      <div className="h-full min-h-0">
        <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading editor…</div>}>
          <LazyEditor value={content || ""} onChange={onChangeEdit || (() => {})} />
        </Suspense>
      </div>
    );
  } else if (isTooLarge) {
    contentNode = (
      <div className="p-4 text-sm h-full min-h-0">
        <div className="mb-2 text-yellow-700">This file is large (&gt; 1MB). Preview may be truncated.</div>
        <ScrollArea className="h-full w-full">
          <pre className="p-4 text-xs md:text-sm whitespace-pre-wrap break-words font-mono max-w-full">
            {content.slice(0, 1024 * 1024)}
          </pre>
        </ScrollArea>
      </div>
    );
  } else {
    contentNode = (
      <ScrollArea className="h-full w-full">
        <pre className="p-4 text-xs md:text-sm whitespace-pre-wrap break-words font-mono max-w-full">{content}</pre>
      </ScrollArea>
    );
  }

  return (
    <Card className="h-full w-full">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-sm font-mono break-all">{path}</CardTitle>
            <CardDescription className="text-xs">
              <span className="text-foreground">{formatSize(size)}</span>
              {reason ? <span className="ml-2 text-muted-foreground">• {reason}</span> : null}
              <span className="ml-2">• {included ? "Included" : "Excluded"}</span>
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onToggleInclude && (
              <Button variant={included ? "secondary" : "default"} size="sm" onClick={onToggleInclude} disabled={isProcessing}>
                {included ? "Exclude" : "Include"}
              </Button>
            )}
            {editingEnabled && !cannotPreview && (
              !isEditing ? (
                <Button variant="outline" size="sm" onClick={onStartEdit} disabled={isProcessing}>
                  Edit
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button variant="default" size="sm" onClick={onSaveEdit} disabled={isProcessing || !isDirty}>
                    Save{isDirty ? "" : "d"}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={onCancelEdit} disabled={isProcessing}>
                    Discard
                  </Button>
                </div>
              )
            )}
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close viewer">
                Close
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="h-[60vh] md:h-[70vh] p-0 border-t">
        <div className="h-full w-full min-h-0">
        {contentNode}
        </div>
      </CardContent>
    </Card>
  );
};

export default FileViewerContent;
