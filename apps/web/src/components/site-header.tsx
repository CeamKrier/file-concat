import { Link } from "@tanstack/react-router";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { ThemeToggle } from "~/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="border-border/60 border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          to="/"
          className="group flex items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background rounded-sm"
          aria-label="FileConcat home"
        >
          <img src="/logo.png" alt="" aria-hidden="true" className="h-6 w-6 dark:hidden" />
          <img
            src="/dark-logo.png"
            alt=""
            aria-hidden="true"
            className="hidden h-6 w-6 dark:block"
          />
          <span className="font-display text-[15px] font-medium tracking-[-0.01em] text-foreground">
            FileConcat
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          <Link
            to="/app"
            className="hidden rounded-sm px-3 py-1.5 font-display text-[13px] font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background sm:inline-flex"
          >
            Open tool
          </Link>
          <a
            href="https://github.com/CeamKrier/file-concat"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Source on GitHub"
          >
            <SiGithub className="h-[15px] w-[15px]" />
          </a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
