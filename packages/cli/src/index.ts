#!/usr/bin/env node
import { program } from "commander";
import { concat } from "./commands/concat.js";

program
  .name("fileconcat")
  .description("Concatenate files for LLM context - Privacy-First CLI Tool")
  .version("1.0.0");

program
  .command("concat")
  .description("Concatenate files in a directory")
  .argument("[path]", "Directory path to process", ".")
  .option("-o, --output <file>", "Output file path", "output.txt")
  .option("-m, --max-size <mb>", "Max file size in MB", "32")
  .option("--no-hidden", "Exclude hidden files")
  .option("--no-binary", "Exclude binary files")
  .option("-e, --exclude <patterns...>", "Glob patterns to exclude")
  .option("-c, --config <file>", "Config file path")
  .option("--xml", "Use XML format output")
  .action(async (path, options) => {
    await concat(path, options);
  });

// Default command (no subcommand = concat current dir)
program
  .argument("[path]", "Directory path to process", ".")
  .option("-o, --output <file>", "Output file path", "output.txt")
  .option("-m, --max-size <mb>", "Max file size in MB", "32")
  .option("--no-hidden", "Exclude hidden files")
  .option("--no-binary", "Exclude binary files")
  .option("-e, --exclude <patterns...>", "Glob patterns to exclude")
  .option("-c, --config <file>", "Config file path")
  .option("--xml", "Use XML format output")
  .action(async (path, options) => {
    if (path && !path.startsWith("-")) {
      await concat(path, options);
    }
  });

program.parse();
