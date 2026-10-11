#!/usr/bin/env bash
# FIZZ & POP v2 — every game-module check in one go (needs ./build.sh run first for the dist-based ones).
#   test/game_all.sh            exit code 1 if any step fails
#   steps: mechanics + presentation tests on the stubs and on the real modules, mechanics equivalence against the pre-v2 build, the v3 wave gates (G1-G8, V1, V2, V6),
#          the "Abyss Glow" visual gates, integration smoke, stuck walkers, boss bots   (FULL=1 adds the slow QA stuck audits)
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
FAILS=()
LOGDIR=out/v3/game
mkdir -p "$LOGDIR"
step() { local name="$1"; shift; echo "=== $name"; if "$@" > "$LOGDIR/step_${name// /_}.log" 2>&1; then echo "    ok"; else echo "    FAILED ($LOGDIR/step_${name// /_}.log)"; tail -4 "$LOGDIR/step_${name// /_}.log" | sed 's/^/    | /'; FAILS+=("$name"); fi; }
step "game_tests (stubs)"      node test/game_tests.mjs
step "game_tests (real)"       env REAL=1 node test/game_tests.mjs
step "game_equiv (vs pre-v2)"  node test/game_equiv.mjs 3000
step "visual gates"            node test/game_visual.mjs
step "game_v3 (stubs)"         node test/game_v3_tests.mjs
step "game_v3 look (real)"     node test/game_v3_look.mjs
step "game_v3 alloc (G7)"      env ASSERT=1 node test/game_v3_alloc.mjs 3 600
step "game_main_smoke"         node test/game_main_smoke.mjs
step "stuck walkers 29 rounds" node test/game_stuck.mjs 6 4500 700
step "boss bot 1P"             node test/game_boss_bot.mjs --seeds 6 --players 1 --max 100
step "boss bot 2P"             node test/game_boss_bot.mjs --seeds 6 --players 2 --max 150
# the QA stuck audits step (and so render) every single frame through Main: ~1.5 ms per frame with the v2 renderer = many minutes; opt in with FULL=1
if [ "${FULL:-0}" = "1" ]; then
  step "qa codereview stuck"   bash -c 'node test/qa_codereview_stuck.mjs 2 4500 | tee /dev/stderr | grep -q "total stuck enemy instances 0"'
  step "qa mechanics stuck2"   bash -c 'node test/qa_mechanics_stuck2.mjs | tee /dev/stderr | grep -q "^count 0"'
fi
echo
if [ ${#FAILS[@]} -eq 0 ]; then echo "ALL GAME CHECKS PASSED"; else echo "FAILED: ${FAILS[*]}"; exit 1; fi
