#!/usr/bin/env bash
# Runs the whole GFX suite (src/ based) + the visual QA gate against dist (build first: flock /tmp/fizzpop.build.lock ./build.sh).
# v2.0: the pixel-era gates are re-based on the Abyss Glow look (same intent, see each file's header) and the module suites of NEON / GFX core / cast run first.
cd "$(dirname "$0")/.." || exit 1
rc=0
run() { local name="$1"; shift; echo "== $name"; "$@" > "/tmp/gfx_$name.log" 2>&1 || { rc=1; tail -6 "/tmp/gfx_$name.log"; echo "FAILED: $name"; }; }
run v2_neon_test        node test/v2_neon_test.mjs
run v2_gfxcore_test     node test/v2_gfxcore_test.mjs --cast
run v2_gfxcore_read     node test/v2_gfxcore_readability.mjs
run v2_gfxcore_v3       node test/v2_gfxcore_v3.mjs
run v2_gfxcore_rebake   node test/v2_gfxcore_rebake.mjs
run v2_cast_test        node test/v2_cast_test.mjs
for t in gfx_selftest gfx_text gfx_players gfx_bg gfx_camo gfx_items; do run $t node test/$t.mjs; done
run gfx_angryposes      node test/gfx_angryposes.mjs --proof
run gfx_perf            node test/gfx_perf.mjs
run qa_visual_assert    node test/qa_visual_assert.mjs
exit $rc
