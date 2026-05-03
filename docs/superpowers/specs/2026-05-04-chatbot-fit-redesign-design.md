# Chatbot-Fit Badge Redesign

**Date:** 2026-05-04
**Owner:** ceamkrier
**Status:** Approved (brainstorming)
**Affects:** `apps/web` only — `@fileconcat/core` and `packages/cli` are untouched.

## Context

The web app currently presents a cost-estimation panel, a 4,157-row model selector, and a tiktoken-based token panel. These were shipped as Faz 2 and Faz 4 (tasks 06–09 and 19) on the assumption that token-aware UX is universally valuable.

In review with the product owner, the audience for fileconcat.com is now framed as **chatbot users** — people who paste files into ChatGPT, Claude, Gemini, etc. For this audience:

- Per-token **cost** is irrelevant (they pay flat subscriptions, not API tokens).
- A 4,157-model **selector** is overkill; they pick from a handful of consumer chatbots.
- The single useful question is: **"will this content fit in my chatbot's context window?"**

In addition, tiktoken's WASM payload is **5,593 KiB raw / ~1.6 MiB gzip** and currently dominates page-open latency. The product owner explicitly considered dropping tiktoken outright; this redesign does so.

## Goals

1. Replace the cost panel + full model selector + tiktoken token panel with a single **chatbot-fit badge**: a row of provider chips, each showing the provider's icon and a ✓/✗ for whether the content fits that chatbot's flagship context window.
2. Drop `@dqbd/tiktoken` and its `vite-plugin-wasm` + `vite-plugin-top-level-await` build-time machinery. Bundle wins ~5.6 MiB raw / ~1.6 MiB gzip.
3. Keep model context-window data **fresh** by reusing the existing `models.dev` build-time + runtime fetch pipeline (`apps/web/scripts/fetch-models.ts`, `apps/web/src/routes/api/models.ts`, `useModels()`).
4. Keep the change **surgical**: source-input UI, file tree, preview area, and the rest of the homepage stay as they are.

## Non-goals

- Redesigning the source-input area, file tree, or preview area.
- Adding smart-trim suggestions, auto-pruning, or chunking when content overflows. (Cross icons + an existing tree to manually trim are sufficient.)
- Per-provider exact tokenizers (`@anthropic-ai/tokenizer`, gemini tokenizers). The heuristic + conservative buffer is accurate enough for the binary fits/doesn't-fit verdict.
- Touching the CLI or `@fileconcat/core`.
- Touching docs MDX, SEO, or routing.

## Architecture

Three layers, all inside `apps/web`:

```
┌──────────────────────────────────────────────────┐
│  UI:  ChatbotFitBadge                            │
│       chip row (provider icon + ✓/✗)             │
│       optional banner when all chips are ✗       │
└────────────────────┬─────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────┐
│  Hook: useChatbotFit(content)                    │
│        ↘ uses useModels() (existing) for         │
│          fresh context-window data               │
│        returns { tokens, providers[] }           │
└────────────────────┬─────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────┐
│  Pure: estimateTokens, pickFlagshipModel,        │
│        CHATBOT_PROVIDERS                         │
└──────────────────────────────────────────────────┘
```

## Components

### Files to delete

| Path | Reason |
| ---- | ------ |
| `apps/web/src/components/cost-estimate.tsx` | Cost is irrelevant to the chatbot persona. |
| `apps/web/src/components/cost-comparison.tsx` | Same. |
| `apps/web/src/components/model-selector.tsx` | 4,157-row selector, overkill. |
| `apps/web/src/components/token-info-popover.tsx` | Replaced by chip-level visual. |
| `apps/web/src/components/token-section.tsx` | Replaced wholesale by `chatbot-fit-badge.tsx`. |
| `apps/web/src/hooks/use-models.ts` (audit) | **Retain** — `useChatbotFit` still consumes it. |
| `apps/web/src/components/lazy-editor-codemirror.tsx` (audit) | **Retain** — used by file viewer / preview, not by the deleted token panel. No action needed. |

