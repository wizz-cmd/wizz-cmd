#!/usr/bin/env bash
# FIZZ & POP — full integration run (v3 RELEASE-GATE POLICY, FIXPLAN_V3): BLOCKING steps + ONE advisory "perf" step.
#   BLOCKING (this script's exit code): every functional, contract, visual-legibility, photosensitivity, mechanics-equivalence, level, artifact-fragment and deterministic audio check.
#            Wall-clock / CPU-share checks inside those suites are printed as "ADVISORY ok / MISS" (FP_TIMING=advisory is exported for the blocking steps) and never fail them.
#   ADVISORY: step "perf" (test/e2e_perf.mjs) re-runs every timing suite UNCHANGED (strict thresholds), best of 3, prints the numbers and compares the real-frame-time budgets
#            (test/v3_budgets_real.mjs) with the recorded baseline (out/v3/regress/budgets_real_base.json); a regression > 25 % in all 3 runs is reported as a FINDING. It never changes the exit code.
# FIZZ & POP — full integration run: build, static validators, every module suite, then the e2e smoke test.
# v3 (FIXPLAN_V3): + v3_contracts (runtime cross-module contracts), v3_photosens (WCAG-style region flash scan of rendered frames); the real-frame-time budget report is test/v3_budgets_real.mjs (report only: timing on a CPU-raster VM).
# v2.0: + the GFX suite (rebased gates + NEON / GFX core / cast suites), the game / main / audio suites, the SPEC_V2 section 5 budgets and section 1 photosensitivity gates.
# Usage: test/e2e_all.sh [--quick] [--no-perf] [--perf-only]    (any cwd). Exit code 1 if any BLOCKING step fails; each step's tail is printed.
#   --quick skips the slow audio renders (audio_analyze, cpu) and the full QA platform sweep; the default run is the release gate (~45 min on a 4-core container, + the perf step).
#   --no-perf skips the advisory perf step; --perf-only runs only that step.
set -u
QUICK=0; PERF=1; PERF_ONLY=0
for a in "$@"; do case "$a" in --quick) QUICK=1;; --no-perf) PERF=0;; --perf-only) PERF_ONLY=1;; esac; done
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
if [ $PERF_ONLY -eq 1 ]; then node test/e2e_perf.mjs; exit 0; fi
export FP_TIMING=advisory      # blocking run: wall-clock checks inside the suites only print ADVISORY lines (see test/timing_gate.mjs); the perf step below runs them strict
step "build"                 flock /tmp/fizzpop.build.lock ./build.sh
step "validate_levels"       node tools/validate_levels.mjs -q
step "check_gfx"             node tools/check_gfx.mjs
step "gfx_all"               bash test/gfx_all.sh
if [ $QUICK -eq 1 ]; then
  step "audio_lint"          node test/audio_lint.mjs
  step "audio_notation"      node test/audio_notation_test.mjs
  step "audio_composer"      node test/audio_composer.mjs --quick
  step "audio_runtime"       node test/audio_runtime.mjs --strict
else
  step "audio_all"           bash test/audio_all.sh
fi
step "game_all"              bash test/game_all.sh
step "main_all (quick)"      bash test/main_all.sh --quick
step "e2e_smoke"             node test/e2e_smoke.mjs
step "e2e_budgets (non-timing)"  node test/e2e_budgets.mjs --only=size,photo,reduced      # desktop / phone / boot / hitch frame-time sections: perf step
# ---- v3 regression wave: cross-module contracts at runtime (frozen sprites, GFX.drawHero, ring particles, no unknown names) and the photosensitivity scan of recorded frames
step "v3_contracts"          node test/v3_contracts.mjs
step "v3_photosens"          node test/v3_photosens.mjs
# ---- wave 2 integration: gates and QA repro scripts that prove the fixes (QA scripts exit 0 even when a bug reproduces, so those
#      steps grep their output for BUG_REPRODUCED = true)
step "qa_visual_assert"      node test/qa_visual_assert.mjs
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
if [ ${#FAILS[@]} -eq 0 ]; then echo "BLOCKING STEPS: ALL GREEN"; else echo "FAILED: ${FAILS[*]}"; fi
# ---- the one advisory step (never changes the exit code): timing suites strict + best of 3, budgets vs the baseline
if [ $PERF -eq 1 ] && [ $QUICK -eq 0 ]; then
  echo
  echo "=== perf (advisory: wall-clock / CPU-share checks, best of 3; numbers reported, never blocking)"
  unset FP_TIMING
  node test/e2e_perf.mjs 2>&1 | tee out/e2e/step_perf.log | sed 's/^/    /'
fi
if [ ${#FAILS[@]} -eq 0 ]; then echo "ALL GREEN"; else exit 1; fi
