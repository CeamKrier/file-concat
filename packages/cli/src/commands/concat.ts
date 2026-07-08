import * as fs from "node:fs";
import * as path from "node:path";
import { glob } from "glob";
import {
  DEFAULT_GLOB_IGNORE,
  toGlobIgnore,
  generateFileTree,
  generateProjectName,
  assembleOutput,
  createGitignoreMatcher,
  BINARY_EXTENSIONS,
  classifyBytes,
  isExtractableDocument,
  extractDocument,
  addLineNumbers,
  type OutputStyle,
  type ExcludedSummary,
} from "@fileconcat/core";
import { loadConfig, type FileConcatConfig } from "../config.js";

interface ConcatOptions {
  output?: string;
  maxSize: string;
  hidden?: boolean;
  binary?: boolean;
  exclude?: string[];
  gitignore?: boolean;
  config?: string;
  style?: string;
  stdout?: boolean;
  quiet?: boolean;
  json?: boolean;
  parse?: boolean;
  lineNumbers?: boolean;
}

interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

function createLogger(quiet: boolean): Logger {
  return {
    info: (msg: string) => {
      if (!quiet) process.stderr.write(msg + "\n");
    },
    warn: (msg: string) => {
      process.stderr.write(msg + "\n");
    },
    error: (msg: string) => {
      process.stderr.write(msg + "\n");
    },
  };
}

function resolveStyle(
  option: string | undefined,
  configStyle: OutputStyle | undefined,
): OutputStyle {
  const candidate = (option ?? configStyle ?? "xml").toLowerCase();
  if (candidate === "markdown" || candidate === "md") return "markdown";
  if (candidate === "plain" || candidate === "text" || candidate === "txt") return "plain";
  return "xml";
}

function defaultOutputPath(style: OutputStyle): string {
  if (style === "markdown") return "output.md";
  if (style === "plain") return "output.txt";
  return "output.xml";
}

