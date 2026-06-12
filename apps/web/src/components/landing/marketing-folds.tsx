/* -------------------------------------------------------------------------- */
/* Audience — the recurring moment. Prose, not a persona grid: the page's     */
/* only "people" beat names the four audiences inline so reach stays broad    */
/* without dropping a SaaS-shaped 4-up into the rhythm.                       */
/* -------------------------------------------------------------------------- */

export function Audience() {
  return (
    <section>
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 md:py-28 lg:py-32">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-start lg:gap-16">
          <header className="lg:col-span-5">
            <h2
              className="font-display text-foreground text-[clamp(1.625rem,2.75vw,2.25rem)] font-semibold leading-[1.05] tracking-[-0.03em]"
              style={{ textWrap: "balance" }}
            >
              When you reach for it.
            </h2>
            <p className="text-muted-foreground mt-5 max-w-[34ch] text-[15px] leading-[1.6]">
              The moment looks the same across very different work.
            </p>
          </header>

          <div className="lg:col-span-7">
            <p
              className="text-foreground text-[15.5px] leading-[1.7]"
              style={{ textWrap: "pretty" }}
            >
              You have files scattered across folders, a clear question for the model, and no
              patience for shuttle-copying one file at a time.
            </p>
            <p
              className="text-muted-foreground mt-5 text-[15px] leading-[1.65]"
              style={{ textWrap: "pretty" }}
            >
              Whether that's a repo headed for code review, paper sections for a synthesis pass,
              markdown chapters you're editing across, or an assignment built from many files.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Privacy fold — single column, network-tab visual.                          */
/* -------------------------------------------------------------------------- */

export function PrivacyFold() {
  return (
    <section className="bg-secondary/40">
      <div className="mx-auto max-w-3xl px-4 py-28 sm:px-6 md:py-36">
        <div className="mb-12 text-center">
          <h2
            className="font-display text-foreground text-[clamp(1.875rem,3.5vw,2.75rem)] font-semibold leading-[1.02] tracking-[-0.035em]"
            style={{ textWrap: "balance" }}
          >
            Pull the plug. It keeps working.
          </h2>
          <p
            className="text-muted-foreground mx-auto mt-6 max-w-[54ch] text-[15.5px] leading-[1.6]"
            style={{ textWrap: "pretty" }}
          >
            FileConcat loads once and then runs offline. Drop files with your WiFi off. The bundle
            still comes out the other side. Here's what a fresh session looks like in the network
            panel:
          </p>
        </div>

        <NetworkPanel />

        <p className="text-muted-foreground mx-auto mt-8 max-w-[48ch] text-center text-[13.5px] leading-[1.55]">
          Open DevTools, watch the Network tab, then drop a folder. Four files at page load, then
          silence. That's the whole story.
        </p>
      </div>
    </section>
  );
}

/* DevTools-style network panel showing only the initial page load,
   then 0 outbound requests during processing. The visual sells the claim. */
function NetworkPanel() {
  const rows = [
    { name: "fileconcat.com", status: 200, type: "document", size: "3.2 KB" },
    { name: "index.css", status: 200, type: "stylesheet", size: "18.4 KB" },
    { name: "main.js", status: 200, type: "script", size: "82.1 KB" },
    { name: "tiktoken.wasm", status: 200, type: "wasm", size: "421 KB" },
  ];
  return (
    <div className="border-border bg-card overflow-hidden rounded-xl border shadow-[0_1px_0_oklch(var(--foreground)/0.04),0_24px_48px_-24px_oklch(var(--foreground)/0.18)]">
      <div className="border-border/60 bg-background/40 text-muted-foreground flex items-center gap-5 border-b px-4 py-2 font-mono text-[11px]">
        <span className="text-foreground font-medium">Network</span>
        <span>Console</span>
        <span>Sources</span>
        <span>Elements</span>
        <span className="text-primary ml-auto inline-flex items-center gap-1.5">
          <span className="bg-primary inline-block h-1.5 w-1.5 rounded-full" />
          recording
        </span>
      </div>

      <div className="border-border/40 bg-background/20 text-muted-foreground grid grid-cols-[1fr_56px_88px_76px_88px] gap-3 border-b px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.08em]">
        <span>Name</span>
        <span className="text-right">Status</span>
        <span>Type</span>
        <span className="text-right">Size</span>
        <span className="text-right">Source</span>
      </div>

      <div className="divide-border/40 divide-y">
        {rows.map((r) => (
          <div
            key={r.name}
            className="grid grid-cols-[1fr_56px_88px_76px_88px] gap-3 px-4 py-2 font-mono text-[12px]"
          >
            <span className="text-foreground truncate">{r.name}</span>
            <span className="text-foreground/70 text-right">{r.status}</span>
            <span className="text-muted-foreground">{r.type}</span>
            <span className="text-muted-foreground text-right">{r.size}</span>
            <span className="text-muted-foreground/60 text-right">page load</span>
          </div>
        ))}
      </div>

      <div className="border-border/60 bg-background/10 text-muted-foreground flex items-center gap-3 border-y border-dashed px-4 py-2 font-mono text-[11px]">
        <span className="text-foreground/60">14:02:31</span>
        <span>you drop 47 files</span>
      </div>

      <div className="px-4 py-7 text-center font-mono text-[12.5px]">
        <div className="text-foreground">
          <span className="text-primary">0</span> outbound requests
        </div>
        <div className="text-muted-foreground mt-1.5">silent. processing happens locally.</div>
      </div>
    </div>
  );
}

