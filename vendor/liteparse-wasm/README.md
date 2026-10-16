# liteparse-wasm, patched build

`llamaindex-liteparse-wasm-2.16.0-fc.1.tgz` is `@llamaindex/liteparse-wasm` 2.16.0
built from liteparse commit `9f17a9d` (tag `wasm-v2.16.0`) with `rule-touch.patch`
applied. The patch keeps a run of text that only touches a table rule in its own
cell; upstream 2.16.0 cut the first word of each wrapped line into the column to
its left. The commit message in the patch carries the measurements.

Built without the patch, the same steps produce output identical to the npm 2.16.0
package on 383 PDFs (markdown and text items), so the build itself changes nothing.

Rebuild (on a liteparse upgrade, re-apply the patch or drop it once upstream has
the fix):

    git clone https://github.com/run-llama/liteparse && cd liteparse
    git checkout <wasm tag> && git am <this dir>/rule-touch.patch
    rustup target add wasm32-unknown-unknown   # rust 1.95.0, as upstream CI
    cargo install wasm-pack --locked
    cd packages/wasm && npm run build && rm pkg/.gitignore
    # set "version" to <upstream>-fc.N, then:
    npm pack --pack-destination <this dir>

Then point `apps/web` and `packages/cli` at the new tarball, run `pnpm install`,
and update the header of `apps/web/licenses/liteparse-wasm.txt`.
