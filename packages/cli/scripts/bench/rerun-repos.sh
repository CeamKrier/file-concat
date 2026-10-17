#!/usr/bin/env bash
# Reruns FileConcat on the 60-repository sample of the repomix-vs-gitingest-vs-
# code2prompt study and scores it against the rivals' stored results. Writes
# docs/measurements/bench-repos-<version>.json. About 15-25 minutes, mostly clones.
#
#   packages/cli/scripts/bench/rerun-repos.sh [--version 2.6] [--clones <dir>] [--limit 3]
#
# Method and flags: the header of rerun-repos.ts next to this file.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec pnpm exec tsx scripts/bench/rerun-repos.ts "$@"
