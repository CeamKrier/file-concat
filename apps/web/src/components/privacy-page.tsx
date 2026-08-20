import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Check } from "lucide-react";

import { SiteFooter } from "~/components/app/marketing";
import { TopBar } from "~/components/app/top-bar";
import { METRICS_RETENTION_DAYS } from "~/lib/metrics-retention";

const LAST_UPDATED = "August 20, 2026";

/** Items that are never uploaded to a server. Scoped to the actual file work. */
const STAYS = [
  {
    title: "Your files, and their contents.",
    body: "The documents you drop are read, filtered, and combined in this browser tab. The file bytes are never uploaded to us, or to anyone, to be processed.",
  },
  {
    title: "No third-party reads them.",
    body: "PDF, Word, Excel, and the rest are extracted in your browser. There is no server API and no upload step, so nothing outside this tab ever sees a document you dropped.",
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
    body: "We use Microsoft Clarity to see how the tool is used and fix what is confusing. Because it records on-screen activity, a session recording can include your file names, folder structure, and the on-screen preview of the combined output. We also attach a few short labels to the recording so we can find it again later: which page you opened the tool on, whether the files came from your device or a repository link, a rough size band, whether anything failed to read, and whether the result was copied, downloaded, or left behind. Those labels carry no file names and no identifier. It is not tied to an account or an identity.",
  },
  {
    title: "Anonymous counts, kept by us.",
    body: `So we know which formats to support next and where the tool struggles, we count the file types in a drop (how many of each, how many bytes, and the size of the largest file), the number of files, how long reading them took, how large the combined result was, and whether you copied or downloaded. Filenames are checked against a short published list of project files such as package.json and go.mod, and only a match is recorded. Nothing else about a filename leaves your browser, and no folder path or file content ever does. Each count carries a random id that lasts for one page load, is never stored on your device, and is never reused, so nothing ties a count to you, to another visit, or to your files. We delete these counts after ${METRICS_RETENTION_DAYS} days.`,
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
    title: "Reading a scanned page, when you drop one.",
    body: "A scanned PDF or Word file holds a picture of a page, not text, so there is nothing in the file to read. When you drop one, your browser downloads a text-recognition engine and one language file from jsDelivr, a public code CDN, and starts reading. What jsDelivr learns is what any file request tells a server: your IP address, and which file was asked for. Your document is not part of it. Recognition runs in this tab, on bytes already on your device, and the result goes nowhere but your screen. It happens only for documents that opened with no text in them, so a drop with no scan in it downloads nothing. You can stop a reading while it runs.",
  },
  {
    title: "Your settings.",
    body: "Filters and preferences are saved in your browser's local storage. They stay on your device and are never sent anywhere.",
  },
];

/** The clipper's own account. It reads pages rather than files, so none of the
 *  items above describe it. */
const CLIPPER = [
  {
    title: "It reads a page only when you ask it to.",
    body: "Nothing is read because you happened to visit it. The panel names what the page in front of you offers, and that page becomes a file when you press a button. There is no background crawling, and no record is kept of where you have been.",
  },
  {
    title: "Clippings stay in your browser until you send them.",
    body: "The tray holds the last 50 in the browser's own extension storage, on your device. Nothing in it reaches us. Removing a row or clearing the tray deletes it outright.",
  },
  {
    title: "Sending is a handoff between two things on your device.",
    body: "Send hands the files to an open FileConcat tab in the same browser. There is no upload step and no server of ours anywhere between the extension and that tab.",
  },
  {
    title: "Once they arrive, they are files like any other.",
    body: "A clipping that reaches the tool is treated exactly like a document you dropped, so everything above applies to it. That includes the session recording, which can show a clipping's file name and the on-screen preview of the combined output.",
  },
  {
    title: "Three requests, each to the site you are already on.",
    body: "Clipping a video asks YouTube for its transcript. Clipping a Reddit post from a listing asks Reddit for that post's page, the same way clicking through to it would. Clipping a Hacker News thread asks hn.algolia.com for its comments, because Hacker News blocks that request from its own page. None of the three go to us.",
  },
  {
    title: "It asks for access to all sites.",
    body: "Because any page can be an article, and the reader that finds an article's body works everywhere rather than on a list of sites we picked in advance. That permission is what makes the clip button possible on the page you are actually on. It is not what decides whether a page gets read, which is still only ever your button press.",
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

        {/* The two halves are sequential, not parallel: the promise is three short
            assertions, the accounting is six long disclosures. Setting them as
            equal columns was a grid default the content never supported — it left
            half the ledger empty beside the longer half and squeezed the
            paragraphs that most need room to 38ch at tablet width. Stacked, they
            share the one reading measure the header and the verification section
            already use. */}
        <section
          aria-labelledby="inventory"
          className="mt-14 max-w-[640px] border-t border-[oklch(var(--hairline))] pt-12"
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

          {/* Nearly three times the 20px between items. Proximity is what marks
              the turn from what stays to what goes now that no column edge does,
              and at twice the item gap the two halves still read as one run. */}
          <div className="mt-14 min-w-0">
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

        {/* The browser extension is a second surface with a different shape of
            risk: the tool reads files you hand it, the clipper reads pages you
            are already on. Folding it into the two lists above would have put
            "never uploaded" over content that never came off your disk in the
            first place, so it gets its own account. */}
        <section
          aria-labelledby="clipper"
          className="mt-12 max-w-[640px] border-t border-[oklch(var(--hairline))] pt-12"
        >
          <h2
            id="clipper"
            className="font-display text-ink text-[clamp(1.4rem,3vw,1.7rem)] font-bold leading-[1.15] tracking-[-0.02em]"
          >
            The browser extension.
          </h2>
          <p className="text-ink-secondary mt-4 text-[15px] leading-relaxed">
            FileConcat Clipper turns a page you are reading into a Markdown file and hands it to an
            open FileConcat tab. It is a separate thing to install, and everything below is true
            only if you installed it.
          </p>
          <ul className="mt-6 space-y-5">
            {CLIPPER.map((item) => (
              <li key={item.title} className="text-[14.5px] leading-relaxed">
                <span className="text-ink font-medium">{item.title}</span>{" "}
                <span className="text-ink-secondary">{item.body}</span>
              </li>
            ))}
          </ul>
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
            uploaded. The requests you will see are the analytics beacon, the repository fetch if you
            imported one, and the recognition download if a scanned page was in the drop. Never your
            files. Any content blocker stops the analytics, and the whole app is open source, so you
            can read exactly what it does.
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
