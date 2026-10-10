// QA balance lens: render each round's level with air attractors (cyan +), bubble settle clusters (boxes, colour = frames a player
// needs to touch it: green <100, yellow <200, orange <300, red = unreachable) and grounded reachable player spots (white dots).
import { launch, canvasFnShot, fp, PROJECT } from '../tools/harness.mjs';
import fs from 'fs'; import path from 'path';
import { OUT, LEVELS, loadReach, pad2 } from './qa_balance_lib.mjs';
const args = process.argv.slice(2);
const levels = (args[0] || 'all') === 'all' ? Array.from({ length: 30 }, (_, i) => i + 1) : args[0].split(',').map(Number);
const t = await launch(); const g = fp(t.page); await g.freeze(true);
for (const lv of levels) {
  const air = JSON.parse(fs.readFileSync(path.join(OUT, `air_${pad2(lv)}.json`)));
  const R = loadReach(lv, 1);
  const data = { lv, att: LEVELS[lv - 1].air, res: air.results.filter((x) => !x.err).map((x) => ({ s: [x.sx, x.sy], d: x.dir, st: x.settle, ts: x.tSettle })), nodes: R.nodes.map((n) => [n[0], n[1]]),
    enemies: LEVELS[lv - 1].enemies };
  await canvasFnShot(t.page, path.join(OUT, 'air', `air_${pad2(lv)}.png`), (d) => {
    const S = 3;
    const lvl = fz.GFX.levelCanvas(d.lv - 1, fz.LEVELS[d.lv - 1].map);
    const c = document.createElement('canvas'); c.width = 256 * S; c.height = 208 * S; const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    x.fillStyle = '#10182c'; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(lvl, 0, 0, 256 * S, 208 * S);
    x.fillStyle = 'rgba(255,255,255,0.55)';
    for (const [nx, ny] of d.nodes) x.fillRect((nx + 8) * S - 1, (ny + 16 - 16) * S + 14 * S - 1, 2, 2); // foot centre
    for (const e of d.enemies) { x.strokeStyle = '#ff40ff'; x.lineWidth = 2; x.strokeRect(e.c * 8 * S, e.r * 8 * S, 16 * S, 16 * S); x.fillStyle = '#ff40ff'; x.font = 'bold 14px monospace'; x.fillText(e.t[0].toUpperCase(), e.c * 8 * S + 2, e.r * 8 * S + 14); }
    const cnt = new Map();
    for (const r of d.res) { const k = Math.round(r.st[0]) + ',' + Math.round(r.st[1]); const o = cnt.get(k) || { n: 0, x: r.st[0], y: r.st[1], ts: [] }; o.n++; o.ts.push(r.ts); cnt.set(k, o); }
    for (const o of cnt.values()) {
      const un = o.ts.filter((v) => v === null).length; const ok = o.ts.filter((v) => v !== null); const med = ok.length ? ok.sort((a, b) => a - b)[Math.floor(ok.length / 2)] : 1e9;
      const col = un === o.ts.length ? '#ff2020' : med < 100 ? '#40ff60' : med < 200 ? '#ffe040' : '#ff9020';
      x.strokeStyle = col; x.lineWidth = 2; x.strokeRect(o.x * S, (o.y - 16) * S, 16 * S, 16 * S);
      x.fillStyle = col; x.font = 'bold 12px monospace'; x.fillText(o.n + (un ? '(!' + un + ')' : ''), o.x * S + 2, (o.y - 16) * S + 12);
    }
    x.strokeStyle = '#00ffff'; x.lineWidth = 2;
    for (const a of d.att) { const ax = a[0] * 8 * S, ay = a[1] * 8 * S; x.beginPath(); x.moveTo(ax - 8, ay); x.lineTo(ax + 8, ay); x.moveTo(ax, ay - 8); x.lineTo(ax, ay + 8); x.stroke(); }
    return c;
  }, { args: [data], scale: 1 });
}
console.log(t.errors.length ? 'ERR ' + t.errors : 'ok'); await t.close();
