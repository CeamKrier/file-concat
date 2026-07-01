import { Check } from "lucide-react";

import { DropZone } from "./drop-zone";
import { ImportPanel, ImportTrigger } from "./import-panel";

type ImportControls = {
  open: boolean;
  onOpen: () => void;
  panel: React.ComponentProps<typeof ImportPanel>;
};

type LandingHeroProps = {
  isDragging: boolean;
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  importControls: ImportControls;
};

export function LandingHero({ importControls, ...props }: LandingHeroProps) {
  return (
    <section className="mx-auto w-full max-w-[780px] px-4 pt-9 sm:px-6">
      <div className="flex flex-col items-center text-center">
        <span className="text-go-fg rounded-pill inline-flex items-center gap-2 whitespace-nowrap border border-[oklch(var(--primary)/0.25)] bg-[oklch(var(--primary)/0.08)] px-3 py-1 font-mono text-[11px]">
          <span className="bg-primary h-1.5 w-1.5 rounded-full" />
          runs in your browser · nothing uploaded
        </span>

        <h1 className="font-display text-ink mt-6 text-balance text-[clamp(2rem,7vw,2.875rem)] font-bold leading-[1.04] tracking-[-0.025em]">
          Combine files into one AI-ready document.
        </h1>

        <p className="text-ink-secondary mt-4 max-w-[520px] text-[17px] leading-relaxed">
          Drop a folder, files, or an archive. The noise gets stripped and out comes one clean
          document for ChatGPT, Claude, or Gemini. No setup, no account.
        </p>
      </div>

      <div className="mt-8">
        <DropZone {...props} />
      </div>

      <div className="text-ink-muted mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px]">
        <span className="text-ink-secondary inline-flex items-center gap-1.5">
          <Check className="text-primary h-3.5 w-3.5" strokeWidth={2.5} />
          Code, docs, configs &amp; data
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="border-ink-faint h-3 w-3 rounded-full border" />
          Images &amp; binaries skipped for you
        </span>
      </div>

      <div className="mt-7">
        {importControls.open ? (
          <ImportPanel {...importControls.panel} />
        ) : (
          <div className="text-center">
            <ImportTrigger onOpen={importControls.onOpen} />
          </div>
        )}
      </div>
    </section>
  );
}
