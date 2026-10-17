#!/bin/bash
# usage: TIKA_JAR=<tika-app-3.3.2.jar> run-corpus45.sh <corpus dir> <outdir>
# The 45 hard files (written by dump-corpus.mts) through Tika, markitdown, file, git and rg.
set -u
C=$1; O=$2
mkdir -p $O/tika $O/markitdown $O/file $O/git $O/rg
for d in $(ls $C); do
  [ -d "$C/$d" ] || continue
  f=$(ls -A "$C/$d" | head -1); p="$C/$d/$f"
  timeout 120 java -jar "$TIKA_JAR" --text "$p" > $O/tika/$d.out 2> $O/tika/$d.err; echo "exit $?" >> $O/tika/$d.err
  timeout 120 uvx --from 'markitdown[all]==0.1.5' markitdown "$p" > $O/markitdown/$d.out 2> $O/markitdown/$d.err; echo "exit $?" >> $O/markitdown/$d.err
  file -b "$p" > $O/file/$d.out
  git diff --numstat --no-index /dev/null "$p" > $O/git/$d.out 2>&1
  rg -c . "$p" > $O/rg/$d.out 2>&1; echo "exit $?" >> $O/rg/$d.out
done
