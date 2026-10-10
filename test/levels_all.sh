#!/usr/bin/env bash
# Full level test run (a few minutes): regenerate src/30_levels.js from the designs, run the contract validator,
# the physics/fairness/air analysis, the wave-2 / wave-3 data assertions, build the game (flock'ed: other modules build
# concurrently), start every round in the real game, check with the real Game physics that no player can be trapped
# (traps) and no walker is held for good (walkers), the wave-3 behaviour checks (R16 slab rooms, R19 springle corners), that the movement model of levels_check still equals the Game (model),
# re-render the review images into out/levels/.
#   Usage: test/levels_all.sh [--no-render]
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== generate";    node test/levels_gen.mjs
echo "== validate";    node tools/validate_levels.mjs | tail -2
echo "== analyse";     node test/levels_check.mjs --quiet | tail -3
echo "== wave-2 data"; node test/levels_wave2_check.mjs | tail -2
echo "== wave-3 data"; node test/levels_wave3_check.mjs | tail -2
echo "== build";       flock /tmp/fizzpop.build.lock ./build.sh | tail -1
echo "== integration"; node test/levels_integration.mjs | tail -2
echo "== model";       node test/levels_physics_diff.mjs | tail -1
echo "== traps";       node test/levels_realtrap.mjs | tail -2
echo "== wave-3 real";  node test/levels_wave3_real.mjs | tail -6
echo "== walkers";     node test/levels_stuckmap.mjs --levels all --target none --seeds 3,11 --frames 2400 | tail -3
if [[ "${1:-}" != "--no-render" ]]; then echo "== render"; node test/levels_render.mjs | tail -1; fi
echo "all level checks passed"
