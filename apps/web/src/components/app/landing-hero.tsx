import { EntrySurface } from "./entry-surface";
import { HeroAnnouncement } from "./hero-announcement";
import { type ImportState } from "./import-panel";

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
      {/* On a phone the button has to come within 25 words: the banner and
          the pill go, and the subhead carries the privacy line instead. */}
      <div className="flex flex-col items-center text-center">
        <div className="max-sm:hidden">
          <HeroAnnouncement />
        </div>

        <span className="text-go-fg rounded-pill mt-3 inline-flex max-sm:hidden items-center gap-2 whitespace-nowrap border border-[oklch(var(--primary)/0.25)] bg-[oklch(var(--primary)/0.08)] px-3 py-1 font-mono text-[11px]">
          <span className="bg-primary h-1.5 w-1.5 rounded-full" />
          runs in your browser, files not uploaded to us
        </span>

        <h1 className="font-display text-ink mt-6 text-balance max-sm:mt-0 text-[clamp(2rem,7vw,2.875rem)] font-bold leading-[1.04] tracking-[-0.025em]">
          Merge all your files into one. Beat the AI upload limit.
        </h1>

        <p className="text-ink-secondary mt-4 max-w-[540px] text-pretty text-[17px] leading-relaxed">
          <span className="max-sm:hidden">
            Drop a folder, files or an archive. You get one file, its count, and what it costs to
            send, before you paste.
          </span>
          <span className="sm:hidden">
            One file back, with its token count. Your files are not uploaded to us.
          </span>
        </p>
      </div>

      <div className="mt-8">
        <EntrySurface {...props} linkImport={linkImport} />
      </div>
    </section>
  );
}
