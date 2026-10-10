// FIZZ & POP — game module: measurable presentation gates on the REAL rendered game (dist/fizzpop.html or FIZZ_HTML).
//   node test/game_visual.mjs        exit code 1 when a gate fails
//  V1 ROUND banner     : for all 30 rounds the non-text pixels around the "ROUND n" text (the band) keep a WCAG contrast >= 4.5 against the white text
//  V2 round number     : HUD round digits on the wall: all non-digit pixels around them keep contrast >= 4.5 against white, all 30 rounds
//  V3 frozen look      : every enemy type changes by dE76 >= 20 between active and frozen (incl. the blue Glimmer)
//  V4 other banners    : GAME OVER, EXTEND! and the victory text sit on a dark band across the whole inner width (R17, crystal tiles)
//  V5 boss gauge       : the boss bar is hidden in the intro and framed (gold frame pixels) while fighting
//  V6 hurry banner     : (wave 3) only a faint 160 px plate while the text is lit, NO plate when it blinks off; a jellop / pebble behind it stays >= 60 % as bright
//  V7 popups on banner : (wave 3) a score popup inside a banner band keeps its exact colour (drawn after the plate)
//  V8 angry aura       : (wave 3) angry enemies get a warm 1 px rim whose alpha pulses 0.35 .. 0.70; calm enemies have none
import { launch, fp } from '../tools/harness.mjs';
const t = await launch({ html: process.env.FIZZ_HTML || undefined });
const g = fp(t.page); await g.freeze(true);
const res = await g.evaluate(() => {
  window.fz = window.__fizzpop; const out = {};
  const D = () => fz.Game.debug, S = () => D()._S();
  const cv = document.getElementById('screen'), cx = cv.getContext('2d', { willReadFrequently: true });
  const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const cr = (a, b) => { const l1 = lum(...a), l2 = lum(...b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const lab = (r, g, b) => { const f = (v) => { v /= 255; return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; }; const R = f(r), G = f(g), B = f(b); const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883; const h = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116); return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))]; };
  const px = (x, y, w, h) => { const d = cx.getImageData(x, y, w, h).data, o = []; for (let i = 0; i < d.length; i += 4) o.push([d[i], d[i + 1], d[i + 2]]); return o; };
  const isWhite = (p) => p[0] > 235 && p[1] > 235 && p[2] > 235;
  const minContrastAroundWhite = (x, y, w, h) => { let min = 99; for (const p of px(x, y, w, h)) { if (isWhite(p)) continue; min = Math.min(min, cr([255, 255, 255], p)); } return +min.toFixed(2); };

  // V1: ROUND banner, 30 rounds (first intro frames, text at y 84..100 centred)
  const v1 = [];
  for (let r = 1; r <= 30; r++) { fz.start(1, r, 7); fz.step(3); const w = ('ROUND ' + r).length * 16; v1.push({ r, c: minContrastAroundWhite(Math.round(128 - w / 2) - 4, 84, w + 8, 16) }); }
  out.V1 = { pass: v1.every((x) => x.c >= 4.5), failing: v1.filter((x) => x.c < 4.5), min: Math.min(...v1.map((x) => x.c)) };
  // V2: HUD round number
  const v2 = [];
  for (let r = 1; r <= 30; r++) { fz.start(1, r, 7); fz.step(3); v2.push({ r, c: minContrastAroundWhite(0, 18, 16, 10) }); }
  out.V2 = { pass: v2.every((x) => x.c >= 4.5), failing: v2.filter((x) => x.c < 4.5), min: Math.min(...v2.map((x) => x.c)) };
  // V3: frozen vs active, per enemy type, on a busy crystal round
  const v3 = {};
  for (const k of ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer']) {
    fz.start(1, 17, 7); D().god(true); D().noClear(true); D().skipIntro(); D().clearEnemies(); fz.step(2);
    const grab = () => px(0, 16, 256, 208);
    const bg = grab();
    D().spawn(k, 120, 100); const e = S().enemies[S().enemies.length - 1]; e.vx = 0; e.vy = 0;
    const sprite = (setup) => { setup(); fz.Game.render(cx); const im = grab(); let n = 0, L = 0, A = 0, B = 0; for (let i = 0; i < im.length; i++) { const a = im[i], b = bg[i]; if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 40) { const l = lab(...a); n++; L += l[0]; A += l[1]; B += l[2]; } } return [L / n, A / n, B / n, n]; };
    e.state = 'active'; e.type = null; const normal = sprite(() => { e.state = 'active'; e.x = 120; e.y = 100; e.animT = 0; });
    const frozen = sprite(() => { e.state = 'frozen'; e.freezeT = 1e9; e.x = 120; e.y = 100; });
    v3[k] = +Math.hypot(normal[0] - frozen[0], normal[1] - frozen[1], normal[2] - frozen[2]).toFixed(1);
  }
  out.V3 = { pass: Object.values(v3).every((v) => v >= 20), dE: v3 };
  // V4: other banners on a crystal round: the dark band spans the whole inner width (margin strips stay dark, tiles or not)
  const v4 = {};
  const banner = (name, setup, y0, h) => { fz.start(1, 17, 7); D().god(true); D().skipIntro(); fz.step(2); setup(); fz.step(2); let max = 0; for (const [x0, w] of [[17, 6], [233, 6]]) for (const p of px(x0, y0, w, h)) max = Math.max(max, lum(...p)); v4[name] = +max.toFixed(3); };
  banner('extend', () => { const p = S().players[0]; p.letters = [true, true, true, true, true, false]; D().spawn('letter', p.x, p.y); }, 90, 22);
  banner('gameover', () => { const p = S().players[0]; p.lives = 1; D().god(false); D().clearEnemies(); D().spawn('nibbler', p.x, p.y); fz.step(1); D().clearEnemies(); fz.step(100); }, 92, 24);
  banner('victory', () => { D().spawn('moonpearl', S().players[0].x, S().players[0].y); }, 70, 60);
  out.V4 = { pass: Object.values(v4).every((c) => c <= 0.12), maxLuminanceInMargin: v4 };
  // V5: boss gauge
  fz.start(1, 30, 7); fz.step(30); const introBar = px(60, 18, 130, 3).some((p) => p[0] > 200 && p[1] > 150 && p[2] < 120);
  fz.step(140); const fightBar = px(60, 16, 150, 10).filter((p) => p[0] > 200 && p[1] > 170 && p[2] < 100).length;
  out.V5 = { pass: !introBar && fightBar > 100, introBar, goldPixels: fightBar };
  // V6: hurry banner (wave 3): hostile moment, so no full-width plate; compare against the same frame without a banner
  { fz.start(1, 5, 2); D().god(true); D().noClear(true); D().skipIntro(); D().clearEnemies(); D().setHurryTimer(-1e7);
    D().spawn('jellop', 44, 96); const je = S().enemies[0]; je.jx = 0; je.jy = 0; S().proj.push({ type: 'pebble', x: 202, y: 102, vx: 0, vy: 0, age: 0, dead: false });
    const hold = () => { je.x = 44; je.y = 96; je.jx = 0; je.jy = 0; S().proj.forEach((q) => { q.x = 202; q.y = 102; q.vx = 0; q.vy = 0; q.age = 0; }); };
    hold(); fz.step(1); hold(); S().hurryBanner = 0; fz.Game.render(cx);
    const band = () => px(0, 80, 256, 48), base = band();
    const lumMax = (a, x0, y0, w, h) => { let m = 0; for (let yy = y0; yy < y0 + h; yy++) for (let xx = x0; xx < x0 + w; xx++) { const q = a[(yy - 80) * 256 + xx]; m = Math.max(m, 0.2126 * q[0] + 0.7152 * q[1] + 0.0722 * q[2]); } return m; };
    S().hurryBanner = 100; fz.Game.render(cx); const lit = band();        // floor(100/5) is even: text lit
    S().hurryBanner = 97; fz.Game.render(cx); const off = band();         // odd: text blinked off
    let marginDiff = 0, offDiff = 0, plateDiff = 0;
    for (let i = 0; i < base.length; i++) { const x = i % 256; const d = Math.abs(lit[i][0] - base[i][0]) + Math.abs(lit[i][1] - base[i][1]) + Math.abs(lit[i][2] - base[i][2]); if (x < 44 || x >= 212) marginDiff += d; else plateDiff += d; offDiff += Math.abs(off[i][0] - base[i][0]) + Math.abs(off[i][1] - base[i][1]) + Math.abs(off[i][2] - base[i][2]); }
    // measure only the columns inside the plate that the HURRY UP glyphs (x 55..201) do not cover
    const jb = lumMax(base, 48, 96, 7, 16), pb = lumMax(base, 202, 102, 6, 8), jr = lumMax(lit, 48, 96, 7, 16) / jb, pr = lumMax(lit, 202, 102, 6, 8) / pb;
    out.V6 = { pass: marginDiff === 0 && offDiff === 0 && plateDiff > 0 && jb > 120 && pb > 120 && jr >= 0.6 && pr >= 0.6, jb: Math.round(jb), pb: Math.round(pb), marginDiff, offDiff, plateDiff, jellopRatio: +jr.toFixed(2), pebbleRatio: +pr.toFixed(2) };
  }
  // V7: a popup inside a banner band keeps its exact colour (victory plate, x clear of the banner text)
  { fz.start(1, 17, 7); D().god(true); D().skipIntro(); fz.step(2); S().phase = 'victory'; S().phaseT = 10; S().bossBubble = null; S().popups.length = 0;
    S().popups.push({ x: 36, y: 100, text: '1UP', color: '#9dffa8', age: 0, life: 200, vy: 0 }); fz.Game.render(cx);
    let exact = 0; for (const p of px(24, 100, 26, 8)) if (Math.abs(p[0] - 157) <= 3 && Math.abs(p[1] - 255) <= 3 && Math.abs(p[2] - 168) <= 3) exact++;
    out.V7 = { pass: exact >= 12, exactColourPixels: exact }; }
  // V8: angry aura on lava tiles (R22): the pixels that change between the pulse maximum and minimum are the rim; they are warm and their alpha is 0.70 / 0.35
  { fz.start(1, 22, 7); D().god(true); D().noClear(true); D().skipIntro(); D().clearEnemies();
    const frameAt = (e, f) => { S().frame = f; e.x = 120; e.y = 100; e.vx = 0; e.vy = 0; e.animT = 0; fz.Game.render(cx); return px(0, 16, 256, 208); };
    D().spawn('crabbit', 120, 100); const e = S().enemies[0]; e.angry = false;
    const calmA = frameAt(e, 10), calmB = frameAt(e, 30);
    let calmDiff = 0; for (let i = 0; i < calmA.length; i++) if (calmA[i][0] !== calmB[i][0] || calmA[i][1] !== calmB[i][1] || calmA[i][2] !== calmB[i][2]) calmDiff++;
    S().enemies.length = 0; const empty = frameAt({ x: 0, y: 0 }, 10);
    D().spawn('crabbit', 120, 100); const e2 = S().enemies[0]; e2.angry = true;
    const hi = frameAt(e2, 10), lo = frameAt(e2, 30);     // sin(2pi f / 40): +1 at f = 10, -1 at f = 30
    const al = []; let rimN = 0;
    for (let i = 0; i < hi.length; i++) {
      if (hi[i][0] === lo[i][0] && hi[i][1] === lo[i][1] && hi[i][2] === lo[i][2]) continue;
      rimN++; const bg = empty[i][0];
      al.push([(hi[i][0] - bg) / (255 - bg), (lo[i][0] - bg) / (255 - bg), hi[i][2] < hi[i][0] && hi[i][1] <= hi[i][0]]);
    }
    const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] || 0;
    const aHi = med(al.map((a) => a[0])), aLo = med(al.map((a) => a[1])), warm = al.length ? al.every((a) => a[2]) : false;
    out.V8 = { pass: calmDiff === 0 && rimN >= 40 && warm && Math.abs(aHi - 0.7) < 0.06 && Math.abs(aLo - 0.35) < 0.06, calmDiff, rimPixels: rimN, alphaMax: +aHi.toFixed(3), alphaMin: +aLo.toFixed(3), warm };
  }
  return out;
});
let fail = 0;
for (const [k, v] of Object.entries(res)) { console.log(k, v.pass ? 'PASS' : 'FAIL', JSON.stringify(v).slice(0, 300)); if (!v.pass) fail++; }
console.log('errors', t.errors);
await t.close();
process.exit(fail || t.errors.length ? 1 : 0);
