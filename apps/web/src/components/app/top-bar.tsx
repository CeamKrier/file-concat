import { Link } from "@tanstack/react-router";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { SlidersHorizontal } from "lucide-react";

import { LogoMark } from "./logo-mark";

type TopBarProps = {
  view: "landing" | "processing" | "result";
  onStartOver: () => void;
  onOpenSettings?: () => void;
};

const navLink =
  "font-display text-ink-muted hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-background rounded-sm px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

export function TopBar({ view, onStartOver, onOpenSettings }: TopBarProps) {
  const isResult = view === "result";

  return (
    <header className="z-sticky sticky top-0 border-b border-[oklch(var(--hairline))] bg-[oklch(var(--background)/0.82)] backdrop-blur-[10px]">
      <div className="mx-auto flex h-[52px] max-w-[1180px] items-center justify-between px-4 sm:px-6">
        <button
          type="button"
          onClick={onStartOver}
          className="focus-visible:ring-ring focus-visible:ring-offset-background group flex items-center gap-2.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          aria-label="FileConcat — start over"
        >
          <LogoMark size={26} />
          <span className="font-display text-ink text-[18px] font-semibold tracking-[-0.01em]">
            FileConcat
          </span>
        </button>

        <nav className="flex items-center gap-1">
          {isResult && (
            <>
              <button
                type="button"
                onClick={onOpenSettings}
                className="border-border-strong bg-secondary text-ink-secondary hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-background rounded-input mr-1 inline-flex items-center gap-1.5 border px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Adjust what&apos;s included
              </button>
              <button type="button" onClick={onStartOver} className={navLink}>
                Start over
              </button>
            </>
          )}
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
