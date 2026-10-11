// Colour-blind lineups: every theme (rounds 1,6,11,16,21,26), real game render + overlays, crops of each sprite, 5 vision modes.
import { setup, sheet, OUT, save } from './qa_v2_motion_lib.mjs';
import fs from 'fs';
const LEVELS_TO_DO = (process.argv[2] ? process.argv[2].split(',').map(Number) : [1, 6, 11, 16, 21, 26]);
const { t, g, page } = await setup();
const META = {};
for (const L of LEVELS_TO_DO) {
  await g.start(2, L, 9);
  await g.step(160);
  await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.clearEnemies(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); });
  await g.step(30);
  const res = await page.evaluate(async (L) => {
    const fz = window.__fizzpop, D = fz.Game.debug, S = D._S();
    const map = fz.LEVELS[L - 1].map;
    // free cells: 20x20 px cells away from solids
    const solid = (c, r) => (r < 0 || r >= 26 || c < 0 || c >= 32) ? true : map[r][c] === '#';
    let cells = [];
    for (const [sx, sy] of [[20, 18], [16, 14], [12, 12], [10, 9]]) {
      cells = [];
      for (let y = 28; y < 200; y += sy) for (let x = 14; x < 232; x += sx) {
        let ok = true;
        for (let yy = y - 1; yy <= y + 17 && ok; yy += 4) for (let xx = x - 1; xx <= x + 17; xx += 4) { const c = Math.floor(xx / 8), r = Math.floor((yy - 16) / 8); if (solid(c, r)) { ok = false; break; } }
        if (ok) cells.push([x, y]);
      }
      // keep cells that do not overlap an already kept one by more than 4 px
      const kept = [];
      for (const q of cells) if (kept.every(k => Math.abs(k[0] - q[0]) >= 18 || Math.abs(k[1] - q[1]) >= 18)) kept.push(q);
      cells = kept;
      if (cells.length >= 38) break;
    }
    // sprite list in order: type, name, how
    const list = [
      ['P1', 'p1_idle'], ['P2', 'p2_idle'],
      ['nibbler', 'nibbler_move'], ['crabbit', 'crabbit_move'], ['jellop', 'jellop_move'], ['springle', 'springle_move'], ['glimmer', 'glimmer_move'], ['bonefin', 'bonefin'],
      ['nibblerA', 'nibbler_angry'], ['crabbitA', 'crabbit_angry'], ['jellopA', 'jellop_angry'], ['springleA', 'springle_angry'], ['glimmerA', 'glimmer_angry'],
      ['bubble', 'bubble'], ['warn', 'bubble_warn'], ['trap0', 'T0'], ['trap1', 'T1'], ['trap2', 'T2'], ['thunder', 'bubble_thunder'], ['fire', 'bubble_fire'], ['water', 'bubble_water'], ['letter', 'bubble_letter'],
      ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => ['food' + i, 'food_' + i]),
      ...['shoes', 'pink', 'blue', 'gold', 'parasol', 'clock', 'bomb', 'heart'].map(n => ['pu_' + n, 'pu_' + n]),
    ];
    if (cells.length < list.length) return { err: 'not enough free cells ' + cells.length + '/' + list.length };
    // greedily pick cells: spread across the list by taking evenly spaced cells
    const pick = []; const step = cells.length / list.length;
    for (let i = 0; i < list.length; i++) pick.push(cells[Math.floor(i * step)]);
    const overlays = [];
    list.forEach(([id, name], i) => {
      const [x, y] = pick[i];
      const spawnE = (ty, angry, frozen) => { D.spawn(ty, x, y); const e = S.enemies.filter(e => !e.dead).pop(); e.x = x; e.y = y; e.angry = !!angry; if (frozen) { e.state = 'frozen'; e.freezeT = 200; } e.vx = 0; e.vy = 0; return e; };
      if (id === 'P1') { D.setPlayer(0, { x, y, vx: 0, vy: 0, inv: 0 }); }
      else if (id === 'P2') { D.setPlayer(1, { x, y, vx: 0, vy: 0, inv: 0 }); }
      else if (['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'].includes(id)) spawnE(id, false);
      else if (id === 'bonefin') { D.spawn('bonefin', x, y); S.ghost.x = x; S.ghost.y = y; }
      else if (id.endsWith('A') && ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'].includes(id.slice(0, -1))) spawnE(id.slice(0, -1), true);
      else if (id.startsWith('frozen')) { const m = { N: 'nibbler', C: 'crabbit', J: 'jellop', S: 'springle', G: 'glimmer' }[id[6]]; spawnE(m, false, true); }
      else overlays.push({ id, name, x, y, i });
      list[i].x = x; list[i].y = y;
    });
    return { list: list.map(l => ({ id: l[0], name: l[1], x: l.x, y: l.y })), overlays, ncells: cells.length };
  }, L);
  if (res.err) { console.log('L' + L, res.err); continue; }
  META[L] = res;
  // freeze enemy movement: single render, draw overlays, then copy to QA store in the same task
  await page.evaluate(({ overlays }) => {
    const fz = window.__fizzpop, GFX = fz.GFX;
    // advance exactly one tick so entities settle visually (they don't move far), then render
    fz.step(1);
    const cv = document.getElementById('screen'), c = cv.getContext('2d');
    const k = cv.width / 256;
    c.setTransform(k, 0, 0, k, 0, 0);
    for (const o of overlays) {
      if (o.name === 'T0' || o.name === 'T1' || o.name === 'T2') { GFX.draw(c, 'nibbler_trapped', 0, o.x, o.y); GFX.draw(c, 'trap_overlay', +o.name[1], o.x, o.y); }
      else GFX.draw(c, o.name, 0, o.x, o.y);
    }
    window.QA.full = document.createElement('canvas'); window.QA.full.width = cv.width; window.QA.full.height = cv.height;
    window.QA.full.getContext('2d').drawImage(cv, 0, 0);
  }, { overlays: res.overlays });
  // quantitative contrast: top-15% luminance of the 16x16 box vs median luminance of a 3 px ring just outside (WCAG ratio), per mode
  const q = await page.evaluate(({ list }) => {
    const full = window.QA.full, k = full.width / 256, out = {};
    for (const mode of ['normal', 'deutan', 'protan', 'tritan']) {
      const sim = window.QA.simCanvas(full, mode), c = sim.getContext('2d');
      const W = sim.width, H = sim.height, d = c.getImageData(0, 0, W, H).data;
      const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const L = new Float32Array(W * H); for (let i = 0; i < W * H; i++) L[i] = 0.2126 * lin(d[i * 4]) + 0.7152 * lin(d[i * 4 + 1]) + 0.0722 * lin(d[i * 4 + 2]);
      for (const it of list) {
        const x0 = Math.round(it.x * k), y0 = Math.round(it.y * k), w = Math.round(16 * k);
        const inside = [], ring = [], m = Math.round(3 * k);
        for (let y = y0 - m; y < y0 + w + m; y++) for (let x = x0 - m; x < x0 + w + m; x++) {
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const v = L[y * W + x];
          if (x >= x0 && x < x0 + w && y >= y0 && y < y0 + w) inside.push(v); else ring.push(v);
        }
        inside.sort((a, b) => b - a); ring.sort((a, b) => a - b);
        const top = inside.slice(0, Math.max(1, Math.floor(inside.length * 0.15))).reduce((a, b) => a + b, 0) / Math.max(1, Math.floor(inside.length * 0.15));
        const mean = inside.reduce((a, b) => a + b, 0) / inside.length;
        const bg = ring[Math.floor(ring.length / 2)];
        (out[it.id] = out[it.id] || {})[mode] = { top: +top.toFixed(3), mean: +mean.toFixed(3), bg: +bg.toFixed(3), cr: +((top + 0.05) / (bg + 0.05)).toFixed(2) };
      }
    }
    return out;
  }, { list: res.list });
  fs.writeFileSync(`${OUT}/cvd/L${L}_contrast.json`, JSON.stringify(q));
  // groups of sprite crops
  const groups = { G1_heroes_enemies: ['P1', 'P2', 'nibbler', 'crabbit', 'jellop', 'springle', 'glimmer', 'bonefin'],
    G2_angry_frozen: ['nibblerA', 'crabbitA', 'jellopA', 'springleA', 'glimmerA'],
    G3_bubbles: ['bubble', 'warn', 'trap0', 'trap1', 'trap2', 'thunder', 'fire', 'water', 'letter'],
    G4_items: ['food0', 'food1', 'food2', 'food3', 'food4', 'food5', 'food6', 'food7', 'pu_shoes', 'pu_pink', 'pu_blue', 'pu_gold', 'pu_parasol', 'pu_clock', 'pu_bomb', 'pu_heart'] };
  for (const [gn, ids] of Object.entries(groups)) {
    const url = await page.evaluate(({ ids, list, modes }) => {
      const full = window.QA.full, k = full.width / 256, S = 3;     // crop 30x30 logical around each sprite, 3 px per logical px (k-independent)
      const W = 30, cw = W * S, tile = (id, mode) => {
        const it = list.find(l => l.id === id);
        const o = document.createElement('canvas'); o.width = Math.round(W * k); o.height = Math.round(W * k);
        o.getContext('2d').drawImage(full, Math.round((it.x - 7) * k), Math.round((it.y - 7) * k), o.width, o.height, 0, 0, o.width, o.height);
        const sim = window.QA.simCanvas(o, mode);
        const p = document.createElement('canvas'); p.width = cw; p.height = cw;
        const pc = p.getContext('2d'); pc.imageSmoothingEnabled = true; pc.drawImage(sim, 0, 0, cw, cw); return p;
      };
      const out = document.createElement('canvas'); out.width = ids.length * (cw + 2) + 40; out.height = modes.length * (cw + 2);
      const c = out.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, out.width, out.height);
      modes.forEach((m, r) => { c.fillStyle = '#9bd'; c.font = '10px monospace'; c.fillText(m.slice(0, 5), 1, r * (cw + 2) + 12); ids.forEach((id, i) => c.drawImage(tile(id, m), 40 + i * (cw + 2), r * (cw + 2))); });
      return out.toDataURL('image/png');
    }, { ids, list: res.list, modes: ['normal', 'deutan', 'protan', 'tritan', 'gray'] });
    save(`${OUT}/cvd/L${L}_${gn}.png`, url);
  }
  // full frame 5-mode panel
  const url2 = await page.evaluate(() => {
    const f = window.QA.full, modes = ['normal', 'deutan', 'protan', 'tritan', 'gray'];
    const s = 0.5, w = f.width * s, h = f.height * s;
    const out = document.createElement('canvas'); out.width = w * 3; out.height = h * 2;
    const c = out.getContext('2d');
    modes.forEach((m, i) => { c.drawImage(window.QA.simCanvas(f, m), (i % 3) * w, Math.floor(i / 3) * h, w, h); c.fillStyle = '#fff'; c.font = '11px monospace'; c.fillText(m, (i % 3) * w + 4, Math.floor(i / 3) * h + 24); });
    return out.toDataURL('image/png');
  });
  save(`${OUT}/cvd/L${L}_full.png`, url2);
  console.log('L' + L, 'done cells', res.ncells);
}
fs.writeFileSync(`${OUT}/cvd/meta.json`, JSON.stringify(META));
await t.close();
