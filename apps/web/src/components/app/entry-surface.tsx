import { Check, Minus } from "lucide-react";

import { DropZone, type DropZoneProps } from "./drop-zone";
import { ImportPanel, type ImportState } from "./import-panel";

export type EntrySurfaceProps = DropZoneProps & {
  linkImport: ImportState;
};

/**
 * The home entry point, both ways in inside one frame.
 *
 * It is one panel rather than two because a bordered drop target with a second
 * bordered box under it reads as two competing offers, when the truth is one
 * flow with two doors. The `or` rule says which relation it is, and the drop
 * lane keeps the visual weight: it is what 438 of the 442 Visits that started a
 * run in the 30 days to 2026-08-27 actually used.
 *
 * The link field sits outside the dashed rectangle on purpose. `drop-zone.tsx`
 * opens the file picker on any click that is not a button or an input, so a
 * field nested in there would turn a click on the surrounding padding into a
 * file dialog, which is the exact dead-click class that handler exists to kill.
 *
 * The two notes at the foot are the panel's, not either lane's, because each
 * covers both: what gets read and skipped is the same list either way, and the
 * privacy line has to say two different true things in one breath. Neither is
 * decoration. The read-and-skip line is the only place an image-heavy folder
 * learns what will happen before it is dropped rather than after.
 */
export function EntrySurface({ linkImport, ...dropProps }: EntrySurfaceProps) {
  return (
    <div className="rounded-panel border-border bg-surface-alt border p-4 sm:p-5">
      <DropZone
        {...dropProps}
        variant="compact"
        title="Drop a folder or files"
        hint="One file comes back, usually in under a second."
      />

      <div className="my-4 flex items-center gap-3">
        <span className="bg-hairline h-px flex-1" />
        <span className="text-ink-faint font-mono text-[11px]">or</span>
        <span className="bg-hairline h-px flex-1" />
      </div>

      <ImportPanel {...linkImport} />

      <div className="border-hairline mt-4 border-t pt-3">
        <div className="text-ink-muted flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
          <span className="inline-flex items-center gap-1.5">
            <Check className="text-primary h-[13px] w-[13px] shrink-0" strokeWidth={2.5} />
            Code, docs, configs, data, PDFs and Office files
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Minus className="text-ink-faint h-[13px] w-[13px] shrink-0" strokeWidth={2.5} />
            Images, video and binaries skipped
          </span>
        </div>
        {/* Two lanes, two different truths, and the second one is the reason
            this is prose and not the blanket claim in the hero pill: a pasted
            link is a network request. It is still your browser making it,
            straight to the host, with nothing of ours in the path (see the
            adapters in `packages/core/src/sources`), and that is worth saying
            exactly rather than hiding under "nothing uploaded". */}
        <p className="text-ink-muted mt-1.5 text-[12.5px] leading-relaxed">
          Files are read in your browser. A pasted link is fetched by your browser too, straight
          from the host.
        </p>
      </div>
    </div>
  );
}
