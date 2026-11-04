# liteparse-wasm, patched build

`llamaindex-liteparse-wasm-2.18.0-fc.1.tgz` is `@llamaindex/liteparse-wasm` 2.18.0
built from liteparse commit `40abdff` (tag `wasm-v2.18.0`) with three patches applied
in this order:

- `rule-touch.patch` keeps a run of text that only touches a table rule in its own
  cell; upstream 2.16.0 cut the first word of each wrapped line into the column to
  its left.
- `prose-veto.patch` keeps a page-wide ruled table unless its cells read as prose;
  upstream dropped it whenever one layout region tabled on its own, which lost
  header rows and columns.
- `split-words.patch` reads a table candidate as text when its cells end in
  words split by a hyphen: prose cut into columns, which upstream emitted as a
  table.

Each patch's commit message carries its measurements. They were written on 2.16.0
and ported to 2.17.0 and 2.18.0. On 2.18.0, `prose-veto.patch` carries its own copy
of the `is_cjk` helper, which upstream removed from `ocr_merge.rs`, and the
`split-words.patch` filter runs before upstream's 70% span filter.

A fourth patch, `span-text.patch` (a table run that keeps under 70% of its lines'
text is read as text, and a line no cell took a word from is emitted ahead of the
table), went upstream as run-llama/liteparse PR 531 and ships in 2.18.0, so it is
no longer carried here.

Built without the patches, the same steps produced output identical to the npm
2.17.0 package on 383 PDFs (markdown and text items), so the build itself changes
nothing. That check was not repeated for 2.18.0; the steps are unchanged.

Rebuild (on a liteparse upgrade, re-apply the patches or drop one once upstream has
its fix):

    git clone https://github.com/run-llama/liteparse && cd liteparse
    git checkout <wasm tag> && git am <this dir>/rule-touch.patch <this dir>/prose-veto.patch \
        <this dir>/split-words.patch
    rustup target add wasm32-unknown-unknown   # rust 1.95.0, as upstream CI
    cargo install wasm-pack --locked
    cd packages/wasm && npm run build && rm pkg/.gitignore
    # set "version" to <upstream>-fc.N, then:
    npm pack --pack-destination <this dir>

Then point `apps/web` and `packages/cli` at the new tarball, run `pnpm install`,
and update the header of `apps/web/licenses/liteparse-wasm.txt`.

Before taking an upgrade, compare `lit parse --format text` with
`lit parse --format markdown --keep-headers-footers` over the real corpus: a word
the text output has and the markdown lacks is text the layout dropped. That is
how the 2.17.0 losses behind `span-text.patch` were found. Compare each build
against its own text output: from 2.18.0 the native `lit` writes math as LaTeX,
so another build's text counts every rewritten formula as lost.
