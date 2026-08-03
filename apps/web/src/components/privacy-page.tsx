import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Check } from "lucide-react";

import { SiteFooter } from "~/components/app/marketing";
import { TopBar } from "~/components/app/top-bar";

const LAST_UPDATED = "August 3, 2026";

/** Items that are never uploaded to a server. Scoped to the actual file work. */
const STAYS = [
  {
    title: "Your files, and their contents.",
    body: "The documents you drop are read, filtered, and combined in this browser tab. The file bytes are never uploaded to us, or to anyone, to be processed.",
  },
  {
    title: "No third-party reads them.",
    body: "PDF, Word, Excel, and the rest are extracted in your browser. There is no server API and no CDN in the path that sees your documents.",
  },
  {
    title: "No account, no storage.",
    body: "There is no sign-up, no login, and no email. We do not keep a copy of anything you drop, because it never reaches us in the first place.",
  },
];

/** Items that do leave the browser, stated plainly with where and why. */
const COLLECTED = [
  {
    title: "Anonymous product analytics.",
    body: "We use Microsoft Clarity to see how the tool is used and fix what is confusing. Because it records on-screen activity, a session recording can include your file names, folder structure, and the on-screen preview of the combined output. It is not tied to an account or an identity.",
  },
  {
    title: "Anonymous counts, kept by us.",
    body: "So we know which formats to support next, we count things like a file type we could not read, how many files arrived at once as a range, and whether you copied or downloaded. No file names, no folder paths, no contents. Each count carries a random id that lasts for one page load, is never stored on your device, and is never reused, so nothing ties a count to you, to another visit, or to your files.",
  },
  {
    title: "Standard analytics signals.",
    body: "Country-level location, browser, and device type, plus first-party analytics cookies (_clck, _clsk).",
  },
  {
    title: "Repository imports you ask for.",
    body: "If you paste a GitHub, GitLab, or Bitbucket link, your browser fetches it directly from that host. That request goes to them, not to us.",
  },
  {
    title: "Your settings.",
    body: "Filters and preferences are saved in your browser's local storage. They stay on your device and are never sent anywhere.",
  },
];

export function PrivacyPage() {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <TopBar onStartOver={() => {}} />

      <main className="mx-auto w-full max-w-[1040px] flex-1 px-4 py-14 sm:px-6 md:py-20">
        <header className="max-w-[640px]">
          <p className="text-ink-muted font-mono text-[12px]">Privacy</p>
          <h1 className="font-display text-ink mt-3 text-balance text-[clamp(1.9rem,4.5vw,2.6rem)] font-bold leading-[1.08] tracking-[-0.025em]">
            What leaves your device, and what doesn&rsquo;t.
          </h1>
          <p className="text-ink-secondary mt-5 text-[16px] leading-relaxed">
            Most tools that read a document upload it to a server first. FileConcat does that work in
            your browser instead, so your files are never uploaded to be processed. To keep the tool
            honest, here is the full account of what stays with you, what we collect, and how to
            check it for yourself.
          </p>
        </header>

        <section
          aria-labelledby="inventory"
          className="mt-14 grid gap-x-12 gap-y-10 border-t border-[oklch(var(--hairline))] pt-12 md:grid-cols-2"
        >
          <h2 id="inventory" className="sr-only">
            What is and isn&rsquo;t sent
          </h2>

          <div className="min-w-0">
            <h3 className="text-ink font-display text-[13px] font-semibold uppercase tracking-[0.08em]">
              Never uploaded
            </h3>
            <ul className="mt-5 space-y-5">
              {STAYS.map((item) => (
                <li key={item.title} className="flex gap-3">
                  <Check className="text-primary mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} />
                  <p className="text-[14.5px] leading-relaxed">
                    <span className="text-ink font-medium">{item.title}</span>{" "}
                    <span className="text-ink-secondary">{item.body}</span>
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="min-w-0">
            <h3 className="text-ink font-display text-[13px] font-semibold uppercase tracking-[0.08em]">
              What we collect, and why
            </h3>
            <ul className="mt-5 space-y-5">
              {COLLECTED.map((item) => (
                <li key={item.title} className="flex gap-3">
                  <ArrowUpRight
                    className="text-ink-muted mt-0.5 h-4 w-4 shrink-0"
                    strokeWidth={2.5}
                  />
                  <p className="text-[14.5px] leading-relaxed">
                    <span className="text-ink font-medium">{item.title}</span>{" "}
                    <span className="text-ink-secondary">{item.body}</span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          aria-labelledby="verify"
          className="mt-12 max-w-[640px] border-t border-[oklch(var(--hairline))] pt-12"
        >
          <h2
            id="verify"
            className="font-display text-ink text-[clamp(1.4rem,3vw,1.7rem)] font-bold leading-[1.15] tracking-[-0.02em]"
          >
            Check it yourself.
          </h2>
          <p className="text-ink-secondary mt-4 text-[15px] leading-relaxed">
            Open your browser&rsquo;s network panel and drop a folder. Your documents are never
            uploaded. The requests you will see are the analytics beacon and, if you imported a repo,
            that fetch, never your files. Any content blocker stops the analytics, and the whole app
            is open source, so you can read exactly what it does.
          </p>
          <a
            href="https://github.com/CeamKrier/file-concat"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink hover:text-primary focus-visible:ring-ring focus-visible:ring-offset-background mt-5 inline-flex items-center gap-1.5 rounded-sm text-[14px] font-medium underline decoration-[oklch(var(--border-strong))] underline-offset-[3px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            Read the source on GitHub
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} />
          </a>
        </section>

        <section className="text-ink-muted mt-12 flex flex-col gap-1.5 border-t border-[oklch(var(--hairline))] pt-8 text-[13px]">
          <p>
            Questions? Message{" "}
            <a
              href="https://twitter.com/CeamKrier"
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-secondary hover:text-ink underline decoration-[oklch(var(--border-strong))] underline-offset-[3px] transition-colors duration-150"
            >
              @CeamKrier
            </a>{" "}
            on X.
          </p>
          <p className="font-mono text-[11.5px]">
            Last updated {LAST_UPDATED} ·{" "}
            <Link
              to="/"
              className="hover:text-ink underline decoration-[oklch(var(--border-strong))] underline-offset-[3px] transition-colors duration-150"
            >
              back to FileConcat
            </Link>
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
