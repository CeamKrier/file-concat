import React, { Suspense } from "react";
import { Check, Plus, Pencil, Save as SaveIcon, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatSize } from "@/utils";
const LazyEditor = React.lazy(() => import("@/components/lazy-editor-codemirror"));

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
    contentNode = (
      <div className="p-4 text-sm text-muted-foreground">Cannot preview this file type.</div>
    );
  } else if (isEditing && editingEnabled) {
    contentNode = (
      <div className="h-full min-h-0">
        <Suspense
          fallback={<div className="p-4 text-sm text-muted-foreground">Loading editor…</div>}
        >
          <LazyEditor value={content || ""} onChange={onChangeEdit || (() => {})} />
        </Suspense>
      </div>
    );
  } else if (isTooLarge) {
    contentNode = (
      <div className="h-full min-h-0 p-4 text-sm">
        <div className="mb-2 text-yellow-700">
          This file is large (&gt; 1MB). Preview may be truncated.
        </div>
        <ScrollArea className="h-full w-full">
          <pre className="max-w-full whitespace-pre-wrap break-words p-4 font-mono text-xs md:text-sm">
            {content.slice(0, 1024 * 1024)}
          </pre>
        </ScrollArea>
      </div>
    );
  } else {
    contentNode = (
      <ScrollArea className="h-full w-full">
        <pre className="max-w-full whitespace-pre-wrap break-words p-4 font-mono text-xs md:text-sm">
          {content}
        </pre>
      </ScrollArea>
    );
  }

  return (
    <Card className="h-full w-full">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 break-all font-mono text-sm">
              <span className="truncate" title={path}>
                {path}
              </span>
            </CardTitle>
            <CardDescription className="text-xs">
              <span className="text-foreground">{formatSize(size)}</span>
              {reason ? <span className="ml-2 text-muted-foreground">• {reason}</span> : null}
              <span className="ml-2">• {included ? "Included" : "Excluded"}</span>
              {isEditing && isDirty && (
                <span className="ml-2 rounded border border-amber-200 bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                  Unsaved
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
            {/* Include group */}
            <div className="flex items-center gap-2">
              {onToggleInclude &&
                (included ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="border-green-200 bg-green-100 text-green-700 hover:bg-green-100/80"
                    onClick={onToggleInclude}
                    disabled={isProcessing}
                    title="Exclude from output"
                    aria-label="Exclude from output"
                  >
                    <Check />
                    Included
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    size="sm"
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={onToggleInclude}
                    disabled={isProcessing}
                    title="Include in output"
                    aria-label="Include in output"
                  >
                    <Plus />
                    Include
                  </Button>
                ))}
            </div>

            {/* Divider between groups */}
            {editingEnabled && !cannotPreview && (
              <div className="mx-1 h-6 w-px bg-border" aria-hidden />
            )}

            {/* Edit group */}
            {editingEnabled &&
              !cannotPreview &&
              (!isEditing ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onStartEdit}
                  disabled={isProcessing}
                  title="Edit file"
                  aria-label="Edit file"
                >
                  <Pencil />
                  Edit
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={onSaveEdit}
                    disabled={isProcessing || !isDirty}
                    title={isDirty ? "Save changes" : "No changes to save"}
                    aria-label="Save changes"
                  >
                    <SaveIcon />
                    Save
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={onCancelEdit}
                    disabled={isProcessing}
                    title="Discard changes"
                    aria-label="Discard changes"
                  >
                    <Undo2 />
                    Discard
                  </Button>
                </div>
              ))}

            {/* Close */}
            {onClose && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                aria-label="Close viewer"
                title="Close viewer"
              >
                Close
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="h-[60vh] border-t p-0 md:h-[70vh]">
        <div className="h-full min-h-0 w-full">{contentNode}</div>
      </CardContent>
    </Card>
  );
};

export default FileViewerContent;
