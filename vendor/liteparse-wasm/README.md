# liteparse-wasm, patched build

`llamaindex-liteparse-wasm-2.16.0-fc.2.tgz` is `@llamaindex/liteparse-wasm` 2.16.0
built from liteparse commit `9f17a9d` (tag `wasm-v2.16.0`) with two patches applied
in this order:

- `rule-touch.patch` keeps a run of text that only touches a table rule in its own
  cell; upstream 2.16.0 cut the first word of each wrapped line into the column to
  its left.
- `prose-veto.patch` keeps a page-wide ruled table unless its cells read as prose;
  upstream dropped it whenever one layout region tabled on its own, which lost
  header rows and columns.

Each patch's commit message carries its measurements.

Built without the patches, the same steps produce output identical to the npm 2.16.0
package on 383 PDFs (markdown and text items), so the build itself changes nothing.

Rebuild (on a liteparse upgrade, re-apply the patches or drop one once upstream has
its fix):

    git clone https://github.com/run-llama/liteparse && cd liteparse
    git checkout <wasm tag> && git am <this dir>/rule-touch.patch <this dir>/prose-veto.patch
    rustup target add wasm32-unknown-unknown   # rust 1.95.0, as upstream CI
    cargo install wasm-pack --locked
    cd packages/wasm && npm run build && rm pkg/.gitignore
    # set "version" to <upstream>-fc.N, then:
    npm pack --pack-destination <this dir>

Then point `apps/web` and `packages/cli` at the new tarball, run `pnpm install`,
and update the header of `apps/web/licenses/liteparse-wasm.txt`.
