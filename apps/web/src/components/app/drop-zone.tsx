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
   * pages pass their own ("Drop your case folder here"). */
  title?: string;
  /** The line under the headline. Defaults to the generic home copy. */
  hint?: string;
  /**
   * `hero` is the tall centred target the ten persona pages embed in a hero
   * column of roughly 360px, where it is the only thing on offer and the
   * height is free. `compact` is the same plumbing laid out as a horizontal
   * row at about a third of the height, for the home entry surface, where a
   * second way in has to fit underneath it. See `entry-surface.tsx`.
   */
  variant?: "hero" | "compact";
};

/**
 * The landing drop target. Drag-over tints green, lifts the border, and swaps
 * the headline for "Let go to start", so the surface confirms it has the drag
 * before the release rather than after it. Browse files and browse folder are
 * the keyboard fallback for the drop.
 */
export function DropZone({
  isDragging,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileInput,
  title = "Drop a folder or files here",
  hint = "One file comes back, usually in under a second.",
  variant = "hero",
}: DropZoneProps) {
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const compact = variant === "compact";

  // A dashed upload box reads as "click to browse", so a click that did nothing
  // was a dead click. Open the files picker on any click inside the target,
  // except clicks on the explicit buttons (they fire their own picker) and the
  // synthetic clicks those buttons bubble up from the hidden inputs - without the
  // `input` guard, pressing "Browse folder" would also fire the files picker,
  // because `folderInput.click()` bubbles to this handler with the input as its
  // target. Keyboard users reach the pickers through the buttons, so the
  // container stays a plain region rather than a role="button" nesting buttons.
  //
  // This is also why the link field lives outside the dashed rectangle rather
  // than inside the same box: an input in here would turn every click on the
  // surrounding padding into a file dialog.
  const openFilesOnClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, input")) return;
    filesInput.current?.click();
  };

  const buttonBase = cn(
    "rounded-input focus-visible:ring-ring whitespace-nowrap transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
    compact ? "px-3.5 py-2.5 text-[13.5px]" : "px-4 py-2.5 text-sm",
    compact ? "focus-visible:ring-offset-surface-inset" : "focus-visible:ring-offset-surface-alt",
  );

  // A phone has no drag and, on most versions in use, no folder picker
  // (webkitdirectory: iOS Safari 18.4+, Chrome Android 132+). There the target
  // is one full-width "Choose files", with a .zip as the way to bring a folder.
  const quietOnPhone =
    "max-sm:flex-1 max-sm:border-0 max-sm:bg-transparent max-sm:px-2 max-sm:text-ink-secondary max-sm:underline max-sm:underline-offset-4";
  const buttons = (
    <>
      <button
        type="button"
        onClick={() => filesInput.current?.click()}
        className={cn(
          buttonBase,
          "bg-primary text-primary-foreground font-semibold transition-[filter] hover:brightness-110 max-sm:w-full max-sm:py-3.5 max-sm:text-[15px]",
        )}
      >
        <span className="max-sm:hidden">Browse files</span>
        <span className="sm:hidden">Choose files</span>
      </button>
      <button
        type="button"
        onClick={() => zipInput.current?.click()}
        className={cn(buttonBase, "font-medium sm:hidden", quietOnPhone)}
      >
        Choose a .zip
      </button>
      <button
        type="button"
        onClick={() => folderInput.current?.click()}
        className={cn(
          buttonBase,
          "bg-secondary text-ink border-border-strong hover:bg-accent border font-medium",
          quietOnPhone,
        )}
      >
        <span className="max-sm:hidden">Browse folder</span>
        <span className="sm:hidden">Choose folder</span>
      </button>
    </>
  );

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={openFilesOnClick}
      className={cn(
        "relative cursor-pointer border-dashed transition-colors duration-150",
        compact
          ? "rounded-card flex flex-wrap items-center gap-3.5 border-[1.5px] p-4 text-left"
          : "rounded-panel flex flex-col items-center border-2 px-6 py-12 text-center",
        isDragging
          ? "border-primary bg-[oklch(var(--primary)/0.08)]"
          : compact
            ? "border-border-strong bg-surface-inset"
            : "border-border-strong bg-surface-alt",
      )}
    >
      {compact ? (
        <>
          <div className="rounded-input border-border bg-secondary flex h-[34px] w-[34px] flex-none items-center justify-center border max-sm:hidden">
            <Upload className="text-primary h-[17px] w-[17px]" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1 basis-[190px] max-sm:hidden">
            <h2 className="font-display text-ink text-[16.5px] font-semibold tracking-[-0.01em]">
              {isDragging ? "Let go to start" : title}
            </h2>
            <p className="text-ink-muted mt-[3px] text-[13px]">{hint}</p>
          </div>
          <div className="flex flex-none gap-2 max-sm:w-full max-sm:flex-wrap">{buttons}</div>
        </>
      ) : (
        <>
          <div className="border-border bg-surface mb-5 flex h-[62px] w-[62px] items-center justify-center rounded-2xl border">
            <Upload
              className="text-primary animate-float h-6 w-6 motion-reduce:animate-none"
              strokeWidth={1.75}
            />
          </div>

          <h2 className="font-display text-ink text-lg font-semibold tracking-[-0.01em]">
            {isDragging ? "Let go to start" : title}
          </h2>
          <p className="text-ink-muted mt-1.5 text-sm">{hint}</p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5 max-sm:w-full">
            {buttons}
          </div>
        </>
      )}

      <input
        ref={filesInput}
        type="file"
        multiple
        className="hidden"
        onChange={onFileInput}
        aria-label="Browse files"
      />
      <input
        ref={zipInput}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={onFileInput}
        aria-label="Choose a .zip"
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
