import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { ArrowRight, Upload } from "lucide-react";

import { SiteHeader } from "~/components/site-header";
import { SiteFooter } from "~/components/site-footer";
import { useStagedFiles, type StagedEntry } from "~/components/staged-files-provider";
import { generateSEOMeta } from "~/lib/seo";
import { estimateTokenCount } from "~/utils";

const CLI_ENABLED = false;

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        title: "FileConcat. Combine files for any AI.",
        description:
          "Drop a folder, get a single structured file ChatGPT, Claude, and Gemini can read. Runs entirely in your browser.",
        url: "https://fileconcat.com",
      }),
      {
        name: "keywords",
        content:
          "file concat, combine files, LLM, ChatGPT, Claude, Gemini, AI assistant, code sharing, GitHub import, token counter",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com" }],
  }),
});

type DropState =
  | { kind: "idle" }
  | { kind: "dragOver" }
  | { kind: "processing"; message: string }
  | { kind: "staged"; entries: StagedEntry[]; tokens: number; totalBytes: number }
  | { kind: "error"; message: string };

const MAX_INLINE_BYTES = 1 * 1024 * 1024;

function LandingPage() {
  return (
    <div className="bg-background flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <OutputPreview />
        <PrivacyFold />
        {CLI_ENABLED ? <CLIFold /> : null}
      </main>
      <SiteFooter />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Fold 1 — Hero with live drop zone                                          */
/* -------------------------------------------------------------------------- */

function Hero() {
  const navigate = useNavigate();
  const { stage } = useStagedFiles();
  const [state, setState] = useState<DropState>({ kind: "idle" });
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const collectFromEntries = useCallback(async (items: DataTransferItemList) => {
    const collected: StagedEntry[] = [];
    const walk = async (entry: FileSystemEntry, basePath = ""): Promise<void> => {
      if (entry.isFile) {
        const fileEntry = entry as FileSystemFileEntry;
        await new Promise<void>((resolve) => {
          fileEntry.file(
            async (file) => {
              const fullPath = basePath ? `${basePath}/${file.name}` : file.name;
              try {
                const content = await file.text();
                collected.push({ file, path: fullPath, content });
              } catch {
                // skip unreadable
              }
              resolve();
            },
            () => resolve(),
          );
        });
      } else if (entry.isDirectory) {
        const dirEntry = entry as FileSystemDirectoryEntry;
        const newPath = basePath ? `${basePath}/${dirEntry.name}` : dirEntry.name;
        const reader = dirEntry.createReader();
        const readBatch = (): Promise<FileSystemEntry[]> =>
          new Promise((resolve) => reader.readEntries((entries) => resolve(entries)));
        let batch = await readBatch();
        while (batch.length > 0) {
          await Promise.all(batch.map((child) => walk(child, newPath)));
          batch = await readBatch();
        }
      }
    };
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry();
      if (entry) await walk(entry);
    }
    return collected;
  }, []);

  const collectFromFileList = useCallback(async (fileList: FileList): Promise<StagedEntry[]> => {
    const collected: StagedEntry[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      try {
        const content = await file.text();
        collected.push({
          file,
          path: file.webkitRelativePath || file.name,
          content,
        });
      } catch {
        // skip unreadable
      }
    }
    return collected;
  }, []);

  const finishCollection = useCallback(async (entries: StagedEntry[]) => {
    if (entries.length === 0) {
      setState({
        kind: "error",
        message: "Nothing readable was dropped. Try a folder of source files.",
      });
      return;
    }
    const combined = entries.map((e) => e.content).join("\n");
    const totalBytes = new TextEncoder().encode(combined).length;
    let tokens = 0;
    if (totalBytes <= MAX_INLINE_BYTES) {
      try {
        tokens = await estimateTokenCount(combined);
      } catch {
        tokens = Math.ceil(totalBytes / 4);
      }
    } else {
      tokens = Math.ceil(totalBytes / 4);
    }
    setState({ kind: "staged", entries, tokens, totalBytes });
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setState({ kind: "processing", message: "Reading files…" });
      try {
        const collected = await collectFromEntries(e.dataTransfer.items);
        await finishCollection(collected);
      } catch {
        setState({
          kind: "error",
          message: "Couldn't read those files. Open the tool and try again.",
        });
      }
    },
    [collectFromEntries, finishCollection],
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (dragCounter.current === 1) setState((s) => (s.kind === "idle" ? { kind: "dragOver" } : s));
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setState((s) => (s.kind === "dragOver" ? { kind: "idle" } : s));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      setState({ kind: "processing", message: "Reading files…" });
      const collected = await collectFromFileList(e.target.files);
      e.target.value = "";
      await finishCollection(collected);
    },
    [collectFromFileList, finishCollection],
  );

  const handleContinue = useCallback(() => {
    if (state.kind !== "staged") return;
    stage(state.entries);
    navigate({ to: "/app" });
  }, [navigate, stage, state]);

  const handleReset = useCallback(() => {
    setState({ kind: "idle" });
  }, []);

  return (
    <section className="relative isolate overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-32 -z-10 mx-auto h-[480px] max-w-5xl opacity-[0.08]"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 30%, oklch(var(--primary)) 0%, transparent 70%)",
        }}
      />
      <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-24 pt-20 sm:px-6 sm:pt-28 md:pb-32 md:pt-36 lg:grid-cols-12 lg:gap-16">
        {/* Left column: copy + CTA */}
        <div className="lg:col-span-5 lg:pt-2">
          <div className="text-muted-foreground mb-7 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em]">
            <span aria-hidden="true" className="bg-foreground/40 inline-block h-px w-6" />
            privacy-first
          </div>
          <h1
            className="font-display text-foreground text-[clamp(2.25rem,5vw,4rem)] font-bold leading-[1] tracking-[-0.04em]"
            style={{ textWrap: "balance" }}
          >
            Bundle files into one LLM&#8209;ready blob.
          </h1>
          <p className="text-muted-foreground mt-7 max-w-[36ch] text-[15.5px] leading-[1.6] sm:text-[16px]">
            Drop a folder, get a single structured file that ChatGPT, Claude, and Gemini can read.
            Runs entirely in your browser.
          </p>

          {/* Prominent CTA pair */}
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              to="/app"
              className="bg-primary font-display text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring focus-visible:ring-offset-background group inline-flex h-11 items-center gap-2 rounded-md px-5 text-[14px] font-medium shadow-[0_1px_0_oklch(var(--foreground)/0.06),0_8px_24px_-12px_oklch(var(--primary)/0.55)] transition-[background-color,box-shadow,transform] duration-150 hover:shadow-[0_1px_0_oklch(var(--foreground)/0.06),0_10px_28px_-10px_oklch(var(--primary)/0.65)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-reduce:transition-none"
            >
              Open the tool
              <ArrowRight className="ease-out-quart h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />
            </Link>
            <Link
              to="/docs"
              className="border-border bg-background font-display text-foreground hover:border-foreground/40 hover:bg-secondary focus-visible:ring-ring focus-visible:ring-offset-background inline-flex h-11 items-center gap-2 rounded-md border px-4 text-[14px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              Read the docs
            </Link>
          </div>

          <div className="text-muted-foreground mt-10 flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono text-[12.5px]">
            <span className="text-foreground inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="bg-primary inline-block h-1.5 w-1.5 rounded-full"
              />
              <span>no upload</span>
            </span>
            <span>no account</span>
            <span>no server</span>
            <span>no telemetry</span>
          </div>
        </div>

        {/* Right column: live drop zone */}
        <div className="lg:col-span-7">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileInput}
          />
          <input
            ref={folderInputRef}
            type="file"
            webkitdirectory=""
            directory=""
            multiple
            className="hidden"
            onChange={handleFileInput}
          />

          <DropZone
            state={state}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onBrowseFiles={() => fileInputRef.current?.click()}
            onBrowseFolder={() => folderInputRef.current?.click()}
            onContinue={handleContinue}
            onReset={handleReset}
          />
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* DropZone                                                                   */
/* -------------------------------------------------------------------------- */

