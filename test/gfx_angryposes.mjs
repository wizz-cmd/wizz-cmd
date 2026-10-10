// GFX wave 3: angry enemies keep their angry look in their ACTION poses (crabbit_throw, springle_squash, glimmer_fire).
//   node test/gfx_angryposes.mjs [--proof]
// 1) sprite checks on src/ (test/gfx_sheet.html): every <pose>_angry exists, has the pose's frame count/size, uses no calm body colour and is
//    dominated by the crimson ramp, i.e. it is the angry palette swap (+ steam) of the very same finished grids.
// 2) wiring note: Game.drawEnemy must pick '<pose>_angry' while e.angry (one line: `if (e.angry && GFX.has(name + '_angry')) name += '_angry';`
//    before the enter-alpha line). The script reports whether dist/ already has it; --proof builds a PATCHED COPY of dist (out/fix3/) that has it
//    and renders each angry enemy in its action pose in the real game (crops looked at: out/fix3/angryposes_*.png).
import fs from 'fs';
import path from 'path';
import { launch, fp, canvasShot, PROJECT } from '../tools/harness.mjs';
let failed = 0; const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${extra}`); if (!ok) failed++; };
const t = await launch({ html: path.join(PROJECT, 'test', 'gfx_sheet.html') });
const rep = await t.page.evaluate(() => {
  const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  const px = (n) => { const sz = GFX.size(n), c = document.createElement('canvas'); c.width = sz.w; c.height = sz.h; const x = c.getContext('2d', { willReadFrequently: true }); GFX.draw(x, n, 0, 0, 0); const d = x.getImageData(0, 0, sz.w, sz.h).data, m = new Map(); let tot = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { const k = hex(d[i], d[i + 1], d[i + 2]); m.set(k, (m.get(k) || 0) + 1); tot++; } return { m: Object.fromEntries(m), tot }; };
  const out = {};
  for (const [pose, calmBody] of [['crabbit_throw', '#e8782a'], ['springle_squash', '#8ad63a'], ['glimmer_fire', '#2f58d8']]) {
    const a = pose + '_angry'; const r = { exists: GFX.has(a), calm: GFX.has(pose) };
    if (r.exists) { const s1 = GFX.size(pose), s2 = GFX.size(a); r.sameSize = s1.w === s2.w && s1.h === s2.h && GFX.frames(pose) === GFX.frames(a); const p = px(a); r.calmBodyPx = p.m[calmBody] || 0; r.crimsonShare = +(((p.m['#e0201c'] || 0) + (p.m['#ff6a3a'] || 0)) / p.tot).toFixed(2); r.colours = Object.keys(p.m).length; }
    out[pose] = r;
  }
  return out;
});
for (const [pose, r] of Object.entries(rep)) {
  check(`${pose}_angry registered next to ${pose}`, r.exists && r.calm);
  check(`${pose}_angry same size / frame count`, !!r.sameSize);
  check(`${pose}_angry has no calm body colour`, r.calmBodyPx === 0, 'calm px ' + r.calmBodyPx);
  check(`${pose}_angry is crimson-dominated`, r.crimsonShare >= 0.2, 'share ' + r.crimsonShare);
}
check('zero console errors (sheet page)', t.errors.length === 0, JSON.stringify(t.errors));
await t.close();

const dist = fs.readFileSync(path.join(PROJECT, 'dist', 'fizzpop.html'), 'utf8');
const wired = /e\.angry && GFX\.has\(name \+ '_angry'\)/.test(dist);
console.log(wired ? 'NOTE  dist/ already picks the _angry action poses in Game.drawEnemy' : 'NOTE  dist/ Game.drawEnemy does NOT pick the _angry action poses yet (needs the 1-line game change quoted in the header)');
if (process.argv.includes('--proof')) {
  const anchor = "if (e.state === 'enter') o.alpha = Math.min(1, Math.max(0, e.enterT) / 30);";
  let html = dist;
  if (!wired) { if (html.split(anchor).length !== 2) throw new Error('anchor not unique'); html = html.replace(anchor, () => "if (e.angry && GFX.has(name + '_angry')) name += '_angry';\n    " + anchor); }
  const O = path.join(PROJECT, 'out', 'fix3'); fs.mkdirSync(O, { recursive: true });
  const file = path.join(O, 'fizzpop_angryposes_proof.html'); fs.writeFileSync(file, html);
  const t2 = await launch({ html: file });
  const g = fp(t2.page); await g.freeze(true); await g.start(1, 17, 5);
  await g.evaluate(() => {
    const D = fz.Game.debug; D.setLevel(17); D.skipIntro(); D.clearEnemies(); D.god(true); D.noClear(true);
    const S = D._S(); const mk = (ty, x) => { D.spawn(ty, x, 192); const e = S.enemies[S.enemies.length - 1]; e.angry = true; e.state = 'active'; e.enterT = 99; e.d = 1; return e; };
    window.__e = [mk('crabbit', 60), mk('springle', 120), mk('glimmer', 180)];
  });
  await g.evaluate(() => { const [c, s, gl] = window.__e; c.pauseT = 30; s.onGround = true; s.sqT = 30; gl.poseT = 30; fz.step(1); c.pauseT = 30; s.onGround = true; s.sqT = 30; gl.poseT = 30; });
  const names = await g.evaluate(() => 'rendered');
  await g.shot(path.join(O, 'angryposes_game_x3.png'), { scale: 3 });
  // pixel proof: the three enemies' boxes contain no calm body colour
  const bad = await t2.page.evaluate(() => {
    const cv = document.querySelector('#screen'); const x = cv.getContext('2d'); const res = {};
    for (const [n, px0, calm] of [['crabbit', 60, [0xe8, 0x78, 0x2a]], ['springle', 120, [0x8a, 0xd6, 0x3a]], ['glimmer', 180, [0x2f, 0x58, 0xd8]]]) {
      const d = x.getImageData(px0 - 2, 192 - 2, 20, 20).data; let c = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - calm[0]) + Math.abs(d[i + 1] - calm[1]) + Math.abs(d[i + 2] - calm[2]) < 24) c++; res[n] = c;
    }
    return res;
  });
  check('real game (patched copy): angry enemies in action poses draw no calm body colour', Object.values(bad).every((v) => v === 0), JSON.stringify(bad));
  check('zero console errors (game page)', t2.errors.length === 0, JSON.stringify(t2.errors));
  await t2.close();
}
process.exit(failed ? 1 : 0);
