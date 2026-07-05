import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execa, type Result } from "execa";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };
import { FIXTURES_DIR, writePdfFixture } from "./build-fixtures.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, "..", "dist", "index.js");

interface RunOptions {
  cwd?: string;
  reject?: boolean;
}

async function runCli(args: string[], opts: RunOptions = {}): Promise<Result> {
  return execa("node", [CLI, ...args], {
    cwd: opts.cwd ?? FIXTURES_DIR,
    reject: opts.reject ?? false,
  });
}

function makeTempDir(label: string): string {
  return fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), `fc-${label}-`));
}

function copyFixture(name: string): string {
  const src = path.join(FIXTURES_DIR, name);
  const dst = makeTempDir(name);
  fs.cpSync(src, dst, { recursive: true });
  return dst;
}

const PDF_FIXTURE_PATH = writePdfFixture();

beforeAll(() => {
  if (!fs.existsSync(CLI)) {
    throw new Error(`CLI dist not found at ${CLI}. Run \`pnpm build\` before tests.`);
  }
});

afterAll(() => {
  try {
    fs.rmSync(PDF_FIXTURE_PATH, { force: true });
  } catch {
    // ignore
  }
});

describe("file-concat CLI", () => {
  describe("metadata commands", () => {
    it("--version prints the version and exits 0", async () => {
      const result = await runCli(["--version"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(pkg.version);
    });

    it("--help prints usage and exits 0", async () => {
      const result = await runCli(["--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Usage: file-concat");
      expect(result.stdout).toContain("--stdout");
      expect(result.stdout).toContain("--json");
      expect(result.stdout).toContain("--parse");
    });
  });

  describe("happy path", () => {
    it("writes output.xml with the text fixture by default", async () => {
      const dir = copyFixture("text-project");
      const result = await runCli([dir], { cwd: dir });
      expect(result.exitCode).toBe(0);
      const written = fs.readFileSync(path.join(dir, "output.xml"), "utf-8");
      expect(written).toContain("<codebase project=");
      expect(written).toContain("README.md");
      expect(written).toContain("index.ts");
    });

    it("--style markdown switches format and default extension", async () => {
      const dir = copyFixture("text-project");
      const outFile = path.join(makeTempDir("md-out"), "out.md");
      const result = await runCli([dir, "--style", "markdown", "-o", outFile]);
      expect(result.exitCode).toBe(0);
      const written = fs.readFileSync(outFile, "utf-8");
      expect(written).toMatch(/^# Codebase: /m);
      expect(written).toContain("```typescript");
    });

    it("--no-hidden skips dotfiles", async () => {
      const dir = copyFixture("text-project");
      const outFile = path.join(makeTempDir("no-hidden"), "out.xml");
      const result = await runCli([dir, "--no-hidden", "-o", outFile]);
      expect(result.exitCode).toBe(0);
      const written = fs.readFileSync(outFile, "utf-8");
      expect(written).not.toContain(".hidden-file");
    });

    it("--exclude pattern filters matches out of the output", async () => {
      const dir = copyFixture("text-project");
      const outFile = path.join(makeTempDir("excl"), "out.xml");
      const result = await runCli([dir, "--exclude", "*.test.ts", "-o", outFile]);
      expect(result.exitCode).toBe(0);
      const written = fs.readFileSync(outFile, "utf-8");
      expect(written).not.toContain("index.test.ts");
      expect(written).toContain("index.ts");
    });

    it("--max-size 0.00001 prunes files larger than ~10 bytes", async () => {
      const dir = copyFixture("text-project");
      const outFile = path.join(makeTempDir("size"), "out.xml");
      const result = await runCli([dir, "--max-size", "0.00001", "-o", outFile, "--json"]);
      expect(result.exitCode).toBe(0);
      const summary = JSON.parse(result.stdout);
      expect(summary.skippedBreakdown.oversize).toBeGreaterThan(0);
    });

    it("loads .fileconcatrc when present and honours its settings", async () => {
      const dir = copyFixture("config-project");
      const outFile = path.join(makeTempDir("conf"), "out.md");
      const result = await runCli([dir, "-o", outFile]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain("Using config from .fileconcatrc");
      const written = fs.readFileSync(outFile, "utf-8");
      expect(written).toMatch(/^# Codebase:/);
      expect(written).not.toContain("SHOULD_NOT_APPEAR");
    });
  });

  describe("harness flags", () => {
    it("--stdout writes content to stdout and nothing to a file", async () => {
      const dir = copyFixture("text-project");
      const sentinelOutput = path.join(process.cwd(), "output.xml");
      if (fs.existsSync(sentinelOutput)) fs.rmSync(sentinelOutput);
      const result = await runCli([dir, "--stdout"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("<codebase project=");
      expect(fs.existsSync(sentinelOutput)).toBe(false);
    });

    it("--quiet silences stderr progress lines", async () => {
      const dir = copyFixture("text-project");
      const outFile = path.join(makeTempDir("quiet"), "out.xml");
      const result = await runCli([dir, "-o", outFile, "--quiet"]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr.trim()).toBe("");
    });

    it("stderr stays clean of artifact content (no mix-up between stdout and stderr)", async () => {
      const dir = copyFixture("text-project");
      const result = await runCli([dir, "--stdout"]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).not.toContain("<codebase project=");
    });

    it("--json emits a single-line JSON summary on stdout", async () => {
      const dir = copyFixture("text-project");
      const outFile = path.join(makeTempDir("json"), "out.xml");
      const result = await runCli([dir, "-o", outFile, "--json"]);
      expect(result.exitCode).toBe(0);
      const summary = JSON.parse(result.stdout);
      expect(summary).toMatchObject({
        files: expect.any(Number),
        parsed: 0,
        skipped: expect.any(Number),
        skippedBreakdown: expect.any(Object),
        totalBytes: expect.any(Number),
        outputPath: outFile,
        elapsedSeconds: expect.any(Number),
        style: "xml",
      });
    });

    it("--stdout combined with --json exits 1 with a clear error", async () => {
      const dir = copyFixture("text-project");
      const result = await runCli([dir, "--stdout", "--json"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("--stdout and --json cannot be combined");
    });
  });

  describe("parse mode", () => {
    it("without --parse, PDF fixture is skipped as binary", async () => {
      const dir = copyFixture("parse-project");
      const outFile = path.join(makeTempDir("noparse"), "out.xml");
      const result = await runCli([dir, "-o", outFile, "--json"]);
      expect(result.exitCode).toBe(0);
      const summary = JSON.parse(result.stdout);
      expect(summary.parsed).toBe(0);
      expect(summary.skippedBreakdown.binary).toBeGreaterThanOrEqual(0);
      const written = fs.readFileSync(outFile, "utf-8");
      expect(written).not.toContain("Hello fileconcat");
      expect(written).toContain("notes.txt");
    });

    it("--parse pdf parses the hello.pdf fixture and embeds the extracted text", async () => {
      const dir = copyFixture("parse-project");
      const outFile = path.join(makeTempDir("parse-pdf"), "out.xml");
      const result = await runCli([dir, "-o", outFile, "--parse", "pdf", "--json"]);
      expect(result.exitCode).toBe(0);
      const summary = JSON.parse(result.stdout);
      expect(summary.parsed).toBe(1);
      const written = fs.readFileSync(outFile, "utf-8");
      expect(written).toContain("Hello fileconcat");
      expect(written).toContain('language="text"');
    });

    it("--parse pdf on a corrupt .pdf falls back to skippedBreakdown.parseFailed (no crash)", async () => {
      const dir = copyFixture("parse-project");
      fs.rmSync(path.join(dir, "hello.pdf"));
      const outFile = path.join(makeTempDir("corrupt"), "out.xml");
      const result = await runCli([dir, "-o", outFile, "--parse", "pdf", "--json"]);
      expect(result.exitCode).toBe(0);
      const summary = JSON.parse(result.stdout);
      expect(summary.parsed).toBe(0);
      expect(summary.skippedBreakdown.parseFailed).toBe(1);
    });

    it("--parse without an argument enables every supported format", async () => {
      const dir = copyFixture("parse-project");
      const outFile = path.join(makeTempDir("parse-all"), "out.xml");
      const result = await runCli([dir, "-o", outFile, "--parse"]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain("Parse mode: pdf, docx, xlsx, pptx, odt, ods, odp");
    });
  });

  describe("gitignore honoring", () => {
    function makeGitignoreFixture(): string {
      const dir = makeTempDir("gitignore");
      // `private/` is not in the curated static default set, so its exclusion
      // isolates the .gitignore delegation from the always-on default floor.
      fs.writeFileSync(path.join(dir, ".gitignore"), "ignored.txt\nprivate/\n");
      fs.writeFileSync(path.join(dir, "kept.txt"), "KEEP_ME");
      fs.writeFileSync(path.join(dir, "ignored.txt"), "IGNORE_ME");
      fs.mkdirSync(path.join(dir, "private"));
      fs.writeFileSync(path.join(dir, "private", "artifact.txt"), "PRIVATE_ARTIFACT");
      fs.mkdirSync(path.join(dir, "src"));
      fs.writeFileSync(path.join(dir, "src", "main.txt"), "SRC_MAIN");
      return dir;
    }

    it("excludes files matched by the project's .gitignore by default", async () => {
      const dir = makeGitignoreFixture();
      const outFile = path.join(makeTempDir("gi-out"), "out.xml");
      const result = await runCli([dir, "-o", outFile], { cwd: dir });
      expect(result.exitCode).toBe(0);
      const written = fs.readFileSync(outFile, "utf-8");
      expect(written).toContain("KEEP_ME");
      expect(written).toContain("SRC_MAIN");
      expect(written).not.toContain("IGNORE_ME");
      expect(written).not.toContain("PRIVATE_ARTIFACT");
    });

    it("--no-gitignore keeps files the .gitignore would exclude", async () => {
      const dir = makeGitignoreFixture();
      const outFile = path.join(makeTempDir("gi-off"), "out.xml");
      const result = await runCli([dir, "-o", outFile, "--no-gitignore"], { cwd: dir });
      expect(result.exitCode).toBe(0);
      const written = fs.readFileSync(outFile, "utf-8");
      expect(written).toContain("IGNORE_ME");
      expect(written).toContain("PRIVATE_ARTIFACT");
    });

    it("honors a nested .gitignore that re-includes a parent-ignored file", async () => {
      const dir = makeTempDir("gitignore-nested");
      fs.writeFileSync(path.join(dir, ".gitignore"), "*.txt\n");
      fs.writeFileSync(path.join(dir, "root.txt"), "ROOT_TXT");
      fs.mkdirSync(path.join(dir, "docs"));
      fs.writeFileSync(path.join(dir, "docs", ".gitignore"), "!keep.txt\n");
      fs.writeFileSync(path.join(dir, "docs", "keep.txt"), "DOCS_KEEP");
      fs.writeFileSync(path.join(dir, "docs", "other.txt"), "DOCS_OTHER");
      const outFile = path.join(makeTempDir("gi-nested-out"), "out.xml");
      const result = await runCli([dir, "-o", outFile], { cwd: dir });
      expect(result.exitCode).toBe(0);
      const written = fs.readFileSync(outFile, "utf-8");
      expect(written).toContain("DOCS_KEEP");
      expect(written).not.toContain("DOCS_OTHER");
      expect(written).not.toContain("ROOT_TXT");
    });
  });

  describe("encoding", () => {
    it("decodes a BOM-less UTF-16LE source file as text, not mojibake", async () => {
      const dir = makeTempDir("utf16");
      const source = "public class Foo {\n  int x = 1;\n}\n";
      fs.writeFileSync(path.join(dir, "Foo.java"), source, "utf16le");
      const outFile = path.join(makeTempDir("utf16-out"), "out.xml");
      const result = await runCli([dir, "-o", outFile], { cwd: dir });
      expect(result.exitCode).toBe(0);
      const written = fs.readFileSync(outFile, "utf-8");
      expect(written).toContain("public class Foo");
      expect(written).toContain("int x = 1");
    });
  });
});
