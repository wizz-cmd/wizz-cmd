// GFX wave 3: angry enemies keep their angry look in their ACTION poses (crabbit_throw, springle_squash, glimmer_fire).   node test/gfx_angryposes.mjs [--proof]
// v2.0 RE-BASE (SPEC_V2 sections 2 + 7): the angry look (crimson #ff2a2a contour + steam + slanted brows + pulsing heat halo) is baked into the sprites; the pixel gate matched exact
// palette colours, the v2 gate measures HUE: among the lit, saturated pixels of the sprite (alpha > 0.4, saturation > 0.45, lightness 0.3..0.85)
// 1) sprite checks on src/ (test/gfx_sheet.html, k = 4): every <pose>_angry exists next to <pose>, has the pose's frame count and size, is crimson-dominated (>= 55 % of those pixels
//    within +-22 degrees of red) and keeps no more than 12 % in the calm creature's own hue band (small amber / white sparks such as Glimmer's lantern are allowed for).
// 2) wiring: Game.actionPose() picks '<pose>_angry' while e.angry (Game v2 does it; a source check). --proof renders each angry enemy in its action pose in the REAL game
//    (dist/fizzpop.html, Main's k) and repeats the hue measurement on the rendered frame (crops looked at: out/v2/integration/angryposes_game.png).
import fs from 'fs';
import path from 'path';
import { launch, fp, canvasShot, PROJECT } from '../tools/harness.mjs';
let failed = 0; const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${extra}`); if (!ok) failed++; };
const HUE = `
  const rgb2hsl = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; };
  const hueShare = (d, calm) => { let tot = 0, red = 0, calmN = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 100) continue; const [h, s, l] = rgb2hsl(d[i], d[i + 1], d[i + 2]); if (s < 0.45 || l < 0.3 || l > 0.85) continue; tot++; const dr = Math.min(h, 360 - h); if (dr <= 22) red++; else if (Math.abs(h - calm[0]) <= calm[1]) calmN++; } return { tot, red: tot ? red / tot : 0, calm: tot ? calmN / tot : 0 }; };
`;
const CALM = { crabbit_throw: [22, 22], springle_squash: [78, 28], glimmer_fire: [215, 28] };       // hue centre, half width (degrees) of the calm creature's contour
const t = await launch({ html: path.join(PROJECT, 'test', 'gfx_sheet.html') });
const rep = await t.page.evaluate(({ HUE, CALM }) => {
  eval(HUE.replace(/const /g, 'var '));
  const K = 4; GFX.setScale(K); const M = 8; const out = {};
  for (const [pose, calm] of Object.entries(CALM)) {
    const a = pose + '_angry'; const r = { exists: GFX.has(a), calm: GFX.has(pose) };
    if (r.exists) {
      const s1 = GFX.size(pose), s2 = GFX.size(a); r.sameSize = s1.w === s2.w && s1.h === s2.h && GFX.frames(pose) === GFX.frames(a);
      const c = document.createElement('canvas'); c.width = (s2.w + 2 * M) * K; c.height = (s2.h + 2 * M) * K; const g = c.getContext('2d', { willReadFrequently: true }); g.setTransform(K, 0, 0, K, 0, 0);
      GFX.draw(g, a, 0, M, M); const hs = hueShare(g.getImageData(0, 0, c.width, c.height).data, calm); r.red = +hs.red.toFixed(2); r.calmShare = +hs.calm.toFixed(2); r.tot = hs.tot;
    }
    out[pose] = r;
  }
  return out;
}, { HUE, CALM });
for (const [pose, r] of Object.entries(rep)) {
  check(`${pose}_angry registered next to ${pose}`, r.exists && r.calm);
  check(`${pose}_angry same size / frame count`, !!r.sameSize);
  check(`${pose}_angry is crimson-dominated (${(r.red * 100).toFixed(0)} % of ${r.tot} lit px within 22 deg of red >= 55 %)`, r.red >= 0.55);
  check(`${pose}_angry keeps (almost) no calm hue (${(r.calmShare * 100).toFixed(0)} % <= 12 %)`, r.calmShare <= 0.12);
}
check('zero console errors (sheet page)', t.errors.length === 0, JSON.stringify(t.errors));
await t.close();

const game = fs.readFileSync(path.join(PROJECT, 'src', '40_game.js'), 'utf8');
check("Game.actionPose picks '<pose>_angry' while angry", /function actionPose\(base, e\) \{ return e\.angry && GFX\.has\(base \+ '_angry'\)/.test(game));
if (process.argv.includes('--proof')) {
  const O = path.join(PROJECT, 'out', 'v2', 'integration'); fs.mkdirSync(O, { recursive: true });
  const t2 = await launch({});
  const g = fp(t2.page); await g.freeze(true); await g.start(1, 17, 5);
  await g.evaluate(() => {
    const D = fz.Game.debug; D.setLevel(17); D.skipIntro(); D.clearEnemies(); D.god(true); D.noClear(true);
    const S = D._S(); const mk = (ty, x) => { D.spawn(ty, x, 192); const e = S.enemies[S.enemies.length - 1]; e.angry = true; e.state = 'active'; e.enterT = 99; e.d = 1; return e; };
    window.__e = [mk('crabbit', 60), mk('springle', 120), mk('glimmer', 180)];
  });
  const hold = () => window.__e && (() => { const [c, s, gl] = window.__e; c.pauseT = 30; s.onGround = true; s.sqT = 30; gl.poseT = 30; c.vx = c.vy = s.vx = s.vy = gl.vx = gl.vy = 0; })();
  await g.evaluate(() => { const [c, s, gl] = window.__e; c.pauseT = 30; s.onGround = true; s.sqT = 30; gl.poseT = 30; fz.step(1); c.pauseT = 30; s.onGround = true; s.sqT = 30; gl.poseT = 30; fz.Game.debug.noClear(true); });
  await canvasShot(t2.page, path.join(O, 'angryposes_game.png'), { scale: 1 });
  const res = await t2.page.evaluate(({ HUE, CALM }) => {
    eval(HUE.replace(/const /g, 'var '));
    const cv = document.querySelector('#screen'); const x = cv.getContext('2d', { willReadFrequently: true }); const K = cv.width / 256; const res = {};
    for (const [n, px0, key] of [['crabbit', 60, 'crabbit_throw'], ['springle', 120, 'springle_squash'], ['glimmer', 180, 'glimmer_fire']]) {
      const d = x.getImageData(Math.round((px0 - 6) * K), Math.round((16 + 192 - 8) * K), Math.round(28 * K), Math.round(30 * K)).data; const h = hueShare(d, CALM[key]); res[n] = { red: +h.red.toFixed(2), calm: +h.calm.toFixed(2), tot: h.tot };
    }
    return res;
  }, { HUE, CALM });
  console.log(JSON.stringify(res));
  check('real game: angry enemies in their action poses are crimson (>= 40 % of lit px; the frame has glow + backdrop)', Object.values(res).every((v) => v.tot > 30 && v.red >= 0.4), JSON.stringify(res));
  check('real game: no calm creature hue left (<= 15 %)', Object.values(res).every((v) => v.calm <= 0.15), JSON.stringify(res));
  check('zero console errors (game page)', t2.errors.length === 0, JSON.stringify(t2.errors));
  await t2.close();
}
process.exit(failed ? 1 : 0);
