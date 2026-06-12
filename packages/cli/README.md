# @fileconcat/cli

Privacy-first CLI that concatenates a directory into a single LLM-ready blob. Bundles plain text files by default, and optionally extracts text from PDF, DOCX, XLSX, PPTX, ODT, ODS, ODP. Everything runs locally; nothing is uploaded.

The browser version of the same tool lives at [fileconcat.com](https://fileconcat.com).

## Install

```bash
npm install -g @fileconcat/cli
# or
pnpm add -g @fileconcat/cli
```

After install the bin command is `file-concat`. Node 18 or newer.

## Quick start

```bash
file-concat ./my-repo                                # writes output.xml
file-concat ./my-repo --style markdown -o ctx.md     # markdown output
file-concat ./my-repo --parse pdf,docx -o ctx.xml    # extract text from PDF + DOCX
file-concat ./my-repo --stdout | pbcopy              # pipe content straight to clipboard
```

## Flags

| Flag | Description |
| --- | --- |
| `[path]` | Directory to process. Defaults to `.`. |
| `-o, --output <file>` | Output path. Defaults to `output.xml` or `output.md` based on `--style`. Ignored when `--stdout` is set. |
| `-s, --style <xml\|markdown>` | Output format. Defaults to `xml`. |
| `-m, --max-size <mb>` | Per-file size cap. Files above this are skipped. Defaults to `32`. |
| `--no-hidden` | Skip dotfiles. |
| `--no-binary` | Skip files with known binary extensions. |
| `-e, --exclude <patterns...>` | Glob patterns to exclude (in addition to the bundled defaults: `node_modules`, `.git`, build outputs, lock files, etc.). |
| `-c, --config <file>` | Path to a JSON config file (also auto-discovers `.fileconcatrc`, `.fileconcatrc.json`, `fileconcat.config.json`). |
| `--parse [formats]` | Extract text from binary documents. With no value, enables every supported format. Comma-separated list (`--parse pdf,docx`) restricts to a subset. Supported: `pdf`, `docx`, `xlsx`, `pptx`, `odt`, `ods`, `odp`. |
| `--stdout` | Write the concatenated output to stdout instead of a file. Mutually exclusive with `--json`. |
| `-q, --quiet` | Suppress progress logs on stderr. Errors still print. |
| `--json` | Emit a single-line JSON summary on stdout when finished. Implies file output (cannot be combined with `--stdout`). |
| `-V, --version` | Print the installed version. |
| `-h, --help` | Print help and exit. |

## Config file

`file-concat` auto-discovers `.fileconcatrc` (or the JSON variants) in the target directory. Example:

```json
{
  "style": "markdown",
  "maxFileSizeMB": 16,
  "excludeHiddenFiles": true,
  "excludeBinaryFiles": true,
  "exclude": ["dist/**", "coverage/**", "*.snap"]
}
```

Command-line flags override config-file values where they overlap.

## For AI coding agents

`file-concat` is designed to be friendly to LLM coding harnesses (Claude Code, Cursor agent mode, aider, custom orchestrators). Three properties make it pipe-safe:

1. **Stdout is the artifact, stderr is the chatter.** Progress logs (`Processing:`, `Found N files`, etc.) and warnings go to stderr. Stdout only carries the concatenated output (when `--stdout`) or the JSON summary (when `--json`). You can mix them safely: `file-concat ./repo --stdout 2>/dev/null` gives clean content, `file-concat ./repo --json 2>>logs.txt` keeps progress for debugging.
2. **`--json` provides a machine-readable summary.** Example output (single line, decoded for readability):
   ```json
   {
     "files": 42,
     "parsed": 3,
     "skipped": 5,
     "skippedBreakdown": { "oversize": 1, "binary": 2, "readError": 0, "parseFailed": 2 },
     "totalBytes": 184320,
     "outputPath": "output.xml",
     "elapsedSeconds": 0.213,
     "style": "xml"
   }
   ```
   `skippedBreakdown.parseFailed > 0` means at least one document under `--parse` could not be parsed (corrupt, password protected, unsupported variant). The summary appears on stdout, so harness code can pipe it directly into `JSON.parse`.
3. **Exit codes are stable.** `0` on success (including partial-skip outcomes), `1` on any fatal error or flag conflict. Errors are written to stderr with an `Error:` prefix.

### Recipes

Concatenate a repo and pipe it into an LLM CLI:

```bash
file-concat ./service --stdout --quiet | claude -p "explain this codebase"
```

Generate context plus a machine-readable summary for a wrapper script:

```bash
file-concat ./service -o ctx.xml --json | jq '.parsed'
```

Pull a PDF spec into the same blob as the surrounding code:

```bash
file-concat ./service --parse pdf,docx -o ctx.xml
```

### Defaults worth knowing

- The bundled default ignore list mirrors the web app: `node_modules`, `.git`, common build outputs (`dist`, `build`, `.next`, etc.), and lock files. Combine with `--exclude` to add project-specific entries.
- Binary files are skipped unless their extension is in the active `--parse` set.
- The output schema matches the web app, so prompts that already work against [fileconcat.com](https://fileconcat.com) output keep working with CLI output.

## Limitations

- v0.1 reads from local directories only. Remote sources (GitHub, GitLab, Bitbucket, Gist, URL) are available on the web app and tracked as roadmap for the CLI.
- `--parse` extracts text only. Embedded images, charts, and equations are not OCR'd.

## License

[MIT](./LICENSE).