### Files to add

| Path | Responsibility |
| ---- | -------------- |
| `apps/web/src/lib/tokens.ts` | `estimateTokens(content: string): number` — pure heuristic. |
| `apps/web/src/lib/chatbot-providers.ts` | `CHATBOT_PROVIDERS: ChatbotProviderConfig[]` whitelist + `pickFlagshipModel(registry, providerId)` helper. |
| `apps/web/src/hooks/use-chatbot-fit.ts` | `useChatbotFit(content): ChatbotFitResult` — composes `estimateTokens`, `useModels`, and `pickFlagshipModel`. |
| `apps/web/src/components/chatbot-fit-badge.tsx` | Renders the chip row + optional all-overflow banner. |
| `apps/web/vitest.config.ts` | New vitest config for `apps/web` (the package does not currently have one). One-line config that sets `test.environment: "jsdom"` (for the hook test) and reuses the workspace tsconfig. |
| `apps/web/tests/tokens.test.ts` | Unit tests for `estimateTokens`. |
| `apps/web/tests/chatbot-providers.test.ts` | Unit tests for `pickFlagshipModel`. |
| `apps/web/tests/use-chatbot-fit.test.ts` | One light integration test for the hook. |

### Files to modify

| Path | Change |
| ---- | ------ |
| `apps/web/src/app.tsx` | Replace `<TokenSection />` (or equivalent) usage with `<ChatbotFitBadge content={joinedContent} />`. |
| `apps/web/app.config.ts` | Remove `wasm()` and `topLevelAwait()` plugins; remove `optimizeDeps.exclude` for `@dqbd/tiktoken`. |
| `apps/web/package.json` | Remove deps: `@dqbd/tiktoken`, `vite-plugin-wasm`, `vite-plugin-top-level-await`. Add devDeps: `vitest`, `@testing-library/react`, `jsdom` — pin to the latest stable releases compatible with TypeScript 5.6 and Vite 6 at implementation time. Add `test` script: `vitest run`. |
| `.claude/CLAUDE.md` | Update the apps/web architecture note: tiktoken / wasm plugin order is no longer relevant; remove that paragraph. |
| `.claude/napkin.md` | Add note: chip-row pattern + heuristic tokens; remove obsolete tiktoken note. |

## Data flow

1. The user pastes a URL or drops files. The existing source-input → adapter → file load flow runs unchanged.
2. `app.tsx` derives `joinedContent: string` from `rawContents` (already exists).
3. `<ChatbotFitBadge content={joinedContent} />` renders.
4. Inside the badge, `useChatbotFit(content)` runs:
   - Calls `estimateTokens(content)` → `tokens` (memoised on `content`).
   - Reads `useModels()` → `registry`.
   - For each entry in `CHATBOT_PROVIDERS`:
     - `flagship = pickFlagshipModel(registry, providerId)`.
     - `fits = (tokens * OVERHEAD_FACTOR) <= flagship.limit.context`.
       - `OVERHEAD_FACTOR = 1.15`, exported from `chatbot-providers.ts` so the tuning knob has one home.
       - The factor is applied **only at the fit check**, not to the displayed token number — users see the un-buffered estimate.
     - Push `{ id, name, icon, modelName, contextWindow, tokens, fits }` into `providers`.
   - Skip providers where `flagship` is undefined. (`pickFlagshipModel` already filters out models with missing or zero `limit.context`, so a returned model is guaranteed to have a usable context value.)
   - Return `{ tokens, providers }`.
5. The badge renders `≈ {tokens.toLocaleString()} tokens` and one chip per provider (`<icon> ✓` or `<icon> ✗`).
6. If `providers.length > 0` and every chip is ✗, render an additional one-line red banner under the chips: *"Exceeds all tracked chatbots — trim files in the tree to fit."*

## `estimateTokens` heuristic

```ts
export function estimateTokens(content: string): number {
  return Math.ceil(content.length / 3);
}
```

