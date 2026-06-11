import { describe, expect, it, vi } from "vitest";
import { createProgressReporter } from "../src/sources/progress";

describe("createProgressReporter", () => {
  it("file-count mode reports completedFiles incrementally", () => {
    const onProgress = vi.fn();
    const reporter = createProgressReporter({ totalFiles: 3, onProgress });

    reporter.fileComplete("a.ts");
    reporter.fileComplete("b.ts");

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress.mock.calls[0][0]).toMatchObject({
      currentFile: "a.ts",
      totalFiles: 3,
      completedFiles: 1,
      downloadedBytes: 0,
      totalBytes: 0,
      speed: 0,
    });
    expect(onProgress.mock.calls[1][0].completedFiles).toBe(2);
  });

  it("file-count mode ignores bytesReceived", () => {
    const onProgress = vi.fn();
    const reporter = createProgressReporter({ totalFiles: 1, onProgress });

    reporter.bytesReceived("x.ts", 1024);

    expect(onProgress).not.toHaveBeenCalled();
  });

  it("byte-tracking mode accumulates downloadedBytes", () => {
    const onProgress = vi.fn();
    const reporter = createProgressReporter({
      totalFiles: 1,
      totalBytes: 4096,
      onProgress,
    });

    reporter.bytesReceived("x.ts", 1024);
    reporter.bytesReceived("x.ts", 1024);
    reporter.fileComplete("x.ts");

    const final = onProgress.mock.calls.at(-1)?.[0];
    expect(final).toMatchObject({
      currentFile: "x.ts",
      totalFiles: 1,
      totalBytes: 4096,
      completedFiles: 1,
      downloadedBytes: 2048,
    });
  });
});
