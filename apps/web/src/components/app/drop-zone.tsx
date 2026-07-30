import { useRef } from "react";
import { Upload } from "lucide-react";

import { cn } from "~/lib/utils";

export type DropZoneProps = {
  isDragging: boolean;
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Headline inside the target. Defaults to the generic home copy; persona
   * pages pass their own ("Drag your case folder here"). */
  title?: string;
  /** The line under the headline. Defaults to the generic home copy. */
  hint?: string;
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
  title = "Drag a folder or files here",
  hint = "…and your file is ready a second later.",
}: DropZoneProps) {
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  // A dashed upload box reads as "click to browse", so a click that did nothing
  // was a dead click. Open the files picker on any click inside the target,
  // except clicks on the explicit buttons (they fire their own picker) and the
  // synthetic clicks those buttons bubble up from the hidden inputs — without the
  // `input` guard, pressing "Browse folder" would also fire the files picker,
  // because `folderInput.click()` bubbles to this handler with the input as its
  // target. Keyboard users reach the pickers through the buttons, so the
  // container stays a plain region rather than a role="button" nesting buttons.
  const openFilesOnClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, input")) return;
    filesInput.current?.click();
  };

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={openFilesOnClick}
      className={cn(
        "rounded-panel relative flex cursor-pointer flex-col items-center border-2 border-dashed px-6 py-12 text-center transition-colors duration-150",
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

      <h2 className="font-display text-ink text-lg font-semibold tracking-[-0.01em]">{title}</h2>
      <p className="text-ink-muted mt-1.5 text-sm">{hint}</p>

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
