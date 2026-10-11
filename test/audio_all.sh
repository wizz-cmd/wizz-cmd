#!/usr/bin/env bash
# FIZZ & POP — every audio test of the v2.0 soundtrack, in order: lint (composition rules), notation unit tests, composer gates (form / hooks / tempo x1.3 / arcs), FIXPLAN_V3 gates (v3_kicks: four-on-the-floor drops, v3_alt: second-pass versions + pass seams, v3_mix: SFX pump / burst / critical-cue SNR on a warm chain), analysis (K-weighted loudness / peaks / seams / SFX / demos),
# runtime API semantics (strict bundle wrapping), the real-game flow checks, the sound-board smoke test, CPU.
# Usage: test/audio_all.sh [--no-cpu]      Exit code 1 if any step fails.   (FP_TIMING=advisory: wall-clock-only steps skipped / advisory, see the CPU note below)
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
mkdir -p out/v2/audio
FAILS=()
step() { local name="$1"; shift; echo "=== $name"; if "$@" > "out/v2/audio/step_${name}.log" 2>&1; then echo "    ok"; else echo "    FAILED (see out/v2/audio/step_${name}.log)"; tail -6 "out/v2/audio/step_${name}.log" | sed 's/^/    | /'; FAILS+=("$name"); fi; }
step lint            node test/audio_lint.mjs
step notation        node test/audio_notation_test.mjs
step composer        node test/audio_composer.mjs
step v3_kicks        node test/audio_v3_kicks.mjs
step v3_alt          node test/audio_v3_alt.mjs
step analyze         node test/audio_analyze.mjs --nowav
step v3_mix          node test/audio_v3_mix.mjs --ctx stage1_D2,stage2_D2,boss_F
step runtime_strict  node test/audio_runtime.mjs --strict
step k7_realgame     node test/audio_k7_realgame.mjs
step autoplay        node test/audio_autoplay.mjs
step board_smoke     node test/audio_board_smoke.mjs
# CPU-share steps measure the wall-clock load of a live context on a shared VM: ADVISORY (release-gate policy). A blocking run (FP_TIMING=advisory, set by test/e2e_all.sh) skips them here; the
# e2e perf step (test/e2e_perf.mjs) runs them best of 3 and reports the numbers. By hand (no env) they run as before.
if [ "${1:-}" != "--no-cpu" ] && [ "${FP_TIMING:-}" != "advisory" ]; then step cpu node test/audio_cpu.mjs; step cpu_sections node test/audio_cpu_sections.mjs; step cpu_sections_pass1 node test/audio_cpu_sections.mjs --pass 1; else echo "=== cpu / cpu_sections / cpu_sections_pass1: advisory, run by the e2e perf step (test/e2e_perf.mjs)"; fi
echo
if [ ${#FAILS[@]} -eq 0 ]; then echo "AUDIO ALL GREEN"; else echo "FAILED: ${FAILS[*]}"; exit 1; fi
