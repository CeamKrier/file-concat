# liteparse-wasm, patched build

`llamaindex-liteparse-wasm-2.17.0-fc.1.tgz` is `@llamaindex/liteparse-wasm` 2.17.0
built from liteparse commit `a47f56d` (tag `wasm-v2.17.0`) with four patches applied
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
- `span-text.patch` keeps the text of every line a table run covers: a table
  that carries under 70% of its lines' text is read as text, and a line no cell
  took a word from is emitted ahead of the table. Upstream 2.17.0 dropped such
  lines from the markdown while its text output kept them.

Each patch's commit message carries its measurements. The first three were
written on 2.16.0 and ported to 2.17.0: `prose-veto.patch` now sits after
upstream's own reworked veto (a covering local table needs two or more columns),
and the `rule-touch.patch` test passes the parameter 2.17.0 added to
`assign_cells`.

Built without the patches, the same steps produce output identical to the npm 2.17.0
package on 383 PDFs (markdown and text items), so the build itself changes nothing.

Rebuild (on a liteparse upgrade, re-apply the patches or drop one once upstream has
its fix):

    git clone https://github.com/run-llama/liteparse && cd liteparse
    git checkout <wasm tag> && git am <this dir>/rule-touch.patch <this dir>/prose-veto.patch \
        <this dir>/split-words.patch <this dir>/span-text.patch
    rustup target add wasm32-unknown-unknown   # rust 1.95.0, as upstream CI
    cargo install wasm-pack --locked
    cd packages/wasm && npm run build && rm pkg/.gitignore
    # set "version" to <upstream>-fc.N, then:
    npm pack --pack-destination <this dir>

Then point `apps/web` and `packages/cli` at the new tarball, run `pnpm install`,
and update the header of `apps/web/licenses/liteparse-wasm.txt`.

Before taking an upgrade, compare `lit parse --format text` with
`lit parse --format markdown --keep-headers-footers` over the real corpus: a line
the text output has and the markdown lacks is text the layout dropped. That is
how the 2.17.0 losses above were found.
