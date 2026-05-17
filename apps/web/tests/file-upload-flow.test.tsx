import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dqbd/tiktoken", () => ({
  encoding_for_model: () => ({
    encode: (text: string) => new Uint32Array(Math.ceil(text.length / 4)),
    free: () => {},
  }),
}));

vi.mock("file-type", () => ({
  fileTypeFromBuffer: async () => undefined,
}));

import App from "../src/app";

const STORAGE_KEY = "fileconcat-config";

function seedStaleIncludePatterns(includePatterns: string) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 3,
      maxFileSizeMB: 32,
      includePatterns,
      ignorePatterns: "",
      removeEmptyLines: false,
      showLineNumbers: false,
      defaultOutputFormat: "single",
      autoSwitchSource: false,
      defaultSourceType: "github",
    }),
  );
}

function uploadFiles(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, "files", {
    configurable: true,
    value: files,
  });
  fireEvent.change(input);
}

function makeTextFile(name: string, content = "// hello") {
  return new File([content], name, { type: "text/plain" });
}

describe("Upload flow: filter-drop notice", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("does NOT render FileTree when a stale include pattern excludes every uploaded file", async () => {
    seedStaleIncludePatterns("src/**/*");
    render(<App />);

    const browseFilesBtn = await screen.findByRole("button", { name: /browse files/i });
    const fileInput = browseFilesBtn.parentElement?.parentElement?.parentElement?.querySelector(
      'input[type="file"]:not([webkitdirectory])',
    ) as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();

    uploadFiles(fileInput!, [
      makeTextFile("README.md", "# readme"),
      makeTextFile("package.json", "{}"),
    ]);

    const alert = await screen.findByTestId("filter-drop-alert");
    expect(within(alert).getByText(/excluded by your filter patterns/i)).toBeInTheDocument();
    expect(within(alert).getByText(/src\/\*\*\/\*/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^files$/i })).not.toBeInTheDocument();
  });

  it("clears the include pattern via 'Reset filter patterns' and lets a subsequent upload render the FileTree", async () => {
    seedStaleIncludePatterns("src/**/*");
    render(<App />);

    const browseFilesBtn = await screen.findByRole("button", { name: /browse files/i });
    const fileInput = browseFilesBtn.parentElement?.parentElement?.parentElement?.querySelector(
      'input[type="file"]:not([webkitdirectory])',
    ) as HTMLInputElement;

    uploadFiles(fileInput, [makeTextFile("README.md")]);
    const alert = await screen.findByTestId("filter-drop-alert");

    const user = userEvent.setup();
    await user.click(within(alert).getByRole("button", { name: /reset filter patterns/i }));

    await waitFor(() => {
      expect(screen.queryByTestId("filter-drop-alert")).not.toBeInTheDocument();
    });

    uploadFiles(fileInput, [makeTextFile("README.md", "# hello")]);

    await screen.findByRole("heading", { name: /^files$/i });
    expect(screen.getByText("README.md")).toBeInTheDocument();
  });

  it("renders FileTree on a clean config (default behaviour, no stale localStorage)", async () => {
    render(<App />);

    const browseFilesBtn = await screen.findByRole("button", { name: /browse files/i });
    const fileInput = browseFilesBtn.parentElement?.parentElement?.parentElement?.querySelector(
      'input[type="file"]:not([webkitdirectory])',
    ) as HTMLInputElement;

    uploadFiles(fileInput, [makeTextFile("main.ts", "export const x = 1;")]);

    await screen.findByRole("heading", { name: /^files$/i });
    expect(screen.getByText("main.ts")).toBeInTheDocument();
    expect(screen.queryByTestId("filter-drop-alert")).not.toBeInTheDocument();
  });
});
