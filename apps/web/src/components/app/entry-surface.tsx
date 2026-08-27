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
 * Nothing sits under the link lane. A read-and-skip row and a per-lane privacy
 * line were both drawn here and both cut: the first was a promise about a drop
 * that had not happened yet, read at 12.5px under a field nobody was looking
 * at, and the result view already labels what it left out, after the fact,
 * where it is about real files. The second restated `/privacy`, which says it
 * better and by name ("your browser fetches it directly from that host, that
 * request goes to them, not to us"), and the footer links there from every
 * page. Two doors and the space to see them is the whole job of this panel.
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
    </div>
  );
}
