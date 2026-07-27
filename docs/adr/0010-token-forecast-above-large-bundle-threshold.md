# Token counts forecast from character count above a 1 MiB bundle

The token readout runs `@dqbd/tiktoken` in the browser (`apps/web/src/lib/tokens-client.ts`)
so the count is exact rather than a guess. But running the WASM tokenizer's
`encode()` over a multi-megabyte string is slow and memory-heavy on the client,
and the exactness buys nothing once a bundle is already far past any small model's
context window. So above a single threshold the tool stops tokenizing and
forecasts the count from character length instead. This ADR records that
threshold, why it exists, and why it is also reused as the "large bundle" mark.

## Decision

A single exported constant, `LARGE_BUNDLE_CHARS = 1 MiB` (1,048,576 characters,
~262K approximate tokens), in `apps/web/src/lib/tokens.ts`, governs the switch:

- **At or below** the threshold: run real tiktoken (o200k, via the
  `o1-preview-2024-09-12` encoding) for an exact count.
- **Above** it: forecast the count as `chars / 4` — the "holistic forecast".
- `chars / 4` is also the count used before the WASM module has lazy-loaded and
  the fallback on any WASM error, so the readout always degrades to the same
  approximation rather than failing.

The **same** constant anchors the client-side "large bundle" warning (the axis of
render / copy / tokenize cost). That warning is deliberately kept distinct from
the **model-fit** warning, which is relative to the selected model's
`contextLimit` and is not a fixed byte number.

## Considered and rejected

- **Always run tiktoken, no threshold.** Rejected: `encode()` over a multi-MB
  bundle janks or OOMs the tab, and the exact number is decision-irrelevant when
  the bundle already dwarfs a small context window. A ballpark is enough there.
- **Keep exactness by capping input** (the old per-file 32 MB hard cap that
  silently dropped large files). Rejected: silently dropping legitimate large
  text — usually a data file the user wants — is worse than an approximate count.
  The direction is surface-and-approximate, never silently block.
- **Separate constants for the tokenizer gate and the size warning.** Rejected:
  both answer the same question — "is this bundle large for the browser?" — so
  one source of truth avoids the two numbers drifting apart.

## Consequences

- Above the threshold the token number is approximate, and for code (~3.3
  chars/token) `chars / 4` tends to **under**count. Any "fits the model's context
  window" indicator built on this number must therefore carry headroom — warn
  well below 100% (e.g. amber at 80%) rather than trust the forecast as exact.
- tiktoken is an OpenAI (o200k) encoding. For Claude / Gemini targets the readout
  is already an approximation even **below** the threshold; the forecast widens a
  gap that always existed rather than creating a new one.
- The constant lives in `lib/tokens.ts` and is imported by `lib/tokens-client.ts`;
  the planned large-bundle warning imports the same value. Redefining what counts
  as "large" is a one-line change in one place.
