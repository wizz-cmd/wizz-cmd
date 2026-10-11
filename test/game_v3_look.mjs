// FIZZ & POP v3 - Game wave PIXEL gates on the REAL modules (FIXPLAN_V3 Game: G1 strobe area, G5 smooth transition, G8 contrast, V2 HUD band, V1 frozen on every theme).
//   node test/game_v3_look.mjs [k=3]                 post FX on (as in the game), real GFX / cast / levels; prints the measured numbers
//   GAME=../backup/v3/game_40_game.js node test/game_v3_look.mjs   the same gates against the pre-v3 Game: they must FAIL there (proof that they bite)
import { launch, PROJECT } from '../tools/harness.mjs';
import path from 'path';

const K = +(process.argv[2] || 3);
const OLD = !!process.env.GAME;
const t = await launch({ html: path.join(PROJECT, 'test', 'game_harness.html') + `?real=1&k=${K}&post=2` + (OLD ? '&game=' + process.env.GAME : '') });
const page = t.page;
await page.waitForFunction(() => !!window.__t);
const ev = (fn, arg) => page.evaluate(fn, arg);
await ev(() => __t.freeze(true));
let fails = 0;
const check = (name, okk, detail) => { console.log((okk ? 'PASS  ' : 'FAIL  ') + name + (detail ? '\n        ' + detail : '')); if (!okk) fails++; };
const settle = async (ms = 700) => {                    // let GFX finish its background bakes (world canvases / overlay arrive in slices) before pixels are measured
  await new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 40; i++) { const idle = await ev(() => { __t.step(1); const s = typeof GFX._stats === 'function' ? GFX._stats() : { jobs: 0, migrating: false }; return !s.jobs && !s.migrating; }); if (idle) break; await new Promise((r) => setTimeout(r, 250)); }
};

await ev(() => {
  window.PX = {
    lin: (() => { const a = new Float32Array(256); for (let i = 0; i < 256; i++) { const v = i / 255; a[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); } return a; })(),
    L(d) { const o = new Float32Array(d.length / 4); for (let i = 0; i < o.length; i++) o[i] = 0.2126 * PX.lin[d[i * 4]] + 0.7152 * PX.lin[d[i * 4 + 1]] + 0.0722 * PX.lin[d[i * 4 + 2]]; return o; },
    grab() { const cv = __t.canvas; return cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height).data; },
  };
});

// ---- G1: the ink telegraph's changed area per frame (WCAG-style: >= 0.1 relative luminance, dark side < 0.8) --------------------------------
{
  await ev(() => { const T = __t; T.start({ players: 1, level: 30, seed: 8 }); T.step(160); Game.debug.god(true); const S = T.S(), b = S.enemies[0]; S.thunderT = 1e9; b.jx = 0; b.jy = 0; b.x = 104; b.y = 56; b.inkT = 70; S.players[0].x = 24; S.players[0].y = 200; });
  await settle();
  const r = await ev(() => {
    const T = __t, S = T.S(), b = S.enemies[0]; const k = T.canvas.width / 256; let prev = null; const area = [], means = [];
    for (let f = 0; f < 110; f++) {
      T.step(1); b.x = 104; b.y = 56;
      const l = PX.L(PX.grab()); let m = 0, n = 0; const W = T.canvas.width;
      for (let y = Math.round(48 * k); y < Math.round(112 * k); y++) for (let x = Math.round(96 * k); x < Math.round(160 * k); x++) { m += l[y * W + x]; n++; }
      means.push(m / n);
      if (prev) { let c = 0; for (let p = 0; p < l.length; p++) { const dl = l[p] - prev[p]; if ((dl >= 0.1 && prev[p] < 0.8) || (dl <= -0.1 && l[p] < 0.8)) c++; } area.push(c / l.length * 100); }
      prev = l;
    }
    let rev = 0, last = 0; for (let i = 1; i < means.length; i++) { const d = means[i] - means[i - 1]; if (Math.abs(d) < 0.004) continue; const s = d > 0 ? 1 : -1; if (last && s !== last) rev++; last = s; }
    return { maxArea: Math.max(...area), over1: area.filter((a) => a >= 1).length, rev, swing: Math.max(...means) - Math.min(...means) };
  });
  check('G1 ink telegraph: changed area per frame stays tiny (no strobe)', r.maxArea < 1 && r.over1 === 0, `max changed area ${r.maxArea.toFixed(2)} % of the canvas, frames >= 1 %: ${r.over1}, luminance direction changes ${r.rev} in 110 frames (the pre-v3 build: 3.5 %, 15 frames, 10 changes)`);
}

