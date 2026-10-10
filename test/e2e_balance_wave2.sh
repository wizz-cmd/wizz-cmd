#!/usr/bin/env bash
# FIZZ & POP -- wave-2 integration: re-run the QA balance pipeline (reach -> air -> ceil, chain, boss bot) against the current
# dist/fizzpop.html with all output redirected to out/wave2/qa_balance (wave-1 evidence in out/qa/balance stays untouched).
# Usage: test/e2e_balance_wave2.sh [levels]      levels = "all" (default) or a comma list such as 5,11,12
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
LV="${1:-all}"
OUT="$ROOT/out/wave2/qa_balance"
mkdir -p "$OUT"
patch() {   # patch <src> <dst>: redirect OUT and the lib import
  sed -e "s#'out', 'qa', 'balance'#'out', 'wave2', 'qa_balance'#g" -e "s#out/qa/balance#out/wave2/qa_balance#g" \
      -e "s#'./qa_balance_lib.mjs'#'./_w2b_qa_balance_lib.mjs'#g" "$1" > "$2"
}
patch test/qa_balance_lib.mjs test/_w2b_qa_balance_lib.mjs
for n in reach air ceil chain; do patch "test/qa_balance_$n.mjs" "test/_w2b_$n.mjs"; done
cleanup() { rm -f test/_w2b_*.mjs; }
trap cleanup EXIT
echo "== reach ($LV)";  node test/_w2b_reach.mjs --levels "$LV" --pad 1 > "$OUT/reach.log" 2>&1; tail -2 "$OUT/reach.log"
echo "== air ($LV)";    node test/_w2b_air.mjs --levels "$LV"          > "$OUT/air.log" 2>&1;   tail -3 "$OUT/air.log"
if [ "$LV" = "all" ]; then
  echo "== ceil";  node test/_w2b_ceil.mjs  > "$OUT/ceil.log" 2>&1;  cat "$OUT/ceil.log"
  echo "== chain"; node test/_w2b_chain.mjs > "$OUT/chain.log" 2>&1; cat "$OUT/chain.log"
else
  echo "== chain"; node test/_w2b_chain.mjs "$LV" > "$OUT/chain.log" 2>&1; cat "$OUT/chain.log"
fi
echo "== boss bot (1P, 6 seeds)"; node test/qa_balance_boss.mjs --seeds 6 --players 1 | tee "$OUT/boss_1p.log" | tail -3
echo "== boss bot (2P, 4 seeds)"; node test/qa_balance_boss.mjs --seeds 4 --players 2 | tee "$OUT/boss_2p.log" | tail -3
