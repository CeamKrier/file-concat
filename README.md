# FileConcat

![FileConcat Banner Image](https://fileconcat.com/github-banner.png)

Privacy-first tool that turns a folder of files into one LLM-ready bundle. The browser at [fileconcat.com](https://fileconcat.com) and the [`@fileconcat/cli`](https://www.npmjs.com/package/@fileconcat/cli) npm CLI run the same engine, and nothing leaves your machine on either surface.

## Two surfaces, same engine

### Browser

Drop a folder, paste a public GitHub / GitLab / Bitbucket URL, or pick a recent source. The file tree updates live as you tune include / ignore globs; the token counter tracks running cost against any of 200+ LLM models. Copy or download the bundle as XML or Markdown.

Open at [fileconcat.com](https://fileconcat.com).

### CLI

```bash
npm install -g @fileconcat/cli
# or one-off:
pnpm dlx @fileconcat/cli ./your-folder
```

After install the bin is `file-concat`. Node 18 or newer.

```bash
file-concat ./service                                  # output.xml
file-concat ./service --style markdown -o ctx.md
file-concat ./service --parse pdf,docx -o ctx.xml      # extract PDF + DOCX text
file-concat ./service --stdout | claude -p             # pipe straight to a model
file-concat ./service --json                           # one-line summary on stdout
```

Full flag reference: [`packages/cli/README.md`](packages/cli/README.md) and [the CLI docs](https://fileconcat.com/docs/cli-usage).

## What's in the bundle

Project tree at the top so the model sees the structure before any file body. Then every file in its own `<file path="..." language="...">` block (or a fenced Markdown block under `--style markdown`). Binary files, lock files, and build output are dropped by default; the rest is shaped by include / ignore globs.

Opt-in with `--parse` (CLI) or the web tool's parse toggle to extract plain text from PDF, DOCX, XLSX, PPTX, ODT, ODS, and ODP files. Failed parses count as skipped and the run continues.

## Workspace layout

pnpm workspace + Nx (`pnpm-workspace.yaml`, `nx.json`). Three members:

| Path            | Name                | Role                                                              |
| --------------- | ------------------- | ----------------------------------------------------------------- |
| `apps/web`      | `@fileconcat/web`   | TanStack Start app deployed to Cloudflare Workers                 |
| `packages/cli`  | `@fileconcat/cli`   | Commander CLI, published to npm, built with tsup                  |
| `packages/core` | `@fileconcat/core`  | Shared engine: file processing, path utils, source adapters, models |

`@fileconcat/core` is consumed via `workspace:*` and linked at source so neither the web app nor the CLI needs a build step to pick it up in dev.

## Local development

```bash
pnpm install        # bootstrap the workspace
pnpm dev            # TanStack dev server (apps/web)
pnpm build          # web production build
pnpm build:all      # build every package
pnpm check          # tsc --noEmit per package
pnpm lint           # eslint .
pnpm format         # prettier --write .
```

Core has its own Vitest suite:

```bash
cd packages/core && pnpm vitest run
```

The CLI runs from source via `tsx`:

```bash
cd packages/cli && pnpm dev -- ./your-folder
```

## Docs

Long-form docs at [fileconcat.com/docs](https://fileconcat.com/docs). Topics: getting started, the four-layer filter pipeline, GitHub / GitLab / Bitbucket import, token estimation and costs, configuration, and the CLI reference.

The browser tool and the CLI share the same filter pipeline and output shape, so the docs apply to both.

## License

[MIT](LICENSE).
