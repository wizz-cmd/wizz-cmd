/* FIZZ & POP — 00_shared.js
 * Shared constants (C) and utilities (U). Contract: SPEC §2.4.
 *
 * Design notes:
 *  - C is frozen; every module may use C and U at load time.
 *  - U.rng is mulberry32: tiny, fast, good enough for gameplay randomness, fully
 *    deterministic for a given 32-bit seed (needed for reproducible test runs).
 *  - U.store wraps localStorage. EVERY access is inside try/catch (private windows,
 *    sandboxed iframes and blocked site data all throw). When storage is unusable we
 *    fall back to an in-memory Map so the game keeps working for the session.
 *    Values are JSON-encoded; a corrupt entry yields the fallback, never an exception.
 */
const C = Object.freeze({
  W: 256, H: 224, TILE: 8, COLS: 32, ROWS: 26, MAP_Y: 16, FPS: 60,
  INNER_L: 16, INNER_R: 240,            // x bounds inside the outer walls
  STORE_PREFIX: 'fizzpop.v1.',
});

const U = (() => {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

  /** Move v toward target by at most step (step is treated as a magnitude). */
  const approach = (v, target, step) => {
    step = Math.abs(step);
    if (v < target) return Math.min(v + step, target);
    if (v > target) return Math.max(v - step, target);
    return target;
  };

  /** Axis-aligned rectangle overlap (touching edges do NOT overlap). */
  const overlap = (ax, ay, aw, ah, bx, by, bw, bh) =>
    ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;

  /** mulberry32 seeded PRNG. Same seed -> same sequence, always. */
  const rng = (seed) => {
    let s = (seed === undefined || seed === null || Number.isNaN(+seed) ? 1 : +seed) >>> 0;
    const next = () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next,
      /** Integer in [a, b], both inclusive. */
      int: (a, b) => {
        if (b === undefined) { b = a; a = 0; }
        if (b < a) { const t = a; a = b; b = t; }
        return a + Math.floor(next() * (b - a + 1));
      },
      /** Float in [a, b). */
      float: (a = 0, b = 1) => a + next() * (b - a),
      /** Random element of a non-empty array (undefined for an empty one). */
      pick: (arr) => (arr.length ? arr[Math.floor(next() * arr.length)] : undefined),
      /** True with probability p. */
      chance: (p) => next() < p,
    };
  };

  /** JSON key/value store with localStorage + in-memory fallback. */
  const store = (() => {
    const mem = new Map();
    const get = (key, fallback) => {
      const k = C.STORE_PREFIX + key;
      try {
        const raw = window.localStorage.getItem(k);
        if (raw !== null && raw !== undefined) return JSON.parse(raw);
      } catch (e) { /* storage unavailable or corrupt JSON: fall through to memory */ }
      return mem.has(k) ? mem.get(k) : fallback;
    };
    const set = (key, value) => {
      const k = C.STORE_PREFIX + key;
      mem.set(k, value);                         // always mirror in memory
      try { window.localStorage.setItem(k, JSON.stringify(value)); } catch (e) { /* ignore */ }
    };
    return { get, set };
  })();

  return { clamp, lerp, sign, approach, overlap, rng, store };
})();
