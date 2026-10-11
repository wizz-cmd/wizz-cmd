// FIZZ & POP v2.0 - release-gate policy helper (FIXPLAN_V3 "Release-gate policy", regression wave).
//
// This shared 4-core CPU-raster VM makes every wall-clock / CPU-share measurement noisy, so such checks are split off the blocking gate:
//   * a BLOCKING run (test/e2e_all.sh default, FP_TIMING=advisory) prints them as "ADVISORY ok / MISS <name>" and never fails on them;
//   * the separate advisory `perf` step of test/e2e_all.sh runs the very same checks UNCHANGED (FP_TIMING unset = strict, same thresholds), best of 3,
//     and only reports the numbers; a consistent regression > 25 % against out/v3/regress/budgets_real_base.log is a finding, not a failure.
// A script run by hand (no env) behaves exactly as before: every timing check is strict.
//
// Usage in a script:  import { ADVISORY, timingCheck } from './timing_gate.mjs';
//                     const tcheck = timingCheck(check);        // check = the script's (name, ok, detail) function
//                     tcheck('draw() <= 2.5 ms', ms <= 2.5, ms);
// Browser-side buckets: collect failed timing checks into a separate array (tbad) and report it once with tcheck on the Node side.
export const ADVISORY = process.env.FP_TIMING === 'advisory';
export function timingCheck(check, results) {
  return (name, ok, detail) => {
    if (!ADVISORY) return check(name, ok, detail);
    const d = detail === undefined ? '' : String(detail).slice(0, 400);
    console.log((ok ? 'ADVISORY ok   ' : 'ADVISORY MISS ') + name + (d ? '  ' + d : ''));
    if (results) results.push({ name: '[advisory] ' + name, ok: true, info: true, detail: (ok ? '' : 'MISS ') + d });
  };
}
