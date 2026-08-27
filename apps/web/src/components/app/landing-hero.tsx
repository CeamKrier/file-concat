import { Check, Minus } from "lucide-react";

import { DropZone } from "./drop-zone";
import { ImportPanel, type ImportState } from "./import-panel";

type LandingHeroProps = {
  isDragging: boolean;
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  linkImport: ImportState;
};

export function LandingHero({ linkImport, ...props }: LandingHeroProps) {
  return (
    <section className="mx-auto w-full max-w-[780px] px-4 pt-9 sm:px-6">
      <div className="flex flex-col items-center text-center">
        <span className="text-go-fg rounded-pill inline-flex items-center gap-2 whitespace-nowrap border border-[oklch(var(--primary)/0.25)] bg-[oklch(var(--primary)/0.08)] px-3 py-1 font-mono text-[11px]">
          <span className="bg-primary h-1.5 w-1.5 rounded-full" />
          runs in your browser, nothing uploaded
        </span>

        <h1 className="font-display text-ink mt-6 text-balance text-[clamp(2rem,7vw,2.875rem)] font-bold leading-[1.04] tracking-[-0.025em]">
          Merge all your files into one. Beat the AI upload limit.
        </h1>

        <p className="text-ink-secondary mt-4 max-w-[520px] text-[17px] leading-relaxed">
          Hit the file limit on ChatGPT, Claude, or Gemini? Combine a repo, or a folder of PDFs and
          Office docs, into one clean file. It all gets read right here in your browser, even the
          PDFs. No setup, no account.
        </p>
      </div>

      <div className="mt-8">
        <DropZone {...props} />
        <ImportPanel {...linkImport} />
      </div>

      <div className="text-ink-muted mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px]">
        <span className="text-ink-secondary inline-flex items-center gap-1.5">
          <Check className="text-primary h-3.5 w-3.5" strokeWidth={2.5} />
          Code, docs, configs &amp; data
        </span>
        <span className="text-ink-secondary inline-flex items-center gap-1.5">
          <Check className="text-primary h-3.5 w-3.5" strokeWidth={2.5} />
          PDFs &amp; Office docs read in-browser
        </span>
        <span className="text-ink-muted inline-flex items-center gap-1.5">
          <Minus className="text-ink-faint h-3.5 w-3.5" strokeWidth={2.5} />
          Images &amp; binaries skipped for you
        </span>
      </div>
    </section>
  );
}
