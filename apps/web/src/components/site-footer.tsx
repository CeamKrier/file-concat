import { Link } from "@tanstack/react-router";
import { SiGithub } from "@icons-pack/react-simple-icons";

import BMCLogo from "~/components/bmc-logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-start md:justify-between md:gap-12 md:py-14">
        <div className="space-y-3">
          <Link
            to="/"
            className="group inline-flex items-center gap-2.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
            aria-label="FileConcat home"
          >
            <img src="/logo.png" alt="" aria-hidden="true" className="h-5 w-5 dark:hidden" />
            <img
              src="/dark-logo.png"
              alt=""
              aria-hidden="true"
              className="hidden h-5 w-5 dark:block"
            />
            <span className="font-display text-[14px] font-medium tracking-[-0.01em] text-foreground">
              FileConcat
            </span>
          </Link>
          <p className="max-w-[36ch] text-[13px] leading-[1.55] text-muted-foreground">
            Drop a folder, get one file ChatGPT, Claude, or Gemini can read. Runs in your browser.
          </p>
        </div>

        <nav
          aria-label="Footer"
          className="grid grid-cols-2 gap-x-10 gap-y-3 font-display text-[13px] sm:grid-cols-3"
        >
          <Link
            to="/app"
            className="text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-4"
          >
            Open tool
          </Link>
          <Link
            to="/docs"
            className="text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-4"
          >
            Docs
          </Link>
          <a
            href="https://github.com/CeamKrier/file-concat"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-4"
          >
            <SiGithub className="h-3.5 w-3.5" aria-hidden="true" />
            <span>GitHub</span>
          </a>
        </nav>
      </div>

      <div className="border-t border-border/40">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-4 py-5 sm:flex-row sm:items-center sm:px-6">
          <p className="font-mono text-[11.5px] text-muted-foreground">
            MIT · © {new Date().getFullYear()} FileConcat · built by{" "}
            <a
              href="https://twitter.com/CeamKrier"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline decoration-primary/40 decoration-1 underline-offset-[3px] transition-colors duration-150 hover:decoration-primary"
            >
              @CeamKrier
            </a>
          </p>
          <a
            href="https://buymeacoffee.com/ceamkrier"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 font-display text-[12.5px] font-medium text-muted-foreground transition-colors duration-150 hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Support FileConcat on Buy Me a Coffee"
          >
            <BMCLogo />
            <span>Support</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
