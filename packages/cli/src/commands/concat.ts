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
  canExpandArchive,
  classifyBytes,
  expandArchive,
  isPasswordProtected,
  routeBytes,
  ROUTER_SNIFF_BYTES,
  addLineNumbers,
  type OutputStyle,
  type ExcludedSummary,
} from "@fileconcat/core";
import { loadConfig, type FileConcatConfig } from "../config.js";
import { parsers } from "../parsers.js";

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
  expandArchives?: boolean;
  lineNumbers?: boolean;
}

/**
 * One unit of work. Files found on disk are read lazily — the router only needs
 * a prefix, so a large binary is identified and skipped without ever being read
 * whole. Entries recovered from an archive already live in memory.
 */
type Source =
  | { origin: "disk"; path: string; fullPath: string; size: number }
  | { origin: "archive"; path: string; bytes: Uint8Array; size: number };

function readPrefix(source: Source): Uint8Array {
  if (source.origin === "archive") return source.bytes.subarray(0, ROUTER_SNIFF_BYTES);
  const length = Math.min(ROUTER_SNIFF_BYTES, source.size);
  const buffer = Buffer.alloc(length);
  const fd = fs.openSync(source.fullPath, "r");
  try {
    fs.readSync(fd, buffer, 0, length, 0);
  } finally {
    fs.closeSync(fd);
  }
  return buffer;
}

function readAll(source: Source): Uint8Array {
  return source.origin === "archive" ? source.bytes : fs.readFileSync(source.fullPath);
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
  // Archives are *not* expanded by default, unlike the web. Dropping a zip on
  // the web is an explicit "process this"; walking a directory that happens to
  // contain assets.zip is not, and inlining it would bury the code the user
  // actually asked for. Opt in with --expand-archives.
  const expandArchivesEnabled = !!options.expandArchives;

  log.info(`Processing: ${basePath}`);
  log.info(`Output: ${outputPath ?? "stdout"} (${style})`);
  log.info(`Max file size: ${maxFileSizeMB}MB`);
  if (!extract) {
    log.info("Document extraction: off (--no-parse)");
  }
  if (expandArchivesEnabled) {
    log.info("Archive expansion: on (--expand-archives)");
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
  let routeFailureReported = false;

  // Expanding an archive appends its entries here, so they flow through the
  // same routing loop as files found on disk.
  const queue: Source[] = files.map((file) => ({
    origin: "disk",
    path: file,
    fullPath: path.join(basePath, file),
    size: fs.statSync(path.join(basePath, file)).size,
  }));

  for (let i = 0; i < queue.length; i++) {
    const source = queue[i];
    const file = source.path;

    if (source.size > maxFileSizeMB * 1024 * 1024) {
      skipped.oversize.push(file);
      continue;
    }

    // One decision point, taken from the file's own leading bytes (ADR-0011):
    // a renamed .docx is extracted, an extensionless PDF is read, and a plain
    // .zip is told apart from the OOXML container that shares its signature.
    //
    // Routing is an enhancement, not a gate. If it fails — an unreadable file,
    // or a detector that could not load — the file still goes down the ordinary
    // content path, so a broken router degrades to the pre-router behaviour
    // instead of emptying the bundle. The first failure is reported once,
    // because a silent one makes an empty bundle look like an empty directory.
    let route: Awaited<ReturnType<typeof routeBytes>> = { kind: "unknown" };
    try {
      route = await routeBytes(readPrefix(source));
    } catch (err) {
      if (!routeFailureReported) {
        routeFailureReported = true;
        const message = err instanceof Error ? err.message : String(err);
        log.warn(`Content routing unavailable, falling back to extensions (${message})`);
      }
    }

    // Document containers go through the shared registry, so the CLI and web
    // agree on which formats qualify and how the text is pulled.
    if (extract && route.kind === "extract") {
      try {
        const { text } = await parsers.extract(route.parserId, readAll(source));
        if (!text) {
          log.warn(`Skipped (no extractable text): ${file}`);
          skipped.parseFailed.push(file);
          continue;
        }
        processedFiles.push({ path: file, content: text, language: "text" });
        parsedCount++;
        totalSize += source.size;
      } catch (err) {
        // A locked document is named as such rather than under the reader's own
        // wording: it is the one failure here the person running this can act
        // on, and `[OfficeParser]: No password given` buries that under a
        // library name they did not choose.
        if (isPasswordProtected(err)) {
          log.warn(`Skipped (password protected): ${file}`);
        } else {
          const message = err instanceof Error ? err.message : String(err);
          log.warn(`Skipped (parse failed): ${file} (${message})`);
        }
        skipped.parseFailed.push(file);
      }
      continue;
    }

    // Archives, when asked for. Nesting is one level deep — an archive inside
    // an archive stays packed, matching the web.
    if (
      expandArchivesEnabled &&
      route.kind === "expand" &&
      source.origin === "disk" &&
      canExpandArchive(route.archive)
    ) {
      try {
        const entries = expandArchive(readAll(source), route.archive, path.basename(file));
        if (entries.length > 0) {
          const dir = path.dirname(file);
          for (const entry of entries) {
            queue.push({
              origin: "archive",
              path: dir === "." ? entry.path : `${dir}/${entry.path}`,
              bytes: entry.bytes,
              size: entry.bytes.length,
            });
          }
          log.info(`Expanded ${file}: ${entries.length} ${entries.length === 1 ? "entry" : "entries"}`);
          continue;
        }
      } catch {
        // Corrupt or unreadable archive: fall through and treat it as a file.
      }
    }

    const ext = path.extname(file).slice(1).toLowerCase();
    if (excludeBinary && BINARY_EXTENSIONS.includes(ext)) {
      skipped.binary.push(file);
      continue;
    }
    // A media container the router recognized by signature. Skipping here means
    // a renamed .png is never read whole just to be thrown away.
    if (excludeBinary && route.kind === "binary") {
      skipped.binary.push(file);
      continue;
    }

    try {
      // Classify by content, not extension: decodes odd encodings (e.g. UTF-16)
      // correctly and catches a mislabeled binary the extension list missed.
      const decoded = classifyBytes(readAll(source));
      if (excludeBinary && decoded.classification === "binary") {
        skipped.binary.push(file);
        continue;
      }
      if (decoded.classification === "ambiguous") {
        log.warn(`Kept (might be binary): ${file}`);
      }
      processedFiles.push({ path: file, content: decoded.text });
      totalSize += source.size;
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
