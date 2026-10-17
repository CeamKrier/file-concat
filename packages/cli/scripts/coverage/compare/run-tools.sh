#!/bin/bash
# usage: TIKA_JAR=<tika-app-3.3.2.jar> run-tools.sh <tika|markitdown> <probes dir> <outdir>
# Every probe through one comparator; out: <outdir>/<dir>/<probe>.out.txt and .err.txt
# (stderr plus the exit code). One process per file, 300 s each.
set -u
tool=$1; P=$2; out=$3
for d in $(ls $P); do
  [ -d $P/$d ] || continue
  mkdir -p $out/$d
  for f in $(ls $P/$d); do
    [ -f $P/$d/$f ] || continue
    case $tool in
      tika) timeout 300 java -jar "$TIKA_JAR" --text $P/$d/$f > $out/$d/$f.out.txt 2> $out/$d/$f.err.txt; echo "exit $?" >> $out/$d/$f.err.txt ;;
      markitdown) timeout 300 uvx --from 'markitdown[all]==0.1.5' markitdown $P/$d/$f > $out/$d/$f.out.txt 2> $out/$d/$f.err.txt; echo "exit $?" >> $out/$d/$f.err.txt ;;
    esac
  done
done
