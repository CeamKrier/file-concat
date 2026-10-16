#!/bin/bash
# usage: run-corpus.sh <repo root at some commit> <corpus dir> <out dir> [jobs]
# Every file of a real corpus (build-cc-corpus.py's layout, <format>/<file>)
# through that tree's web chain, one process per file so a hang or a crash
# costs that file only. Out: <out dir>/<format>/<file>.out.txt (the --dump
# text) and <file>.exit ("<exit code> <milliseconds>"; 124 is the timeout).
# Run the same corpus through two commits and compare the out dirs.
set -u
root=$(cd "$1" && pwd); corpus=$(cd "$2" && pwd); mkdir -p "$3"; out=$(cd "$3" && pwd)
jobs=${4:-8}
here=$(cd "$(dirname "$0")" && pwd)
sed "s#@REPO@/#$root/#g" $here/coverage/gen/run-html.mts.in > $out/run-html.mts
one() {
  fmt=$1 f=$2 start=$(date +%s%N)
  if [ $fmt = html ]; then
    cp $corpus/$fmt/$f $out/$fmt/$f
    (cd $root/apps/web && timeout 300 node_modules/.bin/tsx $out/run-html.mts $out/$fmt/$f >/dev/null 2>&1)
    code=$?
    rm -f $out/$fmt/$f
  else
    (cd $root && EXTRACTION_CORPUS=$corpus/$fmt timeout 300 pnpm -s --filter @fileconcat/cli measure-extraction --dump $f --web > $out/$fmt/$f.out.txt 2>&1)
    code=$?
  fi
  echo "$code $(( ($(date +%s%N) - start) / 1000000 ))" > $out/$fmt/$f.exit
}
export -f one; export root corpus out
for d in $corpus/*/; do
  fmt=$(basename $d); mkdir -p $out/$fmt
  ls $d | while read f; do [ -e $out/$fmt/$f.exit ] || echo "$fmt $f"; done
done | xargs -P $jobs -n 2 bash -c 'one "$0" "$1"'
rm -f $out/run-html.mts