// ---- G5: frame-to-frame difference of the round change ----------------------------------------------------------------------------------------
{
  await ev(() => { const T = __t; T.start({ players: 1, level: 3, seed: 5 }); T.step(160); Game.debug.god(true); Game.debug.spawn('food_3', 120, 100); Game.debug.spawn('pu_shoes', 80, 150); Game.debug.killAll(); Game.debug.noClear(false); for (let i = 0; i < 900 && T.state().phase !== 'transition'; i++) T.step(1); });
  await settle(900);
  await ev(() => __t.opts({ post: 0 }));              // measured WITHOUT the post pass: its bloom is refreshed every other frame (GFX pipelines it), which would alternate the frame differences by itself
  const r = await ev(() => {
    const T = __t; const W = T.canvas.width, k = W / 256; const diffs = []; let prev = null;
    for (let f = 0; f < 118; f++) {
      T.step(1);
      const d = PX.grab(); const cur = new Uint8Array(W * 40 * 4);                            // a 40 px band through the middle of the playfield (walls, platforms)
      const y0 = Math.round(100 * k); for (let i = 0; i < cur.length; i++) cur[i] = d[y0 * W * 4 + i];
      if (prev) { let s = 0; for (let i = 0; i < cur.length; i += 4) s += Math.abs(cur[i] - prev[i]) + Math.abs(cur[i + 1] - prev[i + 1]) + Math.abs(cur[i + 2] - prev[i + 2]); diffs.push(s / (cur.length / 4) / 3); }
      prev = cur;
    }
    return diffs;
  });
  await ev(() => __t.opts({ post: 2 }));
  // the scroll accelerates and decelerates: the frame differences must rise and fall smoothly (no 0 / big alternation): count direction changes of the diff series with a jitter tolerance
  const mid = r.slice(20, 100); let rough = 0; for (let i = 1; i < mid.length - 1; i++) { if ((mid[i] - mid[i - 1]) * (mid[i + 1] - mid[i]) < 0 && Math.abs(mid[i] - mid[i - 1]) > 0.25 * Math.max(mid[i], 1)) rough++; }
  const ends = [...r.slice(0, 12), ...r.slice(-12)]; let ticks = 0; for (let i = 1; i < ends.length; i++) if (Math.abs(ends[i] - ends[i - 1]) > 1.5 && (ends[i] < 0.05 || ends[i - 1] < 0.05)) ticks++;
  check('G5 round change scrolls smoothly (frame differences have no tick pattern)', rough <= 6 && ticks <= 2, `rough reversals in the fast part: ${rough}, 0 <-> N ticks at the slow ends: ${ticks}; first diffs ${r.slice(0, 10).map((v) => v.toFixed(2)).join(' ')} | last ${r.slice(-10).map((v) => v.toFixed(2)).join(' ')}`);
}

// ---- G8: contrast of the missing EXTEND letters against the wall, all six themes, both sides --------------------------------------------------------
{
  const res = await ev(async () => {
    const T = __t, cv = T.canvas, K = cv.width / 256, out = [];
    const lum = (r, g, b) => 0.2126 * PX.lin[r] + 0.7152 * PX.lin[g] + 0.0722 * PX.lin[b];
    for (const lvl of [1, 6, 11, 16, 21, 26]) {
      T.start({ players: 2, level: lvl, seed: 5 }); Game.debug.skipIntro(); T.step(30); await new Promise((r) => setTimeout(r, 500)); T.step(2);
      const a = PX.grab();
      const o = GFX.text; GFX.text = (c, s, x, y, col, opt) => (opt && opt.shadow === false && opt.glow === false && String(s).length === 1 ? 0 : o.call(GFX, c, s, x, y, col, opt));     // the same frame without the dim letters
      T.render(); const b = PX.grab(); GFX.text = o;
      for (const side of [0, 1]) {
        const x0 = Math.round((side ? 248 : 8) * K - 5 * K), x1 = Math.round((side ? 248 : 8) * K + 5 * K), y0 = Math.round(48 * K), y1 = Math.round(96 * K);
        const fg = [], bg = [];
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const i = (y * cv.width + x) * 4;
          if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 40) { fg.push(lum(a[i], a[i + 1], a[i + 2])); bg.push(lum(b[i], b[i + 1], b[i + 2])); }
        }
        const idx = fg.map((v, i) => i).sort((p, q) => fg[q] - fg[p]).slice(0, Math.max(1, Math.floor(fg.length * 0.4)));
        const mf = idx.reduce((s, i) => s + fg[i], 0) / idx.length, mb = idx.reduce((s, i) => s + bg[i], 0) / idx.length;
        out.push({ lvl, side, n: fg.length, cr: (mf + 0.05) / (mb + 0.05) });
      }
    }
    return out;
  });
  const min = Math.min(...res.map((x) => x.cr)), pix = Math.min(...res.map((x) => x.n));
  check('G8 missing EXTEND letters: >= 3:1 against the wall on all 6 themes (both sides) at the test scale', min >= 3 && pix >= 100, `min contrast ${min.toFixed(2)}:1 (per cell ${res.map((x) => x.cr.toFixed(2)).join(' ')}; glyph pixels >= ${pix}; the pre-v3 build measures 1.8-1.9:1)`);
}

