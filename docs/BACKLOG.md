# Backlog — deferred follow-ups

Work that was consciously scoped out while shipping the repo-completeness
(ADR-0004) and document-extraction (ADR-0003) features. Nothing here blocks
those features — they ship working. This is the "we'll look later" list.

Last updated: 2026-07-08 (development branch, after T2 + T3).

## Document extraction (ADR-0003) — feature works; these are polish

- **Extraction worker offload.** Zip-based formats (docx/xlsx/pptx/odf) parse on
  the main thread inside `officeparser`, so a very large office document can
  briefly block the UI. (PDF already runs in pdf.js's own worker.) Move office
  parsing into a dedicated Web Worker. — _perf; medium effort._
- **Explicit in-bundle "extracted from" label.** The extracted text is included
  under the file's own `.pdf`/`.docx` path and the result view shows an
  "extracted from N documents" card, so the label is currently implicit. If we
  want the LLM to see an explicit marker, prepend a per-file header in the
  output assembler (`packages/core/src/file-processing/output.ts`). — _small._
- **CLI migration to shared `extractDocument`.** The CLI still calls
  `officeparser` directly via its `--parse` path; migrate it onto
  `@fileconcat/core`'s `extractDocument` so both surfaces share one definition
  (the intended "shared core home" from ADR-0003). — _small; touches published CLI._
- **Remote extractable documents.** A PDF inside a GitHub/GitLab/Bitbucket repo
  is fetched as garbage text today — the source adapters decode every blob as
  text, losing the bytes. Extraction only works for local uploads. To support
  remote documents, adapters would need to pass raw bytes for extractable
  extensions. — _medium._
- **OCR for scanned/encrypted PDFs.** Out of v1 by decision (ADR-0003). Such
  files surface as "no extractable text". `officeparser` bundles `tesseract.js`;
  enabling OCR is opt-in but heavy. — _large; explicit no for now._
- **`pdf.worker.min.mjs` duplicated into `dist/server`.** A `?url` asset emitted
  into the SSR output; harmless (the worker gzips to ~350 KiB and total upload is
  well under the 3 MiB limit) but avoidable. — _cleanup._

## Repo completeness (ADR-0004) — feature works; these are extensions

- **Archive fallback for Bitbucket / GitLab.** GitHub falls back to a zipball on
  tree truncation; the other two do not. Bitbucket's recursive `/src` listing is
  also serially paginated, so it is complete but slow on very large repos. Give
  them the same one-request archive path (`Bitbucket get/{ref}.tar.gz`, GitLab
  archive). — _medium._
- **Auth / PAT token option.** Unauthenticated GitHub is 60 req/hr; even with
  bounded concurrency + retries a large per-file download can exhaust it.
  Recorded as explicitly unresolved in ADR-0004. — _medium; UX + secret handling._

## URL → site → markdown (parked initiative)

Fully parked. Research complete (deep-research, 2026-07-08). Positioning:
"any source → one bundle", website part as an **`llms-full.txt` generator**.
Engine chosen: **Defuddle + linkedom** on Cloudflare Workers (edge-native);
crawl/discovery to be built ourselves (no edge-ready crawler exists).

Open decisions to resume with:
- **Crawl execution model (Soru 9, unanswered):** synchronous single-invocation
  with a hard page cap (surface the cap per ADR-0004) vs. an async job via
  Cloudflare Workflows/Queues for arbitrarily large sites.
- **Caching design:** KV (25 MiB/value) + R2 fallback, keyed by normalized URL +
  options hash, with a TTL. The caching half of the research was **not verified**
  (the deep-research run hit a session limit); re-verify the Cloudflare specifics
  before designing.
- Sequencing agreed: (a) in-app crawl-to-markdown first, then (b) the
  `fileconcat.com/<url>` URL-addressable surface + API.

## Verification / process

- **Browser end-to-end for document extraction.** Build, typecheck, lint, 188
  core tests (incl. real-docx extraction), and the Cloudflare worker size are all
  verified. Dropping a real PDF/office file in a live browser and confirming the
  extracted text was **not** run — the remaining manual verification step.
- **PR `development → master`.** The docs commit + T2 + T3 live on `development`,
  unpushed; open the PR when ready to integrate.
