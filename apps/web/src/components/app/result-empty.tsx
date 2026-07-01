import { Archive, FileQuestion, ImageOff, type LucideIcon } from "lucide-react";

export type EmptyKind = "image" | "archive" | "other";

type ResultEmptyProps = {
  droppedFiles: string[];
  kind?: EmptyKind;
  onStartOver: () => void;
};

// One rescue component, three voices, keyed by what was actually dropped. The
// tone is a heads-up (amber), never an error, and every variant offers a next
// step so the user is never at a dead end.
const COPY: Record<EmptyKind, { icon: LucideIcon; title: string; body: string; cta: string }> = {
  image: {
    icon: ImageOff,
    title: "These look like images, not text",
    body: "FileConcat bundles text (code, docs, configs and data) into one document. Images and binaries can't be combined this way, so nothing was left to pack.",
    cta: "Try a folder of files instead",
  },
  archive: {
    icon: Archive,
    title: "That archive can't be opened here",
    body: "FileConcat unpacks .zip and .tar archives (including .tar.gz and .gz) right in the browser, but not .7z or .rar. Unzip it first, then drop the folder.",
    cta: "Start over",
  },
  other: {
    icon: FileQuestion,
    title: "Nothing text-like to combine",
    body: "FileConcat bundles text (code, docs, configs and data) into one document. These files look binary or empty, so nothing was left to pack.",
    cta: "Start over",
  },
};

/**
 * The novice rescue. Reached when nothing combinable was found. Never a dead
 * end: explains what happened and offers the next step, tailored to the drop.
 */
export function ResultEmpty({ droppedFiles, kind = "image", onStartOver }: ResultEmptyProps) {
  const { icon: Icon, title, body, cta } = COPY[kind];
  const shown = droppedFiles.slice(0, 12);
  const extra = droppedFiles.length - shown.length;

  return (
    <section className="animate-fade-up mx-auto w-full max-w-[560px] px-4 pt-12 text-center motion-reduce:animate-none">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-[oklch(var(--info)/0.4)] bg-[oklch(var(--info)/0.12)]">
        <Icon className="text-info h-6 w-6" strokeWidth={2} />
      </span>

      <h2 className="font-display text-ink mt-4 text-2xl font-bold tracking-[-0.02em]">{title}</h2>
      <p className="text-ink-secondary mx-auto mt-2 max-w-[440px] text-[15px] leading-relaxed">
        {body}
      </p>

      {shown.length > 0 && (
        <div className="mt-5 flex flex-wrap justify-center gap-1.5">
          {shown.map((name) => (
            <span
              key={name}
              className="border-border bg-surface-alt text-ink-muted rounded-chip border px-2 py-1 font-mono text-[11px]"
            >
              {name}
            </span>
          ))}
          {extra > 0 && (
            <span className="text-ink-faint rounded-chip px-2 py-1 font-mono text-[11px]">
              +{extra} more
            </span>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onStartOver}
        className="bg-primary text-primary-foreground rounded-input focus-visible:ring-ring focus-visible:ring-offset-background mt-7 inline-flex items-center px-5 py-2.5 text-sm font-semibold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        {cta}
      </button>
    </section>
  );
}
