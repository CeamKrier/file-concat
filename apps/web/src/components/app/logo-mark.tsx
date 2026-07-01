import { cn } from "~/lib/utils";

/**
 * Pure-CSS brand mark: two overlapping rounded squares — a green tile top-left
 * and a cream tile bottom-right ringed in the page color so it reads on the
 * warm-dark background. No raster asset.
 */
export function LogoMark({ size = 26, className }: { size?: number; className?: string }) {
  const tile = Math.round(size * 0.62);
  const ring = Math.max(2, Math.round(size * 0.12));
  return (
    <span
      className={cn("relative inline-block shrink-0", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span
        className="absolute left-0 top-0 rounded-[5px]"
        style={{ width: tile, height: tile, background: "#7acd8e" }}
      />
      <span
        className="absolute bottom-0 right-0 rounded-[5px]"
        style={{
          width: tile,
          height: tile,
          background: "#e7e0d2",
          boxShadow: `0 0 0 ${ring}px oklch(var(--background))`,
        }}
      />
    </span>
  );
}
