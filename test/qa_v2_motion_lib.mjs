// QA v2 "motion" lens shared helpers (frame recording, contact sheets, colour-vision simulation).
import fs from 'fs';
import path from 'path';
import { launch, fp, canvasShot } from '../tools/harness.mjs';
export { launch, fp, canvasShot };
export const OUT = '/tmp/claude-0/-home-user-wizz-cmd/513fa6d7-0d66-572a-84bd-f54579a0dbcb/scratchpad/fizzpop/out/qa_v2/motion';
export function save(file, dataUrl) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
  return file;
}
// in-page helper installer
export const PAGE_LIB = `
window.QA = window.QA || {};
QA.cv = () => document.getElementById('screen');
QA.K = () => QA.cv().width / 256;
// grab crop in logical units -> canvas (at backing resolution)
QA.grab = (x, y, w, h) => {
  const k = QA.K(); const o = document.createElement('canvas');
  o.width = Math.max(1, Math.round(w * k)); o.height = Math.max(1, Math.round(h * k));
  o.getContext('2d').drawImage(QA.cv(), Math.round(x * k), Math.round(y * k), o.width, o.height, 0, 0, o.width, o.height);
  return o;
};
QA.frames = [];
QA.push = (x, y, w, h, label) => { QA.frames.push({ c: QA.grab(x, y, w, h), label }); };
QA.reset = () => { QA.frames = []; };
// Colour vision deficiency matrices (Machado 2009, severity 1), applied in linear RGB.
QA.CVD = {
  normal: null,
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
  gray: 'gray',
};
const s2l = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const l2s = (v) => { v = Math.max(0, Math.min(1, v)); return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); };
QA.simCanvas = (src, mode) => {
  const o = document.createElement('canvas'); o.width = src.width; o.height = src.height;
  const c = o.getContext('2d'); c.drawImage(src, 0, 0);
  if (mode === 'normal') return o;
  const im = c.getImageData(0, 0, o.width, o.height), d = im.data;
  const M = QA.CVD[mode];
  const lut = new Float32Array(256); for (let i = 0; i < 256; i++) lut[i] = s2l(i);
  for (let i = 0; i < d.length; i += 4) {
    const r = lut[d[i]], g = lut[d[i + 1]], b = lut[d[i + 2]];
    if (M === 'gray') { const y = l2s(0.2126 * r + 0.7152 * g + 0.0722 * b); d[i] = d[i + 1] = d[i + 2] = y; continue; }
    d[i] = l2s(M[0][0] * r + M[0][1] * g + M[0][2] * b);
    d[i + 1] = l2s(M[1][0] * r + M[1][1] * g + M[1][2] * b);
    d[i + 2] = l2s(M[2][0] * r + M[2][1] * g + M[2][2] * b);
  }
  c.putImageData(im, 0, 0); return o;
};
// contact sheet of QA.frames -> dataURL. opts: cols, scale (extra upscale), mode, gap, bg
QA.sheet = (o = {}) => {
  const { cols = 8, scale = 1, mode = 'normal', gap = 3, bg = '#101018', label = true } = o;
  const fr = QA.frames; if (!fr.length) return null;
  const cw = Math.max(...fr.map(f => f.c.width)) * scale, ch = Math.max(...fr.map(f => f.c.height)) * scale;
  const lh = label ? 12 : 0;
  const rows = Math.ceil(fr.length / cols);
  const out = document.createElement('canvas'); out.width = cols * (cw + gap) + gap; out.height = rows * (ch + lh + gap) + gap;
  const c = out.getContext('2d'); c.fillStyle = bg; c.fillRect(0, 0, out.width, out.height);
  c.imageSmoothingEnabled = o.smooth === undefined ? false : o.smooth;
  fr.forEach((f, i) => {
    const x = gap + (i % cols) * (cw + gap), y = gap + Math.floor(i / cols) * (ch + lh + gap);
    const src = mode === 'normal' ? f.c : QA.simCanvas(f.c, mode);
    c.drawImage(src, x, y + lh, f.c.width * scale, f.c.height * scale);
    if (label) { c.fillStyle = '#9bd'; c.font = '10px monospace'; c.fillText(String(f.label === undefined ? i : f.label), x + 1, y + 9); }
  });
  return out.toDataURL('image/png');
};
// per-frame frame-difference metrics between consecutive QA.frames (mean abs diff 0..255 and luminance mean)
QA.metrics = () => {
  const res = []; let prev = null;
  for (const f of QA.frames) {
    const c = f.c.getContext('2d'); const d = c.getImageData(0, 0, f.c.width, f.c.height).data;
    let lum = 0, diff = 0, n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; lum += y; if (prev) diff += Math.abs(y - (0.2126 * prev[i] + 0.7152 * prev[i + 1] + 0.0722 * prev[i + 2])); }
    res.push({ label: f.label, lum: +(lum / n).toFixed(2), diff: prev ? +(diff / n).toFixed(3) : 0 }); prev = d;
  }
  return res;
};
`;
export async function setup(opts = {}) {
  const t = await launch(opts);
  const g = fp(t.page);
  await t.page.waitForFunction(() => !!window.__fizzpop);
  await t.page.evaluate(PAGE_LIB);
  await g.wait(600);
  await g.freeze(true);
  return { t, g, page: t.page };
}
export async function sheet(page, file, o = {}) {
  const url = await page.evaluate((o) => window.QA.sheet(o), o);
  if (!url) throw new Error('no frames');
  return save(file, url);
}