export async function concat(targetPath: string, options: ConcatOptions): Promise<void> {
  const writeToStdout = !!options.stdout;
  const emitJson = !!options.json;

  if (writeToStdout && emitJson) {
    process.stderr.write(
      "Error: --stdout and --json cannot be combined; --json prints to stdout and would mix with content.\n",
    );
    process.exit(1);
  }

  const log = createLogger(!!options.quiet);
  const startTime = Date.now();
  const basePath = path.resolve(targetPath);

  const config: FileConcatConfig = loadConfig(options.config, basePath, log);

  const maxFileSizeMB = parseFloat(options.maxSize) || config.maxFileSizeMB || 32;
  const excludeHidden = options.hidden === false ? true : (config.excludeHiddenFiles ?? true);
  const excludeBinary = options.binary === false ? true : (config.excludeBinaryFiles ?? true);
  const excludePatterns = [...(options.exclude || []), ...(config.exclude || [])];
  const style = resolveStyle(options.style, config.style);
  const outputPath = writeToStdout
    ? null
    : options.output || config.output || defaultOutputPath(style);

  // Documents are extracted by default (matching the web / ADR-0003); --no-parse
  // sets this false and leaves PDFs/Office files to fall through as binary.
  const extract = options.parse !== false;

  log.info(`Processing: ${basePath}`);
  log.info(`Output: ${outputPath ?? "stdout"} (${style})`);
  log.info(`Max file size: ${maxFileSizeMB}MB`);
  if (!extract) {
    log.info("Document extraction: off (--no-parse)");
  }

  let files = await glob("**/*", {
    cwd: basePath,
    nodir: true,
    dot: !excludeHidden,
    ignore: [...DEFAULT_GLOB_IGNORE, ...excludePatterns.flatMap(toGlobIgnore)],
  });

  // node-`glob` has no native .gitignore support, so honor it explicitly: read
  // every .gitignore in the tree (they may be hidden and nested) and filter the
  // walk through the shared hierarchical matcher. Like --exclude, gitignored
  // paths are simply dropped from the walk rather than counted as skipped.
  if (options.gitignore !== false) {
    const gitignoreFiles = await glob("**/.gitignore", {
      cwd: basePath,
      nodir: true,
      dot: true,
      ignore: [...DEFAULT_GLOB_IGNORE],
    });
    if (gitignoreFiles.length > 0) {
      const sources = gitignoreFiles.map((rel) => {
        const slash = rel.lastIndexOf("/");
        return {
          dir: slash === -1 ? "" : rel.slice(0, slash),
          content: fs.readFileSync(path.join(basePath, rel), "utf-8"),
        };
      });
      const matcher = createGitignoreMatcher(sources);
      const before = files.length;
      files = files.filter((file) => !matcher.ignores(file));
      const removed = before - files.length;
      if (removed > 0) {
        log.info(`Honoring ${gitignoreFiles.length} .gitignore file(s): ${removed} paths skipped`);
      }
    }
  }

  log.info(`Found ${files.length} files`);

  const processedFiles: Array<{ path: string; content: string; language?: string }> = [];
  // Collect the *paths* skipped per reason so the bundle summary can name the
  // content gaps (ADR-0008); counts for stderr/--json derive from `.length`.
  const skipped = {
    oversize: [] as string[],
    binary: [] as string[],
    readError: [] as string[],
    parseFailed: [] as string[],
  };
  let parsedCount = 0;
  let totalSize = 0;

  for (const file of files) {
    const fullPath = path.join(basePath, file);
    const stats = fs.statSync(fullPath);

    if (stats.size > maxFileSizeMB * 1024 * 1024) {
      skipped.oversize.push(file);
      continue;
    }

    // Extractable documents (PDF/Office) go through the shared core extractor
    // so the CLI and web agree on which formats qualify and how text is pulled.
    if (extract && isExtractableDocument(file)) {
      try {
        const text = await extractDocument(fs.readFileSync(fullPath));
        if (!text) {
          log.warn(`Skipped (no extractable text): ${file}`);
          skipped.parseFailed.push(file);
          continue;
        }
        processedFiles.push({ path: file, content: text, language: "text" });
        parsedCount++;
        totalSize += stats.size;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn(`Skipped (parse failed): ${file} (${message})`);
        skipped.parseFailed.push(file);
      }
      continue;
    }

    const ext = path.extname(file).slice(1).toLowerCase();
    if (excludeBinary && BINARY_EXTENSIONS.includes(ext)) {
      skipped.binary.push(file);
      continue;
    }

    try {
      // Classify by content, not extension: decodes odd encodings (e.g. UTF-16)
      // correctly and catches a mislabeled binary the extension list missed.
      const decoded = classifyBytes(fs.readFileSync(fullPath));
      if (excludeBinary && decoded.classification === "binary") {
        skipped.binary.push(file);
        continue;
      }
      if (decoded.classification === "ambiguous") {
        log.warn(`Kept (might be binary): ${file}`);
      }
      processedFiles.push({ path: file, content: decoded.text });
      totalSize += stats.size;
    } catch {
      skipped.readError.push(file);
    }
  }

  // Only the categories the model can't see in the tree; noise filtered by
  // glob/.gitignore was already dropped from the walk and is never listed.
  const excluded: ExcludedSummary = {};
  if (skipped.oversize.length) excluded.oversize = skipped.oversize;
  if (skipped.parseFailed.length) excluded.unextractable = skipped.parseFailed;
  if (skipped.binary.length) excluded.binary = skipped.binary;
  if (skipped.readError.length) excluded.unreadable = skipped.readError;

  const skippedBreakdown = {
    oversize: skipped.oversize.length,
    binary: skipped.binary.length,
    readError: skipped.readError.length,
    parseFailed: skipped.parseFailed.length,
  };
  const skippedCount =
    skippedBreakdown.oversize +
    skippedBreakdown.binary +
    skippedBreakdown.readError +
    skippedBreakdown.parseFailed;

  log.info(
    `Processing ${processedFiles.length} files (parsed ${parsedCount}, skipped ${skippedCount})`,
  );

  const projectName = generateProjectName(processedFiles.map((f) => f.path));
  const tree = generateFileTree(processedFiles.map((f) => f.path));

  // Line numbering is applied at emit time to the included content only, exactly
  // as the web does (config.showLineNumbers → addLineNumbers).
  const emitted = options.lineNumbers
    ? processedFiles.map((f) => ({ ...f, content: addLineNumbers(f.content) }))
    : processedFiles;

  const output = assembleOutput({
    projectName,
    files: emitted,
    tree,
    style,
    source: `local:${path.basename(basePath)}`,
    excluded,
  });

  if (writeToStdout) {
    process.stdout.write(output);
  } else {
    fs.writeFileSync(outputPath!, output, "utf-8");
  }

  const elapsedSeconds = (Date.now() - startTime) / 1000;

  if (emitJson) {
    const summary = {
      files: processedFiles.length,
      parsed: parsedCount,
      skipped: skippedCount,
      skippedBreakdown,
      totalBytes: totalSize,
      outputPath: outputPath ?? "stdout",
      elapsedSeconds: Number(elapsedSeconds.toFixed(3)),
      style,
    };
    process.stdout.write(JSON.stringify(summary) + "\n");
  } else {
    log.info(`Done in ${elapsedSeconds.toFixed(2)}s`);
    log.info(`Total size: ${(totalSize / 1024).toFixed(1)} KB`);
    if (outputPath) log.info(`Output written to: ${outputPath}`);
  }
}
