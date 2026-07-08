import { Link } from "@tanstack/react-router";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { ArrowUpRight } from "lucide-react";

import { LogoMark } from "../logo-mark";

/**
 * The static site header for marketing pages (persona pages, and anywhere
 * outside the app state machine or the docs shell). Logo returns home, the
 * primary action opens the tool. The app landing keeps its own state-coupled
 * TopBar; the docs shell keeps its sidebar-toggling header.
 */
export function SiteHeader() {
  return (
    <header className="z-sticky border-hairline sticky top-0 border-b bg-[oklch(var(--background)/0.82)] backdrop-blur-[10px]">
      <div className="mx-auto flex h-[52px] max-w-[1040px] items-center justify-between px-4 sm:px-6">
        <Link
          to="/"
          className="focus-visible:ring-ring focus-visible:ring-offset-background group flex items-center gap-2.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          aria-label="FileConcat home"
        >
          <LogoMark size={26} />
          <span className="font-display text-ink text-[18px] font-semibold tracking-[-0.01em]">
            FileConcat
          </span>
        </Link>

        <nav className="flex items-center gap-1.5">
          <Link
            to="/docs"
            className="font-display text-ink-muted hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-background hidden rounded-sm px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:inline-flex"
          >
            Docs
          </Link>
          <Link
            to="/"
            className="bg-primary text-primary-foreground rounded-input focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-semibold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            Open the tool
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} />
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