type DropZoneProps = {
  state: DropState;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onBrowseFiles: () => void;
  onBrowseFolder: () => void;
  onContinue: () => void;
  onReset: () => void;
};

function DropZone({
  state,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onBrowseFiles,
  onBrowseFolder,
  onContinue,
  onReset,
}: DropZoneProps) {
  if (state.kind === "staged") {
    return <StagedSummary state={state} onContinue={onContinue} onReset={onReset} />;
  }
  const isDragOver = state.kind === "dragOver";
  const isProcessing = state.kind === "processing";

  return (
    <div
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      data-state={state.kind}
      className={[
        "group relative flex h-[400px] flex-col items-center justify-center overflow-hidden rounded-2xl",
        "bg-card border-2 text-center",
        "shadow-[0_1px_0_oklch(var(--foreground)/0.04),0_24px_60px_-32px_oklch(var(--foreground)/0.18)]",
        "ease-out-quart transition-[border-color,background-color,box-shadow,transform] duration-300",
        isDragOver
          ? "border-primary bg-primary/[0.05] shadow-[0_1px_0_oklch(var(--foreground)/0.04),0_32px_80px_-32px_oklch(var(--primary)/0.35)]"
          : "border-border hover:border-foreground/25 border-dashed",
        "motion-reduce:transition-none",
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className={[
          "absolute left-5 top-5 font-mono text-[11px] uppercase tracking-[0.1em]",
          "ease-out-quart transition-colors duration-300 motion-reduce:transition-none",
          isDragOver ? "text-primary" : "text-muted-foreground/70",
        ].join(" ")}
      >
        <span className="inline-block h-1.5 w-1.5 translate-y-[-1px] rounded-full bg-current align-middle" />
        <span className="ml-2">drop zone</span>
      </span>

      <div className="flex flex-col items-center px-6 sm:px-10">
        <div
          className={[
            "mb-6 inline-flex h-14 w-14 items-center justify-center rounded-full",
            "ease-out-quart transition-colors duration-300 motion-reduce:transition-none",
            isDragOver ? "bg-primary/10" : "bg-secondary",
          ].join(" ")}
        >
          <Upload
            aria-hidden="true"
            className={[
              "ease-out-quart h-6 w-6 transition-colors duration-300 motion-reduce:transition-none",
              isDragOver ? "text-primary" : "text-foreground/70",
            ].join(" ")}
          />
        </div>
        <p className="font-display text-foreground text-xl font-semibold tracking-[-0.015em]">
          {isProcessing ? state.message : isDragOver ? "Drop to stage" : "Drop files or a folder"}
        </p>
        <p className="text-muted-foreground mt-2.5 max-w-[34ch] text-[14px] leading-relaxed">
          Code, docs, configs. Binaries and lockfiles are skipped automatically.
        </p>

        {!isProcessing && (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={onBrowseFiles}
              className="border-border bg-background font-display text-foreground hover:border-foreground/40 hover:bg-secondary focus-visible:ring-ring focus-visible:ring-offset-background inline-flex h-10 items-center justify-center rounded-md border px-4 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              Browse files
            </button>
            <button
              type="button"
              onClick={onBrowseFolder}
              className="border-border bg-background font-display text-foreground hover:border-foreground/40 hover:bg-secondary focus-visible:ring-ring focus-visible:ring-offset-background inline-flex h-10 items-center justify-center rounded-md border px-4 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              Browse folder
            </button>
          </div>
        )}
      </div>

      <div className="text-muted-foreground/70 absolute inset-x-0 bottom-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-6 font-mono text-[11px] tracking-wide">
        {[".ts", ".tsx", ".py", ".md", ".json", ".css", ".go", ".rs", ".sql", "+86"].map(
          (ext, i) => (
            <span key={ext} className={i === 9 ? "text-foreground/50" : ""}>
              {ext}
            </span>
          ),
        )}
      </div>

      {state.kind === "error" && (
        <p
          role="alert"
          className="text-destructive absolute -bottom-12 left-0 right-0 text-center font-mono text-[12px]"
        >
          {state.message}
        </p>
      )}
    </div>
  );
}

function StagedSummary({
  state,
  onContinue,
  onReset,
}: {
  state: Extract<DropState, { kind: "staged" }>;
  onContinue: () => void;
  onReset: () => void;
}) {
  const fileCount = state.entries.length;
  const tokens = state.tokens.toLocaleString();
  const sizeKb = (state.totalBytes / 1024).toFixed(0);

  return (
    <div className="border-border bg-card flex h-[400px] flex-col justify-between rounded-2xl border-2 p-7 shadow-[0_1px_0_oklch(var(--foreground)/0.04),0_24px_60px_-32px_oklch(var(--primary)/0.25)] sm:p-8">
      <div className="space-y-6">
        <div className="text-primary flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em]">
          <span className="bg-primary inline-block h-1.5 w-1.5 rounded-full" />
          Staged
        </div>
        <div className="space-y-3">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-foreground text-4xl font-semibold tracking-[-0.03em]">
              {fileCount}
            </span>
            <span className="font-display text-muted-foreground text-base">
              file{fileCount === 1 ? "" : "s"}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-[12.5px]">
            <div>
              <dt className="text-muted-foreground">tokens</dt>
              <dd className="text-foreground">≈ {tokens}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">size</dt>
              <dd className="text-foreground">{sizeKb} KB</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onContinue}
          className="bg-primary font-display text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring focus-visible:ring-offset-background group inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md px-5 text-sm font-medium transition-[background-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-reduce:transition-none"
        >
          Continue in tool
          <ArrowRight className="ease-out-quart h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </button>
        <button
          type="button"
          onClick={onReset}
          className="border-border bg-background font-display text-muted-foreground hover:border-foreground/40 hover:text-foreground focus-visible:ring-ring focus-visible:ring-offset-background inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Start over
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Fold 2 — Output preview                                                    */
/* -------------------------------------------------------------------------- */

function OutputPreview() {
  return (
    <section className="bg-secondary/40">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-24 sm:px-6 md:py-32 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <h2
            className="font-display text-foreground text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-[1.05] tracking-[-0.03em]"
            style={{ textWrap: "balance" }}
          >
            What the model receives.
          </h2>
          <p className="text-muted-foreground mt-6 max-w-[40ch] text-[15.5px] leading-[1.6]">
            Files arrive wrapped, tagged, and ordered for parsing. The model gets the file tree
            first, then each file in a labeled block with its language and path. It navigates the
            bundle the way you'd navigate the repo.
          </p>
          <ul className="mt-9 space-y-5 text-[14px]">
            <PreviewBullet
              kicker="tree"
              body="One ASCII map at the top so the model knows what it's reading before any file body."
            />
            <PreviewBullet
              kicker="tags"
              body={
                <>
                  Each file wrapped in{" "}
                  <code className="text-foreground font-mono text-[12.5px]">&lt;file path&gt;</code>{" "}
                  so references stay unambiguous.
                </>
              }
            />
            <PreviewBullet
              kicker="fences"
              body="Language-typed code fences. Syntax highlighting carries through to whatever renders the response."
            />
          </ul>
        </div>

        <div className="lg:col-span-7">
          <SamplePreview />
        </div>
      </div>
    </section>
  );
}

function PreviewBullet({ kicker, body }: { kicker: string; body: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[80px_1fr] gap-x-5 gap-y-1">
      <span className="text-primary pt-1 font-mono text-[10.5px] uppercase tracking-[0.14em]">
        {kicker}
      </span>
      <span className="text-muted-foreground leading-[1.55]">{body}</span>
    </li>
  );
}

function SamplePreview() {
  return (
    <div className="border-border bg-background overflow-hidden rounded-xl border shadow-[0_1px_0_oklch(var(--foreground)/0.04),0_24px_48px_-24px_oklch(var(--foreground)/0.18)]">
      <div className="border-border/60 bg-card flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="bg-foreground/20 inline-block h-2 w-2 rounded-full" />
          <span className="bg-foreground/20 inline-block h-2 w-2 rounded-full" />
          <span className="bg-foreground/20 inline-block h-2 w-2 rounded-full" />
          <span className="text-muted-foreground ml-3 font-mono text-[12px]">
            fileconcat-output.txt
          </span>
        </div>
        <span className="text-muted-foreground font-mono text-[11px]">
          <span className="text-primary">≈ 412</span> tokens
        </span>
      </div>

      <div className="grid grid-cols-[40px_1fr] font-mono text-[12.5px] leading-[1.7]">
        <div
          aria-hidden="true"
          className="border-border/40 bg-card/50 text-muted-foreground/60 select-none border-r py-4 pr-3 text-right"
        >
          {Array.from({ length: 21 }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <pre className="text-foreground/90 overflow-x-auto py-4 pl-5 pr-5">
          <code>
            <span className="text-muted-foreground/80">
              {`# Project Structure\n`}
              {`\`\`\`\n`}
              {`└── app/\n`}
              {`    ├── hooks/use-theme.ts\n`}
              {`    ├── components/button.tsx\n`}
              {`    └── README.md\n`}
              {`\`\`\`\n`}
            </span>
            {`\n`}
            <span className="text-muted-foreground/80">{`# File Contents\n`}</span>
            {`\n`}
            <span className="text-primary">{`<file `}</span>
            <span className="text-foreground/70">{`path=`}</span>
            <span className="text-primary/90">{`"app/hooks/use-theme.ts"`}</span>
            <span className="text-primary">{`>\n`}</span>
            <span className="text-muted-foreground/70">{`\`\`\`typescript\n`}</span>
            <span className="text-foreground/70">{`import`}</span>
            {` { useEffect, useState } `}
            <span className="text-foreground/70">{`from`}</span>{" "}
            <span className="text-primary/90">{`"react"`}</span>
            {`;\n\n`}
            <span className="text-foreground/70">{`export function`}</span>{" "}
            <span className="font-medium">{`useTheme`}</span>
            {`() {\n  `}
            <span className="text-foreground/70">{`const`}</span>
            {` [theme, setTheme] = `}
            <span className="font-medium">{`useState`}</span>
            {`(`}
            <span className="text-primary/90">{`"light"`}</span>
            {`);\n  `}
            <span className="text-foreground/70">{`return`}</span>
            {` { theme, setTheme };\n}\n`}
            <span className="text-muted-foreground/70">{`\`\`\`\n`}</span>
            <span className="text-primary">{`</file>`}</span>
          </code>
        </pre>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Fold 3 — Privacy as behavior. Single column, network-tab visual.           */
/* -------------------------------------------------------------------------- */

function PrivacyFold() {
  return (
    <section>
      <div className="mx-auto max-w-3xl px-4 py-32 sm:px-6 md:py-40">
        <div className="mb-12 text-center">
          <div className="text-muted-foreground mb-6 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em]">
            <span aria-hidden="true" className="bg-foreground/40 inline-block h-px w-6" />
            verified, not claimed
          </div>
          <h2
            className="font-display text-foreground text-[clamp(1.875rem,3.5vw,2.75rem)] font-semibold leading-[1.02] tracking-[-0.035em]"
            style={{ textWrap: "balance" }}
          >
            Your files don&apos;t leave your browser.
          </h2>
          <p
            className="text-muted-foreground mx-auto mt-7 max-w-[52ch] text-[15.5px] leading-[1.6]"
            style={{ textWrap: "pretty" }}
          >
            FileConcat runs in this tab. Open the network panel before you drop anything — after the
            page loads, nothing else goes out.
          </p>
        </div>

        <NetworkPanel />
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
      {/* Panel tabs row */}
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

      {/* Column headers */}
      <div className="border-border/40 bg-background/20 text-muted-foreground grid grid-cols-[1fr_56px_88px_76px_88px] gap-3 border-b px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.08em]">
        <span>Name</span>
        <span className="text-right">Status</span>
        <span>Type</span>
        <span className="text-right">Size</span>
        <span className="text-right">Source</span>
      </div>

      {/* Initial load rows */}
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

      {/* Separator with timestamp */}
      <div className="border-border/60 bg-background/10 text-muted-foreground flex items-center gap-3 border-y border-dashed px-4 py-2 font-mono text-[11px]">
        <span className="text-foreground/60">14:02:31</span>
        <span>— you drop 47 files —</span>
      </div>

      {/* Activity-after-drop row */}
      <div className="px-4 py-7 text-center font-mono text-[12.5px]">
        <div className="text-foreground">
          <span className="text-primary">0</span> outbound requests
        </div>
        <div className="text-muted-foreground mt-1.5">silent. processing happens locally.</div>
      </div>

      {/* Footer caption */}
      <div className="border-border/40 bg-background/20 text-muted-foreground/80 border-t px-4 py-2.5 text-center font-mono text-[10.5px] uppercase tracking-[0.1em]">
        try it: F12 → Network → Drop a folder
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Fold 4 — CLI (feature-flagged off until npm publish)                       */
/* -------------------------------------------------------------------------- */

function CLIFold() {
  return (
    <section className="bg-secondary/40">
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 md:py-24">
        <h2 className="font-display text-foreground text-[clamp(1.5rem,2.5vw,2rem)] font-semibold tracking-[-0.03em]">
          Coming to the terminal.
        </h2>
        <p className="text-muted-foreground mx-auto mt-4 max-w-[52ch] text-[15px] leading-[1.6]">
          A CLI sharing the same engine is in progress. Watch the repo for the first publish.
        </p>
      </div>
    </section>
  );
}
