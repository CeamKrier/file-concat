#!/bin/bash
# usage: run.sh <repo root at some commit> <outdir>
# Every probe through that tree's web chain; out: <outdir>/<dir>/<probe>.out.txt.
# The tree can be any commit (a worktree), the probes are always these ones.
set -u
root=$(cd "$1" && pwd); mkdir -p "$2"; out=$(cd "$2" && pwd)
here=$(cd "$(dirname "$0")" && pwd)
P=$here/probes
for d in $(ls $P); do
  [ -d $P/$d ] || continue
  mkdir -p $out/$d
  for f in $(ls $P/$d); do
    if [ $d = html ]; then
      cp $P/$d/$f $out/$d/$f
      sed "s#@REPO@/#$root/#g" $here/gen/run-html.mts.in > $out/run-html.mts
      (cd $root/apps/web && node_modules/.bin/tsx $out/run-html.mts $out/$d/$f >/dev/null 2>&1)
      rm -f $out/$d/$f
    else
      (cd $root && EXTRACTION_CORPUS=$P/$d pnpm -s --filter @fileconcat/cli measure-extraction --dump $f --web > $out/$d/$f.out.txt 2>&1)
    fi
  done
done
rm -f $out/run-html.mts
