import { ShieldCheck } from "lucide-react";

import { MarketingSection } from "./section";

const PAGE_LOADS = [
  { name: "/", type: "document" },
  { name: "app.js", type: "script" },
  { name: "styles.css", type: "stylesheet" },
  { name: "tiktoken.wasm", type: "wasm" },
];

/** Section C: privacy shown by behavior, via a mock of the browser network panel. */
export function PrivacySection() {
  return (
    <MarketingSection
      labelledBy="private-by-design"
      className="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16"
    >
      <div className="min-w-0">
        <h2
          id="private-by-design"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          Nothing leaves your browser.
        </h2>
        <p className="text-ink-secondary mt-4 max-w-[46ch] text-[15px] leading-relaxed">
          Drag a folder in and it gets read, filtered, and counted right here on the page. No
          upload, no server, no account. Open your own network panel and watch: once the page has
          loaded, dropping files sends nothing.
        </p>
        <p className="text-go-fg mt-5 inline-flex items-center gap-2 font-mono text-[12.5px]">
          <ShieldCheck className="text-primary h-4 w-4 shrink-0" strokeWidth={2} />0 outbound
          requests · everything runs locally
        </p>
      </div>

      <div className="min-w-0">
        <div className="border-border bg-surface-inset rounded-card overflow-hidden border">
          <div className="border-hairline flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-ink-muted font-mono text-[11.5px] uppercase tracking-[0.14em]">
              Network
            </span>
            <span className="text-ink-faint font-mono text-[11px]">4 requests · 1 document</span>
          </div>

          <ul className="divide-hairline divide-y font-mono text-[12px]">
            {PAGE_LOADS.map((req) => (
              <li key={req.name} className="flex items-center gap-3 px-4 py-2">
                <span className="text-ink-faint w-9 shrink-0">GET</span>
                <span className="text-code min-w-0 flex-1 truncate">{req.name}</span>
                <span className="text-go-fg shrink-0">200</span>
                <span className="text-ink-faint w-20 shrink-0 text-right">{req.type}</span>
              </li>
            ))}
            <li className="flex items-center gap-3 bg-[oklch(var(--primary)/0.06)] px-4 py-2.5">
              <span className="bg-primary h-1.5 w-1.5 shrink-0 rounded-full" />
              <span className="text-ink min-w-0 flex-1 truncate">you drop 40 files</span>
              <span className="text-go-fg shrink-0 text-right">nothing sent</span>
            </li>
          </ul>
        </div>
      </div>
    </MarketingSection>
  );
}
