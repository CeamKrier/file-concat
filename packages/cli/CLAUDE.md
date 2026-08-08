# packages/cli

The default command and the explicit `concat` command share the same flag set. Filtering, ignore handling, and output formatting all delegate to `@fileconcat/core` — keep CLI-specific code limited to argv parsing, file I/O, and progress reporting.

The CLI's test suite drives the built `dist/index.js` rather than the source, so its Nx `test` target builds itself first.
