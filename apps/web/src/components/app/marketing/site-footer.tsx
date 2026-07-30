import { Link } from "@tanstack/react-router";
import { SiGithub, SiNpm } from "@icons-pack/react-simple-icons";

import BMCLogo from "~/components/bmc-logo";
import { hasPublishedPosts } from "~/lib/blog";
import { DOCS_NAVIGATION } from "~/lib/docs-nav";
import { LogoMark } from "../logo-mark";

const docLinks = DOCS_NAVIGATION.flatMap((section) => section.links);

const linkClass =
  "text-ink-muted hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center gap-1.5 rounded-sm text-[13px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

export function SiteFooter() {
  return (
    <footer className="border-hairline border-t">
      <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-10 px-4 py-12 sm:px-6 md:flex-row md:items-start md:justify-between md:gap-12">
        <div className="max-w-[36ch] space-y-3">
          <span className="inline-flex items-center gap-2.5">
            <LogoMark size={24} />
            <span className="font-display text-ink text-[15px] font-semibold tracking-[-0.01em]">
              FileConcat
            </span>
          </span>
          <p className="text-ink-muted text-[13px] leading-relaxed">
            Drop a folder, get one file ChatGPT, Claude, or Gemini can read. Runs in your browser.
          </p>
        </div>

        <nav
          aria-label="Footer"
          className="font-display flex flex-wrap gap-x-12 gap-y-8 sm:gap-x-16"
        >
          <div className="flex flex-col items-start gap-3">
            <h2 className="text-ink text-[12.5px] font-semibold">Documentation</h2>
            {docLinks.map((link) => (
              <Link key={link.href} to={link.href} className={linkClass}>
                {link.title}
              </Link>
            ))}
          </div>

          <div className="flex flex-col items-start gap-3">
            <h2 className="text-ink text-[12.5px] font-semibold">Explore</h2>

            {hasPublishedPosts() && (
              <Link to="/blog" className={linkClass}>
                Blog
              </Link>
            )}
            <Link to="/how-to/share-all-files-with-ai" className={linkClass}>
              Share all your files with AI
            </Link>
            <Link to="/for/legal" className={linkClass}>
              For lawyers
            </Link>
            <Link to="/for/researchers" className={linkClass}>
              For researchers
            </Link>
          </div>

          <div className="flex flex-col items-start gap-3">
            <h2 className="text-ink text-[12.5px] font-semibold">Open source</h2>
            <a
              href="https://github.com/CeamKrier/file-concat"
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              <SiGithub className="h-3.5 w-3.5" />
              GitHub
            </a>
            <a
              href="https://www.npmjs.com/package/@fileconcat/cli"
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              <SiNpm className="h-3.5 w-3.5" />
              CLI on npm
            </a>
          </div>
        </nav>
      </div>

      <div className="border-hairline border-t">
        <div className="mx-auto flex w-full max-w-[1040px] flex-col items-start justify-between gap-3 px-4 py-5 sm:flex-row sm:items-center sm:px-6">
          <p className="text-ink-muted font-mono text-[11.5px]">
            MIT · © {new Date().getFullYear()} FileConcat · built by{" "}
            <a
              href="https://twitter.com/CeamKrier"
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink decoration-primary/40 underline decoration-1 underline-offset-[3px] transition-colors duration-150 hover:decoration-[oklch(var(--primary))]"
            >
              @CeamKrier
            </a>
          </p>
          <a
            href="https://buymeacoffee.com/ceamkrier"
            target="_blank"
            rel="noopener noreferrer"
            className="border-border bg-surface text-ink-muted hover:border-border-strong hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-background rounded-input font-display inline-flex items-center gap-2 border px-3 py-1.5 text-[12.5px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
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
