# Extract document text in the browser, not on a server

FileConcat's core guarantee is that **file bytes never leave the machine** —
processing is local, the web app is offline-capable, and privacy is the whole
pitch. **Extractable documents** (PDF, Word, Excel, PowerPoint, OpenDocument —
see CONTEXT.md) are therefore parsed **client-side**, in the browser, and never
uploaded to an extraction service.

We use [`officeparser`](https://www.npmjs.com/package/officeparser) — the same
library the CLI already depends on. It is isomorphic: its browser build accepts
an `ArrayBuffer`/`Uint8Array` and returns a format-agnostic AST we render to
text, covering all seven formats through a single dependency. PDFs are handled
by `pdf.js` running in a **Web Worker** (the same client-side WASM/worker shape
we already ship for tiktoken), so no format needs a server round-trip.

Two constraints make the client-side choice hold its promise:

1. **The pdf.js worker is self-hosted, not CDN-loaded.** `officeparser` defaults
   `pdfWorkerSrc` to a jsDelivr URL; we override it to a worker script we vendor
   ourselves (version-pinned to the bundled `pdfjs-dist`). At runtime the app
   makes **zero third-party requests** — a CDN fetch would leak *that* a document
   was opened and add an outage/supply-chain dependency, both off-brand.
2. **The parser is lazy-loaded.** `pdfjs-dist` is multi-MB; it stays out of the
   main bundle and loads the first time an extractable document is encountered,
   so the common (text/code) path pays nothing.

## Deliberately rejected: a server-side extraction API

The obvious shortcut is a `/extract` route (or third-party API) that receives
the file and returns text — lighter client bundle, higher fidelity, and OCR for
scanned PDFs come "for free". We rejected it: it sends user bytes to a server,
which directly contradicts the privacy guarantee that distinguishes FileConcat.
Recording the rejection so a future reader does not "simplify" the multi-MB
client bundle into an upload. If OCR or fidelity ever justifies a server path, it
must be an explicit, opt-in deviation from local processing — not the default.

## Consequences

- **No OCR in v1.** Scanned image-only or encrypted PDFs yield no text; per the
  glossary they surface with a "couldn't extract text" flag rather than being
  silently dropped — they are never presented as empty successes.
- **Worker version lock.** The self-hosted `pdf.worker` must stay pinned to the
  exact `pdfjs-dist` version bundled inside `officeparser`; a version drift
  breaks PDF parsing. This is a maintenance obligation on `officeparser` bumps.
- **Bundle weight on first document.** The first extractable document triggers a
  multi-MB chunk load. Acceptable because it is lazy and one-time per session.
- **Shared core home.** The extractability predicate and the extraction call
  belong in `packages/core` (`file-processing`), so the web and the CLI converge
  on one definition of what an Extractable document is and how its text is pulled.
