import { render, screen } from "@testing-library/react";
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

const model = { name: "Claude Sonnet 4.5", contextLimit: 200_000 };

/** Everything the screen needs that this file is not about. */
function props(overrides: Partial<Parameters<typeof ResultView>[0]> = {}) {
  return {
    sourceLabel: "1 file",
    filesCombined: 1,
    totalFiles: 1,
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
    weight: weighBundle({ files: [], tokens: 100_000, model: { ...model, inputCost: 3 } }),
    splitMode: "single" as const,
    onSplitModeChange: vi.fn(),
    ...overrides,
  };
}

/**
 * What one send costs, on the export card beside the token count.
 *
 * Three things have gone wrong here already and each is pinned below: a model
 * with no rate in the catalogue reads as `inputCost: 0` and must not print
 * "$0.00"; a sub-cent bundle must not print a six-decimal tail; and the value
 * has to survive on one line at 32px, because a wrap grows the card and pushes
 * Copy, which the whole layout exists to hold still.
 */
describe("the price of one send", () => {
  it("states it in dollars and cents", () => {
    render(<ResultView {...props()} />);
    expect(screen.getByText("$0.30")).toBeInTheDocument();
    expect(screen.getByText("to send once")).toBeInTheDocument();
  });

  it("clips under a cent the way the share beside it clips under a percent", () => {
    render(
      <ResultView
        {...props({
          tokens: 1_000,
          weight: weighBundle({ files: [], tokens: 1_000, model: { ...model, inputCost: 3 } }),
        })}
      />,
    );
    // Not "$0.00", which would claim it is free, and not "$0.003000", which is
    // unreadable at figure size. "under $0.01" was the first attempt and it
    // wrapped to two lines.
    expect(screen.getByText("<$0.01")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).toBeNull();
  });

  it("says nothing at all when the catalogue has no rate", () => {
    render(
      <ResultView
        {...props({ weight: weighBundle({ files: [], tokens: 100_000, model }) })}
      />,
    );
    expect(screen.queryByText("to send once")).toBeNull();
    // The other three figures are untouched by the absence.
    expect(screen.getByText("100,000")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("keeps the figure while a recognition pass is holding the export", () => {
    // The count grows when the pass ends, so the price does too. It is still
    // the honest price of the bundle as it stands.
    render(
      <ResultView {...props({ isReading: true, readProgress: { done: 0, total: 2 } })} />,
    );
    expect(screen.getByText("$0.30")).toBeInTheDocument();
  });
});
