#!/usr/bin/env node
import { program, type Command } from "commander";
import { concat } from "./commands/concat.js";

program
  .name("fileconcat")
  .description("Concatenate files for LLM context - Privacy-First CLI Tool")
  .version("1.0.0");

function addSharedOptions(cmd: Command): Command {
  return cmd
    .argument("[path]", "Directory path to process", ".")
    .option("-o, --output <file>", "Output file path (defaults to output.xml or output.md)")
    .option("-m, --max-size <mb>", "Max file size in MB", "32")
    .option("--no-hidden", "Exclude hidden files")
    .option("--no-binary", "Exclude binary files")
    .option("-e, --exclude <patterns...>", "Glob patterns to exclude")
    .option("-c, --config <file>", "Config file path")
    .option("-s, --style <style>", "Output style: xml | markdown (default xml)");
}

addSharedOptions(program.command("concat").description("Concatenate files in a directory")).action(
  async (path, options) => {
    await concat(path, options);
  },
);

addSharedOptions(program).action(async (path, options) => {
  if (path && !path.startsWith("-")) {
    await concat(path, options);
  }
});

program.parse();
