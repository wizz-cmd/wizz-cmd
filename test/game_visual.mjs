// FIZZ & POP v2 — game module: measurable presentation gates on the REAL rendered game (real GFX / LEVELS / AUDIO in test/game_harness.html?real=1,
// canvas k = 3 under setTransform(k) exactly like Main). Re-based on the "Abyss Glow" look (SPEC_V2 sec. 7): same intent as the pixel-era gates
// (legibility, distinctness, contrast, no overlap), measured on the new neon look.   node test/game_visual.mjs      exit code 1 when a gate fails
//  V1 ROUND banner     : all 30 rounds: the background UNDER the "ROUND n" text (frame rendered with that text suppressed) keeps WCAG contrast >= 4.5 against the white-hot text
//  V2 round number     : HUD round label "R01" (v3: in the ceiling row, inset; digits + 'R'; all 30 rounds): same idea against the soft dark pool behind them
//  V3 frozen look      : every enemy type reads differently frozen: dE76 >= 20 between active and frozen OR the mean chroma falls by >= 35 % OR the saturation of its bright pixels falls by >= 40 %
//                        (v3: the cast's <e>_frozen ice cast is pale and desaturated; the cobalt Glimmer's lantern / core keep its mean Lab close, its saturation drops 0.5 -> 0.2)
//  V4 other banners    : EXTEND!, GAME OVER and the victory text sit on the soft dark gradient band: it darkens the side margins of the inner width by >= 45 % (energy ratio), one round per theme
//  V5 boss gauge       : hidden in the intro (no neon line at the gauge row); thin neon bar + gold crown while fighting; the fill shrinks with HP
//  V6 hurry banner     : only a faint soft band while the text is lit, almost nothing at the end of its fade-out (v3: no hard blink: it fades in, pulses at 2 Hz, fades out); a jellop / pebble behind it stays >= 60 % as bright
//  V7 popups on banner : a score popup inside a banner band keeps its light (drawn after the band: its added light equals the same popup without a band, within 12 %)
//  V8 angry readability: angry enemies on red / lava tiles (R22) keep dE76 >= 25 against the surrounding tiles; the Game draws NO aura (a single sprite draw, no silhouette copies)
//  V9 no strobing      : an invulnerable player never flips between fully visible / invisible (v3: a smooth alpha pulse between 0.4 and 1 at <= 4 Hz, no frame-to-frame jump > 0.2); under reduced motion it is steady 0.6
import { launch, PROJECT } from '../tools/harness.mjs';
import path from 'path';
const t = await launch({ html: path.join(PROJECT, 'test', 'game_harness.html') + '?real=1&k=3&post=0' });
const page = t.page;
await page.waitForFunction(() => !!window.__t);
await page.evaluate(() => __t.freeze(true));
const res = await page.evaluate(() => {
  const T = __t, K = T.K, cv = T.canvas, cx = cv.getContext('2d', { willReadFrequently: true });
  const D = () => Game.debug, S = () => D()._S(), out = {};
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const lab = (r, g, b) => { const f = (v) => lin(v); const R = f(r), G = f(g), B = f(b); const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883; const h = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116); return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))]; };
  const raw = (x, y, w, h) => cx.getImageData(Math.round(x * K), Math.round(y * K), Math.max(1, Math.round(w * K)), Math.max(1, Math.round(h * K))).data;
  const lums = (x, y, w, h) => { const d = raw(x, y, w, h), o = []; for (let i = 0; i < d.length; i += 4) o.push(lum(d[i], d[i + 1], d[i + 2])); return o; };
  const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
  const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const withoutText = (pred, fn) => { const o = GFX.text; GFX.text = (c, s, ...r) => (pred(String(s)) ? 0 : o.call(GFX, c, s, ...r)); try { return fn(); } finally { GFX.text = o; } };
  const contrast = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  const TEXT_L = lum(0xea, 0xff, 0xff);

  // V1: ROUND banner, 30 rounds (first intro frames, text at y 84..100 centred, scale 2)
  const v1 = [];
  for (let r = 1; r <= 30; r++) {
    T.start({ players: 1, level: r, seed: 7 }); T.step(3);
    const w = ('ROUND ' + r).length * 16, x0 = Math.round(128 - w / 2) - 4;
    const bg = withoutText((s) => s.startsWith('ROUND '), () => { T.render(); return lums(x0, 84, w + 8, 16); });
    v1.push({ r, c: +contrast(TEXT_L, pct(bg, 0.99)).toFixed(2) });
  }
  out.V1 = { pass: v1.every((x) => x.c >= 4.5), failing: v1.filter((x) => x.c < 4.5), min: Math.min(...v1.map((x) => x.c)) };
  // V2: HUD round label "R01" (v3: x 1..25, y 16..24 = the ceiling row): the two digits (x 9..25) against the soft dark pool behind them, with the 'R' and the digits suppressed
  const v2 = [], DIG_L = lum(0xcf, 0xfa, 0xff);
  for (let r = 1; r <= 30; r++) {
    T.start({ players: 1, level: r, seed: 7 }); T.step(3);
    const bg = withoutText((s) => /^\d\d$/.test(s) || s === 'R', () => { T.render(); return lums(1, 17, 24, 6); });
    v2.push({ r, c: +contrast(DIG_L, pct(bg, 0.99)).toFixed(2) });
  }
  out.V2 = { pass: v2.every((x) => x.c >= 4.5), failing: v2.filter((x) => x.c < 4.5), min: Math.min(...v2.map((x) => x.c)) };
  // V3: frozen vs active, per enemy type, on a busy crystal round
  const v3 = {};
  for (const k of ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer']) {
    T.start({ players: 1, level: 17, seed: 7 }); D().god(true); D().noClear(true); D().skipIntro(); D().clearEnemies(); T.step(2);
    const grab = () => { const d = raw(0, 16, 256, 208), o = []; for (let i = 0; i < d.length; i += 4) o.push([d[i], d[i + 1], d[i + 2]]); return o; };
    const bg = grab();
    D().spawn(k, 120, 100); const e = S().enemies[S().enemies.length - 1]; e.vx = 0; e.vy = 0;
    const sprite = (setup) => { setup(); T.render(); const im = grab(); let n = 0, L = 0, A = 0, B = 0, sw = 0, ws = 0; for (let i = 0; i < im.length; i++) { const a = im[i], b = bg[i]; if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 60) { const l = lab(...a); n++; L += l[0]; A += l[1]; B += l[2]; const mx = Math.max(a[0], a[1], a[2]) / 255, mn = Math.min(a[0], a[1], a[2]) / 255; if (mx >= 0.55) { sw += mx; ws += (mx ? (mx - mn) / mx : 0) * mx; } } } return [L / n, A / n, B / n, n, sw ? ws / sw : 0]; };
    const normal = sprite(() => { e.state = 'active'; e.x = 120; e.y = 100; e.animT = 0; });
    const frozen = sprite(() => { e.state = 'frozen'; e.freezeT = 1e9; e.x = 120; e.y = 100; });
    const dE = Math.hypot(normal[0] - frozen[0], normal[1] - frozen[1], normal[2] - frozen[2]);
    const chN = Math.hypot(normal[1], normal[2]), chF = Math.hypot(frozen[1], frozen[2]);
    v3[k] = { dE: +dE.toFixed(1), chromaNormal: +chN.toFixed(1), chromaFrozen: +chF.toFixed(1), satNormal: +normal[4].toFixed(2), satFrozen: +frozen[4].toFixed(2), ok: dE >= 20 || chF <= 0.65 * chN || frozen[4] <= 0.6 * normal[4] };
  }
  out.V3 = { pass: Object.values(v3).every((v) => v.ok), frozen: v3 };
  // V4: other banners: the soft band darkens the whole inner width, margins included (compared with the same frame without the banner)
  const v4 = {};
  const bannerFrac = (name, round, setup, y0, h, texts) => {
    T.start({ players: 1, level: round, seed: 7 }); D().god(true); D().skipIntro(); T.step(2); setup(); T.step(2);
    const strips = [[17, 6], [24, 6], [226, 6], [233, 6]];                // the side margins, left and right of every banner text
    const withB = strips.map(([x, w]) => mean(lums(x, y0, w, h)));
    const noB = withoutBand(() => strips.map(([x, w]) => mean(lums(x, y0, w, h))));
    v4[name + '@R' + round] = +(withB.reduce((a, b) => a + b, 0) / Math.max(1e-6, noB.reduce((a, b) => a + b, 0))).toFixed(2);
  };
  // "without the band" = the same frame with the gradient band fill suppressed: createLinearGradient fills of full canvas width are skipped by intercepting fillRect(0, y, 256, h)
  const withoutBand = (fn) => { const o = CanvasRenderingContext2D.prototype.fillRect; CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) { if (w === 256 && h > 20 && y > 16) return; return o.call(this, x, y, w, h); }; try { T.render(); return fn(); } finally { CanvasRenderingContext2D.prototype.fillRect = o; } };
  for (const round of [1, 6, 11, 16, 21, 26]) {
    bannerFrac('extend', round, () => { const p = S().players[0]; p.letters = [true, true, true, true, true, false]; D().spawn('letter', p.x, p.y); }, 90, 22);
    bannerFrac('gameover', round, () => { const p = S().players[0]; p.lives = 1; D().god(false); D().clearEnemies(); D().spawn('nibbler', p.x, p.y); T.step(1); D().clearEnemies(); T.step(100); }, 92, 24);
    bannerFrac('victory', round, () => { D().spawn('moonpearl', S().players[0].x, S().players[0].y); }, 70, 60);
  }
  out.V4 = { pass: Object.values(v4).every((c) => c <= 0.55), maxRatioBandOverNoBand: v4 };
  // V5: boss gauge (thin neon bar on the line y ~ 21.5, crown glyph at x 59..69)
  { T.start({ players: 1, level: 30, seed: 7 }); T.step(3);
    const rowPx = (x, y, w, h, f) => { const d = raw(x, y, w, h); let n = 0; for (let i = 0; i < d.length; i += 4) if (f(d[i], d[i + 1], d[i + 2])) n++; return n; };
    const purple = (r, g, b) => b > 190 && r > 120 && g < r + 40 && r + b > 330;      // the fill colours (#c05cff core, hot centre)
    const gold = (r, g, b) => r > 200 && g > 150 && b < 150;
    const line = () => rowPx(74, 20.5, 124, 2, purple);                                // the bar's own row: ~ 6 device px high x 372 px wide when drawn
    const introBar = line(), introCrown = rowPx(56, 16, 16, 12, gold);
    T.step(150); const full = line(), crown = rowPx(56, 16, 16, 12, gold);
    S().enemies[0].hp = Math.floor(S().bossMax / 2); T.render(); const half = line();
    out.V5 = { pass: introBar < 30 && introCrown === 0 && full > 600 && crown > 15 && half > 200 && half < full * 0.7, introBar, introCrown, fullPurple: full, halfPurple: half, crownGold: crown };
  }
  // V6: hurry banner: hostile moment, so only a faint soft band; compare against the same frame without a banner
  { T.start({ players: 1, level: 5, seed: 2 }); D().god(true); D().noClear(true); D().skipIntro(); D().clearEnemies(); D().setHurryTimer(-1e7);
    D().spawn('jellop', 44, 96); const je = S().enemies[0]; je.jx = 0; je.jy = 0; S().proj.push({ type: 'pebble', x: 202, y: 102, vx: 0, vy: 0, age: 0, dead: false });
    const hold = () => { je.x = 44; je.y = 96; je.jx = 0; je.jy = 0; S().proj.forEach((q) => { q.x = 202; q.y = 102; q.vx = 0; q.vy = 0; q.age = 0; }); };
    hold(); T.step(1); hold(); S().hurryBanner = 0; T.render();
    const band = () => { const d = raw(0, 80, 256, 48), o = []; for (let i = 0; i < d.length; i += 4) o.push([d[i], d[i + 1], d[i + 2]]); return o; }, base = band();
    S().hurryBanner = 60; T.render(); const lit = band();         // v3: fully faded in, the 2 Hz pulse at its brightest (alpha 1)
    S().hurryBanner = 1; T.render(); const off = band();          // the very end of the fade-out: (nearly) nothing left
    let offDiff = 0, litDiff = 0;
    for (let i = 0; i < base.length; i++) { offDiff += Math.abs(off[i][0] - base[i][0]) + Math.abs(off[i][1] - base[i][1]) + Math.abs(off[i][2] - base[i][2]); litDiff += Math.abs(lit[i][0] - base[i][0]) + Math.abs(lit[i][1] - base[i][1]) + Math.abs(lit[i][2] - base[i][2]); }
    const wpx = 256 * K;
    const lumMax = (a, x0, y0, w, h) => { let m = 0; for (let yy = y0; yy < y0 + h; yy++) for (let xx = x0; xx < x0 + w; xx++) { const q = a[Math.round((yy - 80) * K) * wpx + Math.round(xx * K)]; m = Math.max(m, 0.2126 * q[0] + 0.7152 * q[1] + 0.0722 * q[2]); } return m; };
    const jb = lumMax(base, 48, 96, 7, 16), pb = lumMax(base, 202, 102, 6, 8), jr = lumMax(lit, 48, 96, 7, 16) / jb, pr = lumMax(lit, 202, 102, 6, 8) / pb;
    out.V6 = { pass: offDiff <= 0.1 * litDiff && litDiff > 0 && jb > 100 && pb > 100 && jr >= 0.6 && pr >= 0.6, jb: Math.round(jb), pb: Math.round(pb), offDiff, litDiff, jellopRatio: +jr.toFixed(2), pebbleRatio: +pr.toFixed(2) };
  }
  // V7: a popup inside a banner band keeps its light (the popup is drawn after the band): added light with a band = added light without one (within 12 %)
  { const added = (phase) => {
      T.start({ players: 1, level: 17, seed: 7 }); D().god(true); D().skipIntro(); T.step(2); S().popups.length = 0;
      if (phase === 'victory') { S().phase = 'victory'; S().phaseT = 10; S().bossBubble = null; }
      T.render(); const a0 = lums(24, 98, 26, 12); S().popups.push({ x: 36, y: 100, text: '1UP', color: '#9dffa8', t: 0 }); T.render(); const a1 = lums(24, 98, 26, 12);
      let s = 0; for (let i = 0; i < a0.length; i++) s += Math.max(0, a1[i] - a0[i]); return s; };
    const inBand = added('victory'), free = added('play');
    out.V7 = { pass: free > 0.05 && Math.abs(inBand - free) / free <= 0.12, addedLightInBand: +inBand.toFixed(3), addedLightFree: +free.toFixed(3) }; }
  // V8: angry readability on lava tiles (R22) + no Game aura
  { T.start({ players: 1, level: 22, seed: 7 }); D().god(true); D().noClear(true); D().skipIntro(); D().clearEnemies(); T.step(2);
    const grab = () => { const d = raw(100, 96, 40, 28), o = []; for (let i = 0; i < d.length; i += 4) o.push([d[i], d[i + 1], d[i + 2]]); return o; };
    const frameAt = (e, f) => { S().frame = f; e.x = 120; e.y = 104; e.vx = 0; e.vy = 0; e.animT = 0; T.render(); return grab(); };
    const empty = (() => { T.render(); return grab(); })();
    const res = {};
    for (const kind of ['crabbit', 'nibbler', 'jellop', 'springle', 'glimmer']) {
      S().enemies.length = 0; D().spawn(kind, 120, 104); const e = S().enemies[0]; e.angry = true;
      const im = frameAt(e, 20); const w = 40 * K;
      const inSprite = [], ring = [];
      for (let i = 0; i < im.length; i++) { const a = im[i], b = empty[i]; const d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]); (d > 90 ? inSprite : ring).push(a); }
      const avg = (L) => { const s = L.reduce((q, p) => { const l = lab(...p); return [q[0] + l[0], q[1] + l[1], q[2] + l[2]]; }, [0, 0, 0]); return s.map((v) => v / (L.length || 1)); };
      const A = avg(inSprite), B = avg(empty);
      res[kind] = +Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]).toFixed(1);
      res[kind + '_px'] = inSprite.length;
    }
    // exactly ONE sprite draw for the angry crabbit and no white silhouette copies
    S().enemies.length = 0; D().spawn('crabbit', 120, 104); const c = S().enemies[0]; c.angry = true; c.vx = 0; c.vy = 0; c.animT = 0;
    const calls = []; const o = GFX.draw; GFX.draw = (cc, n, f, x, y, opt) => { if (n.startsWith('crabbit')) calls.push({ n, white: !!(opt && opt.white) }); return o.call(GFX, cc, n, f, x, y, opt); }; T.render(); GFX.draw = o;
    out.V8 = { pass: ['crabbit', 'nibbler', 'jellop', 'springle', 'glimmer'].every((k) => res[k] >= 25) && calls.length === 1 && !calls[0].white, dE: res, spriteDraws: calls.length };
  }
  // V9: no strobing: invulnerable player alpha
  { const seen = (reduced) => {
      T.opts({ reducedMotion: reduced }); T.start({ players: 1, level: 3, seed: 7 }); D().god(true); D().skipIntro(); D().clearEnemies(); const p = S().players[0]; p.inv = 9999; const a = []; const o = GFX.draw;
      GFX.draw = (c, n, f, x, y, opt) => { if (n.startsWith('p1_')) a.push(opt && opt.alpha !== undefined ? opt.alpha : 1); return o.call(GFX, c, n, f, x, y, opt); };
      for (let i = 0; i < 40; i++) T.step(1); GFX.draw = o; T.opts({ reducedMotion: false }); return { n: a.length, min: Math.min(...a), distinct: [...new Set(a)].length, series: a }; };
    const n = seen(false), r = seen(true);
    let step = 0; for (let i = 1; i < n.series.length; i++) step = Math.max(step, Math.abs(n.series[i] - n.series[i - 1]));
    out.V9 = { pass: n.n === 40 && n.min >= 0.4 - 1e-9 && n.distinct >= 8 && step <= 0.2 && r.n === 40 && r.distinct === 1 && r.min > 0.4, normal: { n: n.n, min: n.min, distinct: n.distinct, maxStep: +step.toFixed(3) }, reduced: { n: r.n, min: r.min, distinct: r.distinct } }; }
  return out;
});
let fail = 0;
for (const [k, v] of Object.entries(res)) { console.log(k, v.pass ? 'PASS' : 'FAIL', JSON.stringify(v).slice(0, 400)); if (!v.pass) fail++; }
console.log('errors', t.errors);
await t.close();
process.exit(fail || t.errors.length ? 1 : 0);