// ---- V2: the HUD band is the water, not a flat strip. Measured in the free parts of the band (between the score columns and right of HI SCORE): per-column mean over the 14 rows, its mean and its spread over x.
//      The old flat #02040a fill measures mean 39-45 / spread 2.4-3.4 (grain + bloom only); the water band 70-98 / 10-29.
{
  const rows = [];
  for (const lvl of [1, 6, 11, 16, 21, 26]) {
    await ev((lvl) => { __t.start({ players: 1, level: lvl, seed: 3 }); Game.debug.skipIntro(); __t.step(30); }, lvl);
    await settle(500);
    rows.push(await ev(() => {
      __t.step(2); const cv = __t.canvas, k = cv.width / 256, g = cv.getContext('2d', { willReadFrequently: true });
      const W = cv.width, H = Math.round(14 * k), d = g.getImageData(0, Math.round(k), W, H).data, cols = [];
      const xs = []; for (let x = 66; x < 94; x++) xs.push(x); for (let x = 170; x < 232; x++) xs.push(x);
      for (const xl of xs) { let s = 0, n = 0; for (let x = Math.round(xl * k); x < Math.round((xl + 1) * k); x++) for (let y = 0; y < H; y++) { const i = (y * W + x) * 4; s += d[i] + d[i + 1] + d[i + 2]; n++; } cols.push(s / n); }
      const m = cols.reduce((a, b) => a + b, 0) / cols.length;
      return { mean: m, sd: Math.sqrt(cols.reduce((a, b) => a + (b - m) ** 2, 0) / cols.length) };
    }));
  }
  const minMean = Math.min(...rows.map((r) => r.mean)), minSd = Math.min(...rows.map((r) => r.sd));
  check('V2 HUD band is the continuous water (no flat strip) on all 6 themes', minMean >= 55 && minSd >= 6, `free band area: mean ${rows.map((r) => r.mean.toFixed(0)).join('/')}, spread over x ${rows.map((r) => r.sd.toFixed(1)).join('/')} (the pre-v3 flat band: ~42 / ~3)`);
}

// ---- V1: frozen enemies read as ICE (pale, desaturated), not as a hue: mean saturation of the bright pixels of each creature, frozen vs the same creature active, on all 6 themes ----------
{
  const r = await ev(async () => {
    const T = __t, out = [], K = T.canvas.width / 256;
    const sat = (a, x0, y0, w, h) => { let sw = 0, ws = 0, n = 0, hx = 0, hy = 0; for (let y = Math.round(y0 * K); y < Math.round((y0 + h) * K); y++) for (let x = Math.round(x0 * K); x < Math.round((x0 + w) * K); x++) { const i = (y * T.canvas.width + x) * 4; const r = a[i] / 255, g = a[i + 1] / 255, b = a[i + 2] / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx < 0.55) continue; const s = mx ? (mx - mn) / mx : 0; ws += s * mx; sw += mx; n++; } return { s: sw ? ws / sw : 0, n }; };
    for (const lvl of [1, 6, 11, 16, 21, 26]) {
      const row = { lvl, frozen: {}, active: {}, ice: GFX.has('nibbler_frozen') };
      for (const mode of ['frozen', 'active']) {
        T.start({ players: 1, level: lvl, seed: 5 }); T.step(160); Game.debug.god(true); Game.debug.clearEnemies(); const S = T.S();
        const types = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'];
        types.forEach((ty, i) => { Game.debug.spawn(ty, 40 + i * 36, 184); const e = S.enemies[S.enemies.length - 1]; e.vx = 0; e.vy = 0; if (mode === 'frozen') { e.state = 'frozen'; e.freezeT = 300; } else { e.state = 'active'; e.animT = 0; } });
        S.players[0].x = 100; S.players[0].y = 120;
        await new Promise((r) => setTimeout(r, 400)); T.step(1);
        // hold every creature still on its spot for the grab
        for (let f = 0; f < 3; f++) { S.enemies.forEach((e, i) => { e.x = 40 + i * 36; e.y = 184; e.vx = 0; e.vy = 0; if (mode === 'active') { e.pauseT = 0; } }); T.render(); }
        const a = PX.grab();
        types.forEach((ty, i) => { row[mode][ty] = sat(a, 40 + i * 36 - 2, 184 - 2, 20, 20); });
      }
      out.push(row);
    }
    return out;
  });
  const worst = []; let allIce = true;
  for (const row of r) for (const ty of Object.keys(row.frozen)) { const f = row.frozen[ty].s, a = row.active[ty].s; worst.push([row.lvl, ty, f, a]); if (!(f < 0.5 && f < a * 0.8)) allIce = false; }
  check('V1 frozen enemies read as ice: low saturation, clearly below the same creature active, on all 6 themes', r.every((x) => x.ice) && allIce, worst.map((w) => `${w[0]}/${w[1]} ${w[2].toFixed(2)} vs ${w[3].toFixed(2)}`).join(' | '));
}

console.log(t.errors.length ? 'errors ' + JSON.stringify(t.errors) : 'no console errors');
if (t.errors.length) fails++;
await t.close();
console.log(fails ? 'FAILED ' + fails : 'ALL V3 LOOK GATES PASSED');
process.exit(fails ? 1 : 0);
