// QA v2 (ux lens): legibility of the thin stroke font. Records every GFX.text call per scene (scale, colour, alpha) and converts the glyph cap
// height (6 * scale logical px) and stroke width into CSS px / device px for each layout. Also measures the page-chrome DOM text sizes.
// Usage: node test/qa_v2_ux_textmetrics.mjs   -> out/qa_v2/ux/textmetrics.json + console table
import fs from 'fs';
import path from 'path';
import { open, OUT, wait } from './qa_v2_ux_lib.mjs';

const LAYOUTS = [
  { name: 'desk1', w: 1280, h: 800, dpr: 1, touch: false },
  { name: 'desk2', w: 1280, h: 800, dpr: 2, touch: false },
  { name: 'ph390', w: 390, h: 844, dpr: 3, touch: true },
  { name: 'ph360', w: 360, h: 740, dpr: 3, touch: true },
  { name: 'land844', w: 844, h: 390, dpr: 3, touch: true },
];
const lum = (hex) => { const m = /^#?([0-9a-f]{6})/i.exec(hex); if (!m) return null; const v = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const cr = (a, b) => { const x = lum(a), y = lum(b); if (x === null || y === null) return null; const [hi, lo] = x > y ? [x, y] : [y, x]; return (hi + 0.05) / (lo + 0.05); };

const out = {};
for (const L of LAYOUTS) {
  const t = await open({ ...L });
  await wait(800);
  await t.frame.evaluate(() => {
    window.__rec = null;
    const GFX = window.__fizzpop.GFX, orig = GFX.text.bind(GFX);
    GFX.text = function (ctx, s, x, y, color, o) { if (window.__rec) { const sc = (o && o.scale) || 1; const k = window.__rec; const key = sc + '|' + color + '|' + s; if (!k.has(key)) k.set(key, { s: sc, col: color, str: String(s), a: (o && o.alpha) !== undefined ? o.alpha : 1, ga: ctx.globalAlpha, y }); } return orig(ctx, s, x, y, color, o); };
  });
  const res = {};
  const scenes = ['title', 'howto0', 'howto1', 'howto2', 'howto3', 'howto4', 'howto5', 'scores', 'entry', 'story', 'play_r1', 'play_hurry', 'pause', 'ending'];
  const cssK = (await t.frame.evaluate(() => fz._main.layout())).scale;
  for (const nm of scenes) {
    await t.frame.evaluate((nm) => {
      fz.freeze(true);
      if (nm === 'title') fz.goto('title');
      else if (nm.startsWith('howto')) fz.goto('howto', { page: +nm.slice(5) });
      else if (nm === 'scores') fz.goto('scores', {});
      else if (nm === 'entry') fz.goto('entry', { entries: [{ pi: 0, score: 41000, round: 3 }] });
      else if (nm === 'story') fz.goto('story', { next: { players: 1, level: 1, seed: 3 } });
      else if (nm === 'play_r1' || nm === 'play_hurry') fz.start(1, 1, 5);
      else if (nm === 'pause') { fz.start(1, 1, 5); fz.goto('pause'); }
      else if (nm === 'ending') fz.goto('ending', { res: { won: true, level: 30, scores: [41000, 0], players: 1 }, entries: [] });
      window.__rec = new Map();
      for (let i = 0; i < 60; i++) fz.step(1);
      if (nm === 'play_hurry') { fz.Game.debug.skipIntro(); fz.Game.debug.setHurryTimer(1); for (let i = 0; i < 60; i++) fz.step(1); }
      fz._main.renderNow();
    }, nm);
    const runs = await t.frame.evaluate(() => Array.from(window.__rec.values()));
    await t.frame.evaluate(() => { window.__rec = null; });
    res[nm] = runs;
  }
  // DOM text (overlay, buttons, legend)
  const dom = await t.frame.evaluate(() => {
    const q = (sel) => { const e = document.querySelector(sel); if (!e) return null; const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return { fs: cs.fontSize, color: cs.color, bg: cs.backgroundColor, w: Math.round(r.width), h: Math.round(r.height), ls: cs.letterSpacing }; };
    return { cta: q('#focus .cta'), small: q('#focus small'), legend: q('#legend'), kbd: q('#legend kbd'), btn: q('#touch [data-k="left"]'), fire: q('#touch [data-k="fire"]'), pause: q('#touch [data-k="pause"]'), sound: q('#touch [data-k="sound"]') };
  });
  out[L.name] = { cssK, dpr: L.dpr, scenes: res, dom };
  await t.close();
}
fs.writeFileSync(path.join(OUT, 'textmetrics.json'), JSON.stringify(out, null, 1));

// ---- report ----
for (const L of LAYOUTS) {
  const o = out[L.name];
  console.log(`\n=== ${L.name}  css px per logical px = ${o.cssK.toFixed(3)}  dpr ${o.dpr}   (cap = 6*s*css; stroke = max(0.48*s, 1.1/k) logical) ===`);
  const small = new Map();
  for (const [nm, runs] of Object.entries(o.scenes)) {
    for (const r of runs) {
      const cap = 6 * r.s * o.cssK, cont = cr(r.col, '#04060d');
      const key = r.s;
      if (!small.has(key)) small.set(key, { cap, scenes: new Set(), ex: [] });
      const e = small.get(key); e.scenes.add(nm); if (e.ex.length < 3) e.ex.push(`${r.str.slice(0, 22)}@${r.col}${r.a !== 1 ? ' a' + r.a : ''}`);
    }
  }
  for (const [s, e] of [...small.entries()].sort((a, b) => a[0] - b[0])) console.log(`  scale ${s}: cap ${e.cap.toFixed(1)} css px = ${(e.cap * o.dpr).toFixed(0)} device px;  scenes: ${[...e.scenes].join(',')};  e.g. ${e.ex.join(' | ')}`);
  console.log('  DOM', JSON.stringify(o.dom));
}
