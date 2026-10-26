import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The result screen links to /clipper. A router is not what is under test here.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { ScanText } from "lucide-react";

import { ResultView } from "~/components/app/result-view";
import { weighBundle } from "~/lib/bundle-weight";
import type { PrunedAtDoor } from "~/lib/prune-at-door";

const model = { name: "Claude Sonnet 4.5", contextLimit: 200_000, inputCost: 3 };

/** Everything the screen needs that this file is not about. */
function props(overrides: Partial<Parameters<typeof ResultView>[0]> = {}) {
  return {
    sourceLabel: "extension (folder)",
    filesCombined: 47,
    totalFiles: 65,
    tokens: 100_000,
    noiseFiles: [],
    outputStyle: "xml" as const,
    onOutputStyleChange: vi.fn(),
    isCopied: false,
    isGenerating: false,
    onCopy: vi.fn(),
    onDownload: vi.fn(),
    onStartOver: vi.fn(),
    onAddFiles: vi.fn(),
    previewText: "<codebase></codebase>",
    unsupported: [],
    archiveReads: [],
    skippedByDefault: [],
    flaggedFiles: [],
    extractedFiles: [],
    partialDocuments: [],
    scannedDocumentCount: 0,
    imageCount: 0,
    recognisedImages: 0,
    mediaCount: 0,
    recognisedMedia: 0,
    isReading: false,
    reading: { isReading: false, progress: null, isStopping: false, onStop: vi.fn() },
    recoveredDocuments: 0,
    stoppedReading: false,
    readLanguageNote: null,
    onCheckReading: vi.fn(),
    onAdjust: vi.fn(),
    onChangeModel: vi.fn(),
    bigBundle: false,
    weight: weighBundle({ files: [], tokens: 100_000, model }),
    splitMode: "single" as const,
    onSplitModeChange: vi.fn(),
    ...overrides,
  };
}

function openLedger() {
  fireEvent.click(screen.getByRole("button", { name: /What happened to your files/ }));
}

/**
 * What the door did, said on the ledger. A project with 2,700 files of build
 * output read "47 of 65" and nothing else, and the same folder dropped by
 * itself read in full: two facts the screen never stated, so the two results
 * looked like two different tools.
 */
describe("the door on the ledger", () => {
  it("names the folders and files that were never opened, with the remedy", () => {
    const pruned: PrunedAtDoor = {
      dirs: [".output", "node_modules"],
      exts: new Map([
        ["woff2", { n: 24 }],
        ["mp4", { n: 1 }],
      ]),
      count: 27,
      roots: [],
    };
    render(<ResultView {...props({ pruned })} />);
    openLedger();

    expect(
      screen.getByText(".output/, node_modules/ and 25 files were never opened."),
    ).toBeInTheDocument();
    expect(screen.getByText(/drop it by itself/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Which ones" }));
    expect(screen.getByText(".output/")).toBeInTheDocument();
    expect(screen.getByText(".woff2")).toBeInTheDocument();
    expect(screen.getByText("24 files, never read")).toBeInTheDocument();
  });

  it("says a dropped root the defaults name was read by choice", () => {
    const pruned: PrunedAtDoor = { dirs: [], exts: new Map(), count: 0, roots: [".output"] };
    render(<ResultView {...props({ pruned })} />);
    openLedger();

    expect(
      screen.getByText(
        ".output was read because you dropped it, though inside a project it is skipped.",
      ),
    ).toBeInTheDocument();
    // Nothing was turned away, so the other row stays out.
    expect(screen.queryByText(/turned away before they are read/)).not.toBeInTheDocument();
  });

  it("counts past three folders instead of listing them", () => {
    const pruned: PrunedAtDoor = {
      dirs: ["dist", "build", "coverage", ".venv"],
      exts: new Map(),
      count: 4,
      roots: [],
    };
    render(<ResultView {...props({ pruned })} />);
    openLedger();
    expect(screen.getByText("4 folders were never opened.")).toBeInTheDocument();
  });

  it("stays silent, and keeps the clean sentence, when nothing was pruned", () => {
    render(<ResultView {...props({ pruned: null, filesCombined: 3, totalFiles: 3 })} />);
    expect(screen.getByText(/All 3 files came through whole/)).toBeInTheDocument();
  });
});

/** An offer in the reading bar is not said again on the ledger (Q5). */
describe("offers on the result screen", () => {
  it("shows the bar's offer and leaves the scans row out of the ledger", () => {
    const onRead = vi.fn();
    const reading = {
      isReading: false,
      progress: null,
      isStopping: false,
      onStop: vi.fn(),
      offers: [{ key: "scans" as const, icon: ScanText, text: "2 documents not read yet.", label: "Read them", onRead }],
    };
    const { unmount } = render(<ResultView {...props({ scannedDocumentCount: 2, reading })} />);

    fireEvent.click(screen.getByRole("button", { name: "Read them" }));
    expect(onRead).toHaveBeenCalledOnce();
    // The scans were the ledger's only row, so with the offer there is no ledger.
    expect(screen.queryByRole("button", { name: /What happened to your files/ })).not.toBeInTheDocument();

    // Control: without the offer the same drop has its row.
    unmount();
    render(<ResultView {...props({ scannedDocumentCount: 2, reading: { ...reading, offers: [] } })} />);
    openLedger();
    expect(screen.getByText("2 documents couldn't be read.")).toBeInTheDocument();
  });

  it("keeps Copy and Download live while a pass runs", () => {
    const reading = { isReading: true, progress: { done: 1, total: 3 }, isStopping: false, onStop: vi.fn() };
    render(<ResultView {...props({ isReading: true, reading })} />);

    expect(screen.getByRole("button", { name: /Copy/ })).toBeEnabled();
    expect(screen.getByText("Reading 2 of 3.")).toBeInTheDocument();
  });
});
