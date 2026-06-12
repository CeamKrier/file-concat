import { useCallback, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Copy } from "lucide-react";

const INSTALL_COMMAND = "npm install -g @fileconcat/cli";

/* -------------------------------------------------------------------------- */
/* Closing fold. Picks the user up at peak conviction (just after the         */
/* PrivacyFold "0 outbound requests" proof) and gives them the two clean      */
/* entry points to the same engine: web tool or terminal install. No new      */
/* claims, no pitch — the proof is already in.                                */
/* -------------------------------------------------------------------------- */
export function ClosingFold() {
  return (
    <section aria-labelledby="closing-fold-heading">
      <div className="mx-auto max-w-3xl px-4 py-28 sm:px-6 md:py-36">
        <h2
          id="closing-fold-heading"
          className="font-display text-foreground text-center text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-[1.05] tracking-[-0.03em]"
          style={{ textWrap: "balance" }}
        >
          Drop a folder. Pipe a directory. Same output.
        </h2>

        <div className="mt-12 grid gap-5 lg:grid-cols-[1.4fr_1fr] lg:items-start lg:gap-6">
          <Link
            to="/app"
            className="bg-primary font-display text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring focus-visible:ring-offset-background ease-out-quart group inline-flex h-14 items-center justify-between rounded-md px-6 text-[15px] font-medium shadow-[0_1px_0_oklch(var(--foreground)/0.06),0_10px_28px_-14px_oklch(var(--primary)/0.55)] transition-[background-color,box-shadow,transform] duration-200 hover:shadow-[0_1px_0_oklch(var(--foreground)/0.06),0_14px_36px_-12px_oklch(var(--primary)/0.7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-reduce:transition-none"
          >
            <span>Open the tool</span>
            <ArrowRight className="ease-out-quart h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />
          </Link>

          <div>
            <InstallCopy command={INSTALL_COMMAND} />
            <p className="text-muted-foreground mt-3 pl-1 font-mono text-[11.5px] leading-[1.55]">
              Then: <code className="text-foreground/80">file-concat ./your-folder</code>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function InstallCopy({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API may reject in insecure contexts; the command remains
      // selectable as text in the button.
    }
  }, [command]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Install command copied" : `Copy install command: ${command}`}
      className="border-border bg-card hover:border-foreground/30 focus-visible:ring-ring focus-visible:ring-offset-background ease-out-quart group inline-flex h-14 w-full items-center justify-between gap-3 rounded-md border px-4 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-reduce:transition-none"
    >
      <code className="text-foreground/90 truncate font-mono text-[13px]">
        <span className="text-muted-foreground/70">$ </span>
        {command}
      </code>
      <span
        aria-hidden="true"
        className="ease-out-quart text-muted-foreground group-hover:text-foreground inline-flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors duration-200 motion-reduce:transition-none"
      >
        {copied ? <Check className="text-primary h-4 w-4" /> : <Copy className="h-3.5 w-3.5" />}
      </span>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Install command copied" : ""}
      </span>
    </button>
  );
}
