#!/usr/bin/env bash
# FIZZ & POP — full integration run: build, static validators, every module suite, then the e2e smoke test.
# Usage: test/e2e_all.sh            (any cwd). Exit code 1 if any step fails; each step's tail is printed.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
FAILS=()
step() {
  local name="$1"; shift
  echo "=== $name"
  if "$@" > "out/e2e/step_$(echo "$name" | tr ' /' '__').log" 2>&1; then
    echo "    ok"
  else
    echo "    FAILED (see out/e2e/step_$(echo "$name" | tr ' /' '__').log)"
    tail -5 "out/e2e/step_$(echo "$name" | tr ' /' '__').log" | sed 's/^/    | /'
    FAILS+=("$name")
  fi
}
mkdir -p out/e2e
step "build"                 ./build.sh
step "validate_levels"       node tools/validate_levels.mjs -q
step "check_gfx"             node tools/check_gfx.mjs
step "gfx_selftest"          node test/gfx_selftest.mjs
step "audio_lint"            node test/audio_lint.mjs
step "audio_analyze"         node test/audio_analyze.mjs --nowav
step "audio_runtime"         node test/audio_runtime.mjs --strict
step "game_tests"            node test/game_tests.mjs
step "main_tests_real"       node test/main_tests.mjs --real
step "e2e_smoke"             node test/e2e_smoke.mjs
# ---- wave 2 integration: gates and QA repro scripts that prove the fixes (QA scripts exit 0 even when a bug reproduces, so those
#      steps grep their output for BUG_REPRODUCED = true)
step "qa_visual_assert"      node test/qa_visual_assert.mjs
step "game_visual"           node test/game_visual.mjs
step "levels_wave2_check"    node test/levels_wave2_check.mjs
step "levels_wave3_check"    node test/levels_wave3_check.mjs
step "levels_wave3_real"     node test/levels_wave3_real.mjs --quick
step "main_artifact"         node test/main_artifact.mjs --no-build
step "qa_audio_flow"         node test/qa_audio_flow.mjs
step_nobug() {   # step_nobug <name> <script> : the script must not print BUG_REPRODUCED = true
  local name="$1" script="$2"
  echo "=== $name"
  local log="out/e2e/step_$name.log"
  node "test/$script.mjs" > "$log" 2>&1
  if grep -Eqi 'BUG_REPRODUCED[^=]*= *true' "$log" || [ "$(grep -c '' "$log")" -eq 0 ]; then
    echo "    FAILED (see $log)"; tail -5 "$log" | sed 's/^/    | /'; FAILS+=("$name")
  else echo "    ok"; fi
}
for q in qa_codereview_zombie qa_codereview_boss_hurry qa_codereview_boss_ghost qa_codereview_leading qa_codereview_quit_jingle qa_codereview_pause_jingle; do
  [ -f "test/$q.mjs" ] && step_nobug "$q" "$q"
done
# walkers must never stay confined (wave-2 stuck-walker fix): 2 seeds x all 29 rounds
echo "=== qa_codereview_stuck (2 seeds, all rounds)"
node test/qa_codereview_stuck.mjs 2 > out/e2e/step_qa_codereview_stuck.log 2>&1
if grep -Eq 'total stuck enemy instances 0( |$)' out/e2e/step_qa_codereview_stuck.log; then echo "    ok"; else echo "    FAILED (see out/e2e/step_qa_codereview_stuck.log)"; tail -5 out/e2e/step_qa_codereview_stuck.log | sed 's/^/    | /'; FAILS+=("qa_codereview_stuck"); fi
echo
if [ ${#FAILS[@]} -eq 0 ]; then echo "ALL GREEN"; else echo "FAILED: ${FAILS[*]}"; exit 1; fi
