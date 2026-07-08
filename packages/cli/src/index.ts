#!/usr/bin/env node
import { program, type Command } from "commander";
import pkg from "../package.json" with { type: "json" };
import { concat } from "./commands/concat.js";

program
  .name("file-concat")
  .description("Concatenate files for LLM context. Privacy-first and pipe-friendly.")
  .version(pkg.version)
  .addHelpText(
    "after",
    `
For AI coding agents:
  Stdout carries the artifact, stderr carries progress. --stdout pipes the
  concatenated output, --json emits a machine-readable summary. Exit code
  is 0 on success, 1 on fatal error or flag conflict.
  Full recipes and JSON summary schema in the README:
  https://www.npmjs.com/package/@fileconcat/cli`,
  );

function addSharedOptions(cmd: Command): Command {
  return cmd
    .argument("[path]", "Directory path to process", ".")
    .option("-o, --output <file>", "Output file path (defaults to output.xml, .md, or .txt)")
    .option("-m, --max-size <mb>", "Max file size in MB", "32")
    .option("--no-hidden", "Exclude hidden files")
    .option("--no-binary", "Exclude binary files")
    .option("-e, --exclude <patterns...>", "Glob patterns to exclude")
    .option("--no-gitignore", "Do not honor the project's .gitignore files")
    .option("-c, --config <file>", "Config file path")
    .option("-s, --style <style>", "Output style: xml | markdown | plain (default xml)")
    .option("--stdout", "Write concatenated output to stdout instead of a file")
    .option("-q, --quiet", "Suppress progress logs on stderr (errors still print)")
    .option("--json", "Emit a single-line JSON summary on stdout when finished")
    .option(
      "--no-parse",
      "Skip PDF/Office text extraction (documents are extracted to text by default)",
    )
    .option("--line-numbers", "Prefix each line of file content with its line number");
}

async function runConcat(path: string, options: Parameters<typeof concat>[1]): Promise<void> {
  try {
    await concat(path, options);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  }
}

addSharedOptions(program.command("concat").description("Concatenate files in a directory")).action(
  async (path, options) => {
    await runConcat(path, options);
  },
);

addSharedOptions(program).action(async (path, options) => {
  if (path && !path.startsWith("-")) {
    await runConcat(path, options);
  }
});

program.parseAsync();
