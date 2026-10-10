// FIZZ & POP — test/levels_dsl.mjs
// Tiny map-authoring DSL used by test/levels_gen.mjs to build the 30 rounds of src/30_levels.js.
// Coordinates are TILE coordinates of the 32 x 26 map: col 0-31, row 0-25. Inner play range is
// cols 2..29 and rows 1..24; rows 0 / 25 are ceiling / floor, cols 0-1 / 30-31 the outer walls.
// Mirror axis of a symmetric design is between col 15 and col 16 (mirror(c) = 31 - c).

export const COLS = 32, ROWS = 26;
export const mirror = (c) => 31 - c;

export class MapBuilder {
  /** @param {Array<[number,number]>} gaps floor+ceiling gap runs [a,b] (inclusive cols, within 2..29) */
  constructor(gaps = []) {
    this.g = Array.from({ length: ROWS }, () => Array(COLS).fill('.'));
    for (let r = 0; r < ROWS; r++) for (const c of [0, 1, 30, 31]) this.g[r][c] = '#';
    for (let c = 2; c <= 29; c++) { this.g[0][c] = '#'; this.g[ROWS - 1][c] = '#'; }
    this.gaps = gaps;
    for (const [a, b] of gaps) for (let c = a; c <= b; c++) { this.g[0][c] = '.'; this.g[ROWS - 1][c] = '.'; }
  }
  #check(r, c) {
    if (r < 1 || r > 24 || c < 2 || c > 29) throw new Error(`out of inner area: row ${r} col ${c}`);
  }
  set(r, c, ch) { this.#check(r, c); this.g[r][c] = ch; return this; }
  /** horizontal run at row r, cols a..b */
  H(r, a, b) { for (let c = a; c <= b; c++) this.set(r, c, '#'); return this; }
  /** horizontal run + its mirror image */
  S(r, a, b) { return this.H(r, a, b).H(r, mirror(b), mirror(a)); }
  /** filled box rows r0..r1, cols a..b */
  B(r0, r1, a, b) { for (let r = r0; r <= r1; r++) this.H(r, a, b); return this; }
  BS(r0, r1, a, b) { return this.B(r0, r1, a, b).B(r0, r1, mirror(b), mirror(a)); }
  /** thick (2-row) platform: surface row r, cols a..b */
  T(r, a, b) { return this.B(r, r + 1, a, b); }
  TS(r, a, b) { return this.S(r, a, b).S(r + 1, a, b); }
  /** clear box */
  X(r0, r1, a, b) { for (let r = r0; r <= r1; r++) for (let c = a; c <= b; c++) this.set(r, c, '.'); return this; }
  XS(r0, r1, a, b) { return this.X(r0, r1, a, b).X(r0, r1, mirror(b), mirror(a)); }
  /**
   * Stamp ASCII art with its top-left at (c0, r0). '#' = block, '_' = force empty, anything else = leave.
   * opts.mirror: also stamp the mirror image about the map centre.
   */
  art(c0, r0, lines, opts = {}) {
    lines.forEach((line, dy) => {
      [...line].forEach((ch, dx) => {
        if (ch !== '#' && ch !== '_') return;
        const v = ch === '#' ? '#' : '.';
        this.set(r0 + dy, c0 + dx, v);
        if (opts.mirror) this.set(r0 + dy, mirror(c0 + dx), v);
      });
    });
    return this;
  }
  /** Fill the cells whose centre lies inside the ellipse (cx, cy, rx, ry in tile units). val '#' or '.' */
  ell(cx, cy, rx, ry, val = '#') {
    for (let r = 1; r <= 24; r++) for (let c = 2; c <= 29; c++) {
      const dx = (c + 0.5 - cx) / rx, dy = (r + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) this.g[r][c] = val;
    }
    return this;
  }
  /** Elliptical ring (outer minus inner ellipse) restricted to rows r0..r1 (use for half shells / arches). */
  ellRing(cx, cy, rxO, ryO, rxI, ryI, r0 = 1, r1 = 24) {
    for (let r = Math.max(1, r0); r <= Math.min(24, r1); r++) for (let c = 2; c <= 29; c++) {
      const x = c + 0.5 - cx, y = r + 0.5 - cy;
      if ((x / rxO) ** 2 + (y / ryO) ** 2 <= 1 && (x / rxI) ** 2 + (y / ryI) ** 2 > 1) this.g[r][c] = '#';
    }
    return this;
  }
  /** Ring between outer and inner radius (circle in tile units; ry scales y so tiles look round). */
  ring(cx, cy, rOut, rIn, val = '#') {
    for (let r = 1; r <= 24; r++) for (let c = 2; c <= 29; c++) {
      const d = Math.hypot(c + 0.5 - cx, r + 0.5 - cy);
      if (d <= rOut && d >= rIn) this.g[r][c] = val;
    }
    return this;
  }
  /** Fill the cells whose centre lies inside the polygon (even-odd), vertices in tile units. */
  poly(pts, val = '#') {
    for (let r = 1; r <= 24; r++) for (let c = 2; c <= 29; c++) {
      const x = c + 0.5, y = r + 0.5;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) this.g[r][c] = val;
    }
    return this;
  }
  /**
   * Draw a fat poly-line: points [[x, y, radius], ...] in tile units, radius interpolated linearly;
   * every cell whose centre is within the local radius of the path is filled.
   */
  stroke(pts, val = '#') {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, y0, r0] = pts[i], [x1, y1, r1] = pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4));
      for (let k = 0; k <= n; k++) {
        const t = k / n, cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t, rr = r0 + (r1 - r0) * t;
        for (let r = Math.max(1, Math.floor(cy - rr - 1)); r <= Math.min(24, Math.ceil(cy + rr + 1)); r++) {
          for (let c = Math.max(2, Math.floor(cx - rr - 1)); c <= Math.min(29, Math.ceil(cx + rr + 1)); c++) {
            if (Math.hypot(c + 0.5 - cx, r + 0.5 - cy) <= rr) this.g[r][c] = val;
          }
        }
      }
    }
    return this;
  }
  rows() { return this.g.map((r) => r.join('')); }
}

/** Walker standing on surface row s (box top-left row = s - 2). */
export const walker = (t, c, s, d = 1) => ({ t, c, r: s - 2, d });
/** Flyer / free-placed enemy with explicit top-left tile. */
export const flyer = (t, c, r, d = 1) => ({ t, c, r, d });
