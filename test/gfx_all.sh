#!/usr/bin/env bash
# Runs the whole GFX suite (src/ based) + the visual QA gate against dist (build first: flock /tmp/fizzpop.build.lock ./build.sh).
cd "$(dirname "$0")/.." || exit 1
rc=0
for t in gfx_selftest gfx_text gfx_players gfx_bg gfx_camo gfx_items; do echo "== $t"; node test/$t.mjs > /tmp/gfx_$t.log 2>&1 || { rc=1; tail -5 /tmp/gfx_$t.log; echo "FAILED: $t"; }; done
echo "== gfx_angryposes (+ patched-dist proof)"; node test/gfx_angryposes.mjs --proof > /tmp/gfx_angryposes.log 2>&1 || { rc=1; tail -5 /tmp/gfx_angryposes.log; echo "FAILED: gfx_angryposes"; }
echo "== gfx_perf"; node test/gfx_perf.mjs | tail -3
echo "== qa_visual_assert (GFX gates G1 G3 G5)"; node test/qa_visual_assert.mjs | grep -E "^G(1|3|5) " ; node test/qa_visual_assert.mjs | grep -E "^G(1|3|5) PASS" | wc -l | grep -q 3 || rc=1
exit $rc
