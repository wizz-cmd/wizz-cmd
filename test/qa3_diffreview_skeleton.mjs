// Artifact fragment inside a skeleton that pads :root by safe-area insets (no env()): do canvas AND touch pads stay inside the padded box?
import { launch, log, check } from './qa3_diffreview_lib.mjs';
import fs from 'fs'; import path from 'path';
const frag = fs.readFileSync('dist/fizzpop.artifact.html', 'utf8');
const mk = (pad) => `<!doctype html><html lang="en" style="padding:${pad}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html{box-sizing:border-box;margin:0}body{margin:0}</style></head><body>${frag}</body></html>`;
const out = [];
for (const [label, vp, pad] of [['portrait notch', [390, 844], '47px 0 34px 0'], ['landscape notch', [844, 390], '0 47px 0 47px'], ['landscape asym', [844, 390], '0 34px 0 59px'], ['portrait side', [390, 844], '20px 24px 20px 24px']]) {
  const file = path.resolve('out/qa3/diffreview/skel.html'); fs.writeFileSync(file, mk(pad));
  const t = await launch({ html: file, viewport: { width: vp[0], height: vp[1] }, touch: true, deviceScaleFactor: 3 });
  await t.page.waitForFunction(() => !!window.__fizzpop); await t.page.evaluate(() => window.__fizzpop.scene()); await t.page.waitForTimeout(500);
  const m = await t.page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const pad = { l: parseFloat(cs.paddingLeft), r: parseFloat(cs.paddingRight), t: parseFloat(cs.paddingTop), b: parseFloat(cs.paddingBottom) };
    const rect = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
    return { pad, vw: innerWidth, vh: innerHeight, canvas: rect(document.getElementById('screen')), btns: [...document.querySelectorAll('#touch button')].map((b) => ({ k: b.dataset.k, ...rect(b) })), mode: window.__fizzpop._main.layout().mode, sw: document.documentElement.scrollWidth };
  });
  const bad = [];
  const inside = (r, k) => r.l >= m.pad.l - 0.5 && r.r <= m.vw - m.pad.r + 0.5 && r.t >= m.pad.t - 0.5 && r.b <= m.vh - m.pad.b + 0.5;
  if (!inside(m.canvas)) bad.push('canvas outside padded box');
  for (const b of m.btns) if (b.w > 0 && !inside(b)) bad.push(`btn ${b.k} outside padded box (l=${b.l.toFixed(0)} r=${b.r.toFixed(0)} t=${b.t.toFixed(0)} b=${b.b.toFixed(0)})`);
  if (m.sw > m.vw + 1) bad.push('hscroll');
  log(label, pad, 'mode', m.mode, 'canvas', [m.canvas.l, m.canvas.t, m.canvas.w, m.canvas.h].map(Math.round).join(','), bad.length ? 'BAD: ' + bad.join('; ') : 'ok');
  out.push({ label, bad });
  await t.close();
}
check('SK1 canvas and touch pads respect :root padding (safe-area skeleton)', out.every((o) => o.bad.length === 0), out.filter((o) => o.bad.length));
