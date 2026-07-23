import { Link } from "@tanstack/react-router";
import { SiGithub } from "@icons-pack/react-simple-icons";

import { LogoMark } from "./logo-mark";

type TopBarProps = {
  onStartOver: () => void;
};

const navLink =
  "font-display text-ink-muted hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-background rounded-sm px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

// Identity + global nav only. Result-scoped actions (adjust, start over) live
// with the result in ResultView, not here — the header stays the same in every
// phase so nothing crowds it on narrow viewports.
export function TopBar({ onStartOver }: TopBarProps) {
  return (
    <header className="z-sticky sticky top-0 border-b border-[oklch(var(--hairline))] bg-[oklch(var(--background)/0.82)] backdrop-blur-[10px]">
      <div className="mx-auto flex h-[52px] max-w-[1180px] items-center justify-between gap-2 px-4 sm:px-6">
        <button
          type="button"
          onClick={onStartOver}
          className="focus-visible:ring-ring focus-visible:ring-offset-background group flex min-w-0 items-center gap-2.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          aria-label="FileConcat — start over"
        >
          <LogoMark size={26} />
          <span className="font-display text-ink truncate text-[18px] font-semibold tracking-[-0.01em]">
            FileConcat
          </span>
        </button>

        <nav className="flex shrink-0 items-center gap-1">
          <Link to="/docs" className={`hidden sm:inline-flex ${navLink}`}>
            Docs
          </Link>
          <a
            href="https://github.com/CeamKrier/file-concat"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-muted hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-background inline-flex h-8 w-8 items-center justify-center rounded-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            aria-label="Source on GitHub"
          >
            <SiGithub className="h-[15px] w-[15px]" />
          </a>
        </nav>
      </div>
    </header>
  );
}