Rationale:
- For English prose: real ratio ≈ chars/4. `chars/3` overestimates by ~33% → conservative.
- For code (TS, JS, Python, etc.): real ratio ≈ chars/3 to chars/3.5. `chars/3` is roughly accurate to slightly over.
- For non-Latin scripts (CJK, Arabic, Devanagari): real tokenisers can produce 1–2 tokens per character, where `chars/3` may **underestimate**. Acknowledged limitation; the chatbot-user audience is overwhelmingly Latin-script code/docs.
- O(1) per call (string `length`); negligible cost on every render.

## `pickFlagshipModel` rule

The `models.dev` schema places context size at `model.limit.context` (not `context_window`). The matching `@fileconcat/core` type is `AIModel` (which exposes `limit: { context, output }`), and the registry shape is `ModelsRegistry.providers[providerId].models: Record<string, AIModel>`. Use these directly so we have access to `release_date` for the tie-break — `FilteredModel` from core does not expose it.

```ts
import type { AIModel, ModelsRegistry } from "@fileconcat/core";

export function pickFlagshipModel(
  registry: ModelsRegistry,
  providerId: string,
): AIModel | undefined {
  const provider = registry.providers[providerId];
  if (!provider) return undefined;
  const models = Object.values(provider.models).filter((m) => m.limit?.context);
  if (models.length === 0) return undefined;
  return models.sort((a, b) => {
    if (b.limit.context !== a.limit.context) {
      return b.limit.context - a.limit.context;
    }
    return new Date(b.release_date ?? 0).getTime() - new Date(a.release_date ?? 0).getTime();
  })[0];
}
```

Sort key: highest `limit.context` wins; ties broken by latest `release_date`. Both fields come from `models.dev` and are kept fresh by the existing `apps/web/scripts/fetch-models.ts` prebuild step plus the `routes/api/models.ts` runtime refresh.

## `CHATBOT_PROVIDERS` whitelist

`apps/web/src/lib/chatbot-providers.ts`:

```ts
export interface ChatbotProviderConfig {
  /** models.dev provider id */
  id: string;
  /** display name */
  name: string;
  /** lucide / simple-icons name to render */
  icon: string;
}

export const CHATBOT_PROVIDERS: ChatbotProviderConfig[] = [
  { id: "openai",         name: "ChatGPT",  icon: "openai" },
  { id: "anthropic",      name: "Claude",   icon: "anthropic" },
  { id: "google",         name: "Gemini",   icon: "google" },
  { id: "mistral",        name: "Mistral",  icon: "mistralai" },
  { id: "github-copilot", name: "Copilot",  icon: "github" },
];

/** Cross-tokenizer safety margin — applied at fits-check, not at display. */
export const OVERHEAD_FACTOR = 1.15;
```

The exact set is curated by hand; updating it is a one-line PR. The flagship model under each provider stays fresh automatically via `models.dev`.

All five provider IDs above are confirmed to exist verbatim in the current `apps/web/src/data/models.json` (verified during spec authoring against the current `models.dev` snapshot). No implementation-time verification needed.

## Error and edge cases

| Case | Handling |
| ---- | -------- |
| `useModels()` is in loading state | Render the chip row with greyed-out skeleton chips, no ✓/✗. |
| `useModels()` errored AND no bundled fallback | Hide the chip row entirely (rest of the app continues). |
| Bundled fallback is used (API down) | Render normally; no UI signal. `useModels()` already returns the bundled `~/data/models.json` transparently when `/api/models` errors, so `useChatbotFit` does not need any special-casing — it always sees a working `registry`. The bundled snapshot is regenerated every prebuild, so it is at most as stale as the last deploy. The 15% `OVERHEAD_FACTOR` also absorbs the typical context-window growth between snapshots (e.g., 200k → 1M is rare and would only flip ✗ to ✓, never the reverse). |
| Whitelisted provider not present in registry | Skip that chip. No console error. |
| Provider present but no model has `limit.context` | Skip that chip. |
| `content` is empty or whitespace | Render placeholder: *"Add files to see chatbot fit."* No chips. |
| `tokens > 0`, all chips are ✗ | Chips render as ✗ + one-line red banner under them. |
| Heuristic underestimates non-Latin scripts | Acknowledged limitation; documented in code comment near `estimateTokens`. |
| Re-renders on every keystroke | `useChatbotFit` memoises on `content`; chips re-render only when content actually changes. |

