import * as fs from "node:fs";
import * as path from "node:path";
import { glob } from "glob";
import {
  shouldSkipPath,
  generateFileTree,
  getLanguageFromPath,
  generateProjectName,
  BINARY_EXTENSIONS,
} from "@fileconcat/core";
import { loadConfig, type FileConcatConfig } from "../config.js";

interface ConcatOptions {
  output: string;
  maxSize: string;
  hidden?: boolean;
  binary?: boolean;
  exclude?: string[];
  config?: string;
  xml?: boolean;
}

export async function concat(targetPath: string, options: ConcatOptions): Promise<void> {
  const startTime = Date.now();
  const basePath = path.resolve(targetPath);

  // Load config
  const config: FileConcatConfig = loadConfig(options.config, basePath);

  // Merge CLI options with config
  const maxFileSizeMB = parseFloat(options.maxSize) || config.maxFileSizeMB || 32;
  const excludeHidden = options.hidden === false ? true : config.excludeHiddenFiles ?? true;
  const excludeBinary = options.binary === false ? true : config.excludeBinaryFiles ?? true;
  const excludePatterns = [...(options.exclude || []), ...(config.exclude || [])];
  const outputPath = options.output || config.output || "output.txt";
  const useXml = options.xml || config.xmlFormat || false;

  console.log(`\n📂 Processing: ${basePath}`);
  console.log(`📄 Output: ${outputPath}`);
  console.log(`⚙️  Max file size: ${maxFileSizeMB}MB`);

  // Find all files
  const files = await glob("**/*", {
    cwd: basePath,
    nodir: true,
    dot: !excludeHidden,
    ignore: [
      "node_modules/**",
      ".git/**",
      "**/dist/**",
      "**/build/**",
      ...excludePatterns,
    ],
  });

  console.log(`🔍 Found ${files.length} files`);

  // Filter and process files
  const processedFiles: Array<{ path: string; content: string }> = [];
  let skippedCount = 0;
  let totalSize = 0;

  for (const file of files) {
    const fullPath = path.join(basePath, file);
    const stats = fs.statSync(fullPath);

    // Size check
    if (stats.size > maxFileSizeMB * 1024 * 1024) {
      skippedCount++;
      continue;
    }

    // Skip path check (using core package)
    if (shouldSkipPath(file)) {
      skippedCount++;
      continue;
    }

    // Binary check
    if (excludeBinary) {
      const ext = path.extname(file).slice(1).toLowerCase();
      if (BINARY_EXTENSIONS.includes(ext)) {
        skippedCount++;
        continue;
      }
    }

    // Read file
    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      processedFiles.push({ path: file, content });
      totalSize += stats.size;
    } catch (error) {
      // Skip unreadable files (binary, etc.)
      skippedCount++;
    }
  }

  console.log(`✅ Processing ${processedFiles.length} files (skipped ${skippedCount})`);

  // Generate output
  const projectName = generateProjectName(processedFiles.map((f) => f.path));
  const tree = generateFileTree(processedFiles.map((f) => f.path));

  let output = "";

  if (useXml) {
    // XML format
    output = `<?xml version="1.0" encoding="UTF-8"?>
<project name="${projectName}">
<files count="${processedFiles.length}">
${tree}
</files>
<contents>
${processedFiles
  .map(
    ({ path: filePath, content }) => `
<file path="${filePath}">
<![CDATA[
${content}
]]>
</file>`
  )
  .join("\n")}
</contents>
</project>`;
  } else {
    // Markdown format
    output = `# ${projectName}

## File Structure

\`\`\`
${tree}
\`\`\`

## Files

${processedFiles
  .map(({ path: filePath, content }) => {
    const lang = getLanguageFromPath(filePath);
    return `### ${filePath}

\`\`\`${lang}
${content}
\`\`\`
`;
  })
  .join("\n")}
`;
  }

  // Write output
  fs.writeFileSync(outputPath, output, "utf-8");

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  const sizeKB = (totalSize / 1024).toFixed(1);

  console.log(`\n✨ Done in ${elapsed}s`);
  console.log(`📊 Total size: ${sizeKB} KB`);
  console.log(`📝 Output written to: ${outputPath}`);
}
