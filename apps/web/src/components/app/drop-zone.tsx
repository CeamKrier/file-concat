import { useRef } from "react";
import { Upload } from "lucide-react";

import { cn } from "~/lib/utils";

type DropZoneProps = {
  isDragging: boolean;
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

/**
 * The landing drop target. Drag-over tints green and lifts the border; the
 * float on the icon is purely decorative and disabled under reduced motion.
 * Browse files / browse folder are the keyboard fallback for the drop.
 */
export function DropZone({
  isDragging,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileInput,
}: DropZoneProps) {
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "rounded-panel relative flex flex-col items-center border-2 border-dashed px-6 py-12 text-center transition-colors duration-150",
        isDragging
          ? "border-primary bg-[oklch(var(--primary)/0.08)]"
          : "border-border-strong bg-surface-alt",
      )}
    >
      <div className="border-border bg-surface mb-5 flex h-[62px] w-[62px] items-center justify-center rounded-2xl border">
        <Upload
          className="text-primary animate-float h-6 w-6 motion-reduce:animate-none"
          strokeWidth={1.75}
        />
      </div>

      <h2 className="font-display text-ink text-lg font-semibold tracking-[-0.01em]">
        Drag a folder or files here
      </h2>
      <p className="text-ink-muted mt-1.5 text-sm">…and your file is ready a second later.</p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
        <button
          type="button"
          onClick={() => filesInput.current?.click()}
          className="bg-primary text-primary-foreground focus-visible:ring-ring focus-visible:ring-offset-surface-alt rounded-input px-4 py-2.5 text-sm font-semibold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Browse files
        </button>
        <button
          type="button"
          onClick={() => folderInput.current?.click()}
          className="bg-secondary text-ink border-border-strong focus-visible:ring-ring focus-visible:ring-offset-surface-alt rounded-input hover:bg-accent border px-4 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Browse folder
        </button>
      </div>

      <input
        ref={filesInput}
        type="file"
        multiple
        className="hidden"
        onChange={onFileInput}
        aria-label="Browse files"
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        className="hidden"
        webkitdirectory=""
        directory=""
        onChange={onFileInput}
        aria-label="Browse folder"
      />
    </div>
  );
}