## Testing

### Unit tests (vitest)

`apps/web/tests/tokens.test.ts`:
- `estimateTokens("")` returns `0`.
- `estimateTokens("a".repeat(3000))` returns `1000`.
- `estimateTokens("a".repeat(3001))` returns `1001` (Math.ceil edge).

`apps/web/tests/chatbot-providers.test.ts`:
- `pickFlagshipModel(registry, "anthropic")` returns the Claude entry with the highest `limit.context`.
- `pickFlagshipModel(registry, "nonexistent")` returns `undefined`.
- `pickFlagshipModel(emptyRegistry, "openai")` returns `undefined`.
- Tie-break: two models with identical `limit.context` → the one with later `release_date` wins.
- `OVERHEAD_FACTOR`: tests that depend on the buffer (e.g. fits/doesn't-fit thresholds) must import the constant from the module under test rather than re-stating `1.15`, so the test stays correct if the constant is tuned later.

`apps/web/tests/use-chatbot-fit.test.ts` (light hook test):
- Given a fixture registry with all five whitelisted providers, `useChatbotFit("hello world")` returns `tokens === 4` (11 chars / 3, ceil = 4 — call this out in the test description so the magic number is self-explanatory) and `providers.length === 5`, all `fits === true`.
- Given content large enough to exceed every chatbot, all `providers[i].fits === false`.

### No unit test for the badge component

The chip render is trivial markup. Manual smoke test in `pnpm preview` is sufficient.

### Manual verification (post-implementation)

Run `pnpm preview` and confirm:

1. Homepage opens fast — `tiktoken_bg-*.wasm` no longer in the network panel.
2. Drop a small repo → chip row shows all five chatbots with ✓.
3. Drop a very large repo (50k+ tokens) → some chips ✗.
4. Drop a colossal blob (millions of tokens) → all chips ✗ + red banner appears.
5. Block `/api/models` in DevTools → fallback bundled `models.json` still produces chips.

### Bundle size verification

Run `pnpm build` before and after the PR; record the diff. Expected: **roughly -5.6 MiB raw / -1.6 MiB gzip** in the SSR + client bundles, predominantly from removing `tiktoken_bg-*.wasm`.

## Out of scope

These items are explicitly deferred and may be picked up in a follow-up brainstorming session, in roughly this order of value to the chatbot-user audience:

- PDF / image / DOCX content extraction (the original "ingester" vision).
- A "remove largest N files" or "exclude tests/lockfiles" smart-trim affordance.
- Output chunking for content that exceeds every chatbot.
- Permalink / share URL for a generated blob.
- Public HTTP API or MCP server for agentic consumption.
- Per-provider exact tokenizers.

## Migration & rollout

- Single PR, single commit on `development`. No feature flag.
- The existing `apps/web/src/data/models.json` (3 MiB bundled) stays as the runtime fallback. No data migration required.
- The deleted components have no consumers outside `apps/web`. Verify with `grep -rn 'cost-estimate\|cost-comparison\|model-selector\|token-info-popover\|token-section'` before deleting. (This audit is delete-only — the new `chatbot-fit-badge`, `useChatbotFit`, `tokens.ts`, and `chatbot-providers.ts` are net-new and need no pre-flight grep.)
- localStorage keys to clean up if they exist (one-time, on first run): `fileconcat-favorite-models`, `fileconcat-output-ratio`, `fileconcat-selected-model`. Decision: leave the keys orphaned (no migration, no read path = no functional impact). They are user-local and harmless.
