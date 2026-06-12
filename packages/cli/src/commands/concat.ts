import * as fs from "node:fs";
import * as path from "node:path";
import { glob } from "glob";
import { convert as convertOffice } from "officeparser";
import {
  DEFAULT_GLOB_IGNORE,
  toGlobIgnore,
  generateFileTree,
  generateProjectName,
  assembleOutput,
  BINARY_EXTENSIONS,
  type OutputStyle,
} from "@fileconcat/core";
import { loadConfig, type FileConcatConfig } from "../config.js";

interface ConcatOptions {
  output?: string;
  maxSize: string;
  hidden?: boolean;
  binary?: boolean;
  exclude?: string[];
  config?: string;
  style?: string;
  stdout?: boolean;
  quiet?: boolean;
  json?: boolean;
  parse?: boolean | string;
}

const PARSE_SUPPORTED_EXTS = ["pdf", "docx", "xlsx", "pptx", "odt", "ods", "odp"] as const;
type ParseExt = (typeof PARSE_SUPPORTED_EXTS)[number];

function resolveParseSet(value: boolean | string | undefined): Set<ParseExt> {
  if (value === undefined || value === false) return new Set();
  if (value === true) return new Set(PARSE_SUPPORTED_EXTS);
  const requested = value
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const result = new Set<ParseExt>();
  for (const ext of requested) {
    if ((PARSE_SUPPORTED_EXTS as readonly string[]).includes(ext)) {
      result.add(ext as ParseExt);
    }
  }
  return result;
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
  return candidate === "markdown" || candidate === "md" ? "markdown" : "xml";
}

function defaultOutputPath(style: OutputStyle): string {
  return style === "xml" ? "output.xml" : "output.md";
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

  const parseSet = resolveParseSet(options.parse);

  log.info(`Processing: ${basePath}`);
  log.info(`Output: ${outputPath ?? "stdout"} (${style})`);
  log.info(`Max file size: ${maxFileSizeMB}MB`);
  if (parseSet.size > 0) {
    log.info(`Parse mode: ${[...parseSet].join(", ")}`);
  }

  const files = await glob("**/*", {
    cwd: basePath,
    nodir: true,
    dot: !excludeHidden,
    ignore: [...DEFAULT_GLOB_IGNORE, ...excludePatterns.flatMap(toGlobIgnore)],
  });

  log.info(`Found ${files.length} files`);

  const processedFiles: Array<{ path: string; content: string; language?: string }> = [];
  const skippedBreakdown = { oversize: 0, binary: 0, readError: 0, parseFailed: 0 };
  let parsedCount = 0;
  let totalSize = 0;

  for (const file of files) {
    const fullPath = path.join(basePath, file);
    const stats = fs.statSync(fullPath);

    if (stats.size > maxFileSizeMB * 1024 * 1024) {
      skippedBreakdown.oversize++;
      continue;
    }

    const ext = path.extname(file).slice(1).toLowerCase();
    const shouldParse = parseSet.has(ext as ParseExt);

    if (shouldParse) {
      try {
        const result = await convertOffice(fullPath, "text");
        const text = typeof result.value === "string" ? result.value.trim() : "";
        if (!text) {
          log.warn(`Skipped (no extractable text): ${file}`);
          skippedBreakdown.parseFailed++;
          continue;
        }
        processedFiles.push({ path: file, content: text, language: "text" });
        parsedCount++;
        totalSize += stats.size;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn(`Skipped (parse failed): ${file} (${message})`);
        skippedBreakdown.parseFailed++;
      }
      continue;
    }

    if (excludeBinary && BINARY_EXTENSIONS.includes(ext)) {
      skippedBreakdown.binary++;
      continue;
    }

    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      processedFiles.push({ path: file, content });
      totalSize += stats.size;
    } catch {
      skippedBreakdown.readError++;
    }
  }

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

  const output = assembleOutput({
    projectName,
    files: processedFiles,
    tree,
    style,
    source: `local:${path.basename(basePath)}`,
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
