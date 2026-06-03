import BMCLogo from "~/components/bmc-logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/40">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 py-10 sm:flex-row sm:items-center sm:px-6">
        <p className="font-mono text-[12px] text-muted-foreground">
          MIT. © {new Date().getFullYear()} FileConcat.
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
    </footer>
  );
}
