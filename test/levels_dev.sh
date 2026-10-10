#!/usr/bin/env bash
# Dev loop for one round: regenerate src/30_levels.js (partial mode), print validator report + ASCII, render PNG.
#   test/levels_dev.sh 8            -> out/levels/r08.png
set -e
cd "$(dirname "$0")/.."
LEVELS_PARTIAL=1 node test/levels_gen.mjs >/dev/null
node tools/validate_levels.mjs --only "$1" --ascii "$1" --reach | sed -n '2,200p' || true
node test/levels_render.mjs "$1" >/dev/null
