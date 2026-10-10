// QA visual shared helpers: crop/zoom of the live #screen canvas, montage of several crops.
import fs from 'fs';
import path from 'path';
export async function crop(page, file, x, y, w, h, scale = 6) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const url = await page.evaluate(({ x, y, w, h, scale }) => {
    const cv = document.getElementById('screen');
    const out = document.createElement('canvas'); out.width = w * scale; out.height = h * scale;
    const c = out.getContext('2d'); c.imageSmoothingEnabled = false;
    c.drawImage(cv, x, y, w, h, 0, 0, w * scale, h * scale);
    return out.toDataURL('image/png');
  }, { x, y, w, h, scale });
  fs.writeFileSync(file, Buffer.from(url.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
// montage: capture several (x,y,w,h) crops at different times via cb, then lay them out in a row/grid
export async function montage(page, file, tiles, { scale = 4, cols = 4, gap = 4, bg = '#000', label = true } = {}) {
  // tiles: [{dataUrl, w, h, label}]
  const url = await page.evaluate(async ({ tiles, scale, cols, gap, bg, label }) => {
    const imgs = await Promise.all(tiles.map(t => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = t.dataUrl; })));
    const cw = Math.max(...tiles.map(t => t.w)) * scale, ch = Math.max(...tiles.map(t => t.h)) * scale + (label ? 14 : 0);
    const rows = Math.ceil(tiles.length / cols);
    const out = document.createElement('canvas'); out.width = cols * (cw + gap) + gap; out.height = rows * (ch + gap) + gap;
    const c = out.getContext('2d'); c.imageSmoothingEnabled = false; c.fillStyle = bg; c.fillRect(0, 0, out.width, out.height);
    tiles.forEach((t, i) => {
      const cx = gap + (i % cols) * (cw + gap), cy = gap + Math.floor(i / cols) * (ch + gap);
      c.drawImage(imgs[i], cx, cy + (label ? 14 : 0), t.w * scale, t.h * scale);
      if (label) { c.fillStyle = '#9ab'; c.font = '11px monospace'; c.fillText(t.label || '', cx, cy + 10); }
    });
    return out.toDataURL('image/png');
  }, { tiles, scale, cols, gap, bg, label });
  fs.writeFileSync(file, Buffer.from(url.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
export const grab = (page, x, y, w, h) => page.evaluate(({ x, y, w, h }) => {
  const cv = document.getElementById('screen');
  const o = document.createElement('canvas'); o.width = w; o.height = h;
  o.getContext('2d').drawImage(cv, x, y, w, h, 0, 0, w, h);
  return o.toDataURL('image/png');
}, { x, y, w, h });
