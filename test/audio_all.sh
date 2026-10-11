#!/usr/bin/env bash
# FIZZ & POP — every audio test of the v2.0 soundtrack, in order: lint (composition rules), notation unit tests, composer gates (form / hooks / tempo x1.3 / arcs), analysis (K-weighted loudness / peaks / seams / SFX / demos),
# runtime API semantics (strict bundle wrapping), the real-game flow checks, the sound-board smoke test, CPU.
# Usage: test/audio_all.sh [--no-cpu]      Exit code 1 if any step fails.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
mkdir -p out/v2/audio
FAILS=()
step() { local name="$1"; shift; echo "=== $name"; if "$@" > "out/v2/audio/step_${name}.log" 2>&1; then echo "    ok"; else echo "    FAILED (see out/v2/audio/step_${name}.log)"; tail -6 "out/v2/audio/step_${name}.log" | sed 's/^/    | /'; FAILS+=("$name"); fi; }
step lint            node test/audio_lint.mjs
step notation        node test/audio_notation_test.mjs
step composer        node test/audio_composer.mjs
step analyze         node test/audio_analyze.mjs --nowav
step runtime_strict  node test/audio_runtime.mjs --strict
step k7_realgame     node test/audio_k7_realgame.mjs
step autoplay        node test/audio_autoplay.mjs
step board_smoke     node test/audio_board_smoke.mjs
if [ "${1:-}" != "--no-cpu" ]; then step cpu node test/audio_cpu.mjs; step cpu_sections node test/audio_cpu_sections.mjs; fi
echo
if [ ${#FAILS[@]} -eq 0 ]; then echo "AUDIO ALL GREEN"; else echo "FAILED: ${FAILS[*]}"; exit 1; fi
