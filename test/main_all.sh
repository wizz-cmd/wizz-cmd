#!/usr/bin/env bash
# FIZZ & POP — every Main / template / build.sh check: stub-module suite, real-module smoke, Artifact fragment in a minimal
# skeleton (+ sandboxed cross-origin iframe), and the QA platform repros that prove the wave-2 fixes (they read dist/fizzpop.html).
# Usage: test/main_all.sh [--quick]     (--quick: only the main_* scripts, incl. the wave-3 K1-K3 / R1-R8 / P2-P6 checks, the v2 render / quality / reduced-motion checks and the v3 UX / performance-logic checks)
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
mkdir -p out/main/logs
FAILS=()
step() {
  local name="$1"; shift
  echo "=== $name"
  if timeout 600 "$@" > "out/main/logs/$name.log" 2>&1; then echo "    ok"; else echo "    FAILED (out/main/logs/$name.log)"; tail -5 "out/main/logs/$name.log" | sed 's/^/    | /'; FAILS+=("$name"); fi
}
step build              flock /tmp/fizzpop.build.lock ./build.sh
step main_tests_stubs   node test/main_tests.mjs
step main_tests_real    node test/main_tests.mjs --real
step main_artifact      node test/main_artifact.mjs --no-build
step main_quit_jingle   node test/main_quit_jingle.mjs
step main_matrix        node test/main_matrix.mjs
step main_wave3         node test/main_wave3.mjs
step main_v2            node test/main_v2.mjs
step main_v3_ux         node test/main_v3_ux.mjs
step main_v3_perf       node test/main_v3_perf.mjs
if [[ "${1:-}" != "--quick" ]]; then
  for q in qa_platform_r2_hostvis qa_platform_r2_audiorecover qa_audio_interrupt qa_platform_r2_mouse qa_platform_r2_sweep qa_platform_r2_hybrid \
           qa_platform_r2_touch qa_platform_r2_overlap qa_platform_r2_robust qa_platform_r2_pixelgrid qa_codereview_pause \
           qa_codereview_gamepad qa_platform_r2_gamepad2 qa_platform_r2_bigcanvas qa_platform_r2_refocus qa_codereview_join_continue; do
    step "$q" node "test/$q.mjs"
  done
fi
echo
if [[ ${#FAILS[@]} -gt 0 ]]; then echo "MAIN CHECKS FAILED: ${FAILS[*]}"; exit 1; fi
echo "ALL MAIN CHECKS PASSED"
