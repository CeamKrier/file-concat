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
    skippedByDefault: [],
    flaggedFiles: [],
    extractedFiles: [],
    partialDocuments: [],
    scannedDocumentCount: 0,
    imageCount: 0,
    recognisedImages: 0,
    isReading: false,
    readProgress: null,
    isStopping: false,
    onStopReading: vi.fn(),
    recoveredDocuments: 0,
    stoppedReading: false,
    readDeferred: false,
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
