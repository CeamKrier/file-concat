import { ArrowUpRight } from "lucide-react";

import { SiteFooter } from "~/components/app/marketing";
import { TopBar } from "~/components/app/top-bar";

const LAST_UPDATED = "October 5, 2026";

const linkClass =
  "text-ink hover:text-primary underline decoration-[oklch(var(--border-strong))] underline-offset-[3px] transition-colors duration-150";

const h2Class =
  "font-display text-ink text-[clamp(1.4rem,3vw,1.7rem)] font-bold leading-[1.15] tracking-[-0.02em]";

const sectionClass = "mt-12 max-w-[640px] border-t border-[oklch(var(--hairline))] pt-12";

function Out({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
      {children}
    </a>
  );
}

/**
 * Third-party notices (extraction router, R4). The full licence texts are in
 * `/third-party-notices.txt`, written at build time by
 * `scripts/build-notices.ts`. This page carries what a list of licence texts
 * cannot: the LGPL source offer and replacement note for 7-Zip, the unRAR
 * restriction, the MPL source pointer and the two attribution sentences the
 * FreeType and IJG licences ask for in documentation.
 */
export function LicensesPage() {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <TopBar onStartOver={() => {}} />
      <main className="mx-auto w-full max-w-[1040px] flex-1 px-4 py-14 sm:px-6 md:py-20">
        <header className="max-w-[640px]">
          <p className="text-ink-muted font-mono text-[12px]">Licenses</p>
          <h1 className="font-display text-ink mt-3 text-balance text-[clamp(1.9rem,4.5vw,2.6rem)] font-bold leading-[1.08] tracking-[-0.025em]">
            The open-source work inside FileConcat.
          </h1>
          <p className="text-ink-secondary mt-5 text-[16px] leading-relaxed">
            FileConcat is open source under the MIT license. The readers that open PDFs, Office
            files and archives in your browser are built from other projects, and their licenses
            travel with them. Every library and its full license text is listed in{" "}
            <a href="/third-party-notices.txt" className={linkClass}>
              third-party-notices.txt
            </a>
            . This page covers what that list cannot.
          </p>
        </header>

        <section aria-labelledby="sevenzip" className={sectionClass}>
          <h2 id="sevenzip" className={h2Class}>
            7-Zip, for 7z, RAR, bz2 and xz.
          </h2>
          <div className="text-ink-secondary mt-4 space-y-4 text-[15px] leading-relaxed">
            <p>
              Archives other than ZIP and TAR are opened by 7-Zip 24.09 by Igor Pavlov, compiled to
              WebAssembly by the 7z-wasm project. 7-Zip is licensed under the GNU Lesser General
              Public License, version 2.1 or later. A few of its files are under BSD licenses, and
              its RAR decoder also carries the unRAR license restriction below.
            </p>
            <p>
              The source code for the exact build we ship, served from this site:{" "}
              <a href="/source/7zip/7z2409-src.tar.xz" className={linkClass}>
                7z2409-src.tar.xz
              </a>{" "}
              (7-Zip 24.09, sha256 49c05169...6133a) and{" "}
              <a href="/source/7zip/7z-wasm-1.2.0-build.tar.gz" className={linkClass}>
                7z-wasm-1.2.0-build.tar.gz
              </a>
              , the patch and build scripts that turn it into WebAssembly. The same files are
              upstream at{" "}
              <Out href="https://github.com/ip7z/7zip/releases/tag/24.09">ip7z/7zip 24.09</Out> and{" "}
              <Out href="https://github.com/use-strict/7z-wasm/tree/v1.2.0">
                use-strict/7z-wasm v1.2.0
              </Out>
              . We made no changes of our own.
            </p>
            <p>
              7-Zip runs as its own file, <code className="font-mono text-[13.5px]">7zz.wasm</code>,
              separate from FileConcat's code. You may replace it with a build of your own: build
              7z-wasm from the source above and run{" "}
              <Out href="https://github.com/CeamKrier/file-concat">FileConcat from its repository</Out>{" "}
              with your file in place of the one in the <code className="font-mono text-[13.5px]">7z-wasm</code>{" "}
              package.
            </p>
            <blockquote className="border-l-2 border-[oklch(var(--hairline))] pl-4 text-[14.5px]">
              The decompression engine for RAR archives was developed using source code of unRAR
              program. All copyrights to original unRAR code are owned by Alexander Roshal. The
              unRAR sources cannot be used to re-create the RAR compression algorithm, which is
              proprietary. Distribution of modified unRAR sources in separate form or as a part of
              other software is permitted, provided that it is clearly stated in the documentation
              and source comments that the code may not be used to develop a RAR (WinRAR)
              compatible archiver.
            </blockquote>
          </div>
        </section>

        <section aria-labelledby="pdf" className={sectionClass}>
          <h2 id="pdf" className={h2Class}>
            The PDF reader.
          </h2>
          <div className="text-ink-secondary mt-4 space-y-4 text-[15px] leading-relaxed">
            <p>
              PDFs are read by LiteParse from LlamaIndex (Apache 2.0), which is built on PDFium. It
              includes resvg and usvg 0.44.0 under the Mozilla Public License 2.0, unmodified; their
              source is at{" "}
              <Out href="https://github.com/linebender/resvg/tree/v0.44.0">
                linebender/resvg v0.44.0
              </Out>
              .
            </p>
            <p>
              Portions of this software are copyright (c) 2026 The FreeType Project
              (www.freetype.org). All rights reserved.
            </p>
            <p>This software is based in part on the work of the Independent JPEG Group.</p>
          </div>
        </section>

        <section aria-labelledby="rest" className={sectionClass}>
          <h2 id="rest" className={h2Class}>
            Everything else.
          </h2>
          <p className="text-ink-secondary mt-4 text-[15px] leading-relaxed">
            Office files are read by anydoc from Firecrawl (MIT), and the rest of the app uses npm
            packages under permissive licenses. All of them, with their license texts, are in the
            notices file, which is rebuilt from the shipped code on every release.
          </p>
          <a
            href="/third-party-notices.txt"
            className="text-ink hover:text-primary focus-visible:ring-ring focus-visible:ring-offset-background mt-5 inline-flex items-center gap-1.5 rounded-sm text-[14px] font-medium underline decoration-[oklch(var(--border-strong))] underline-offset-[3px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            Read the full notices
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} />
          </a>
        </section>

        <p className="text-ink-muted mt-12 border-t border-[oklch(var(--hairline))] pt-8 font-mono text-[11.5px]">
          Last updated {LAST_UPDATED}
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
