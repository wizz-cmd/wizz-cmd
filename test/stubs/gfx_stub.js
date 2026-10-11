/* FIZZ & POP — test/stubs/gfx_stub.js
 * Stable stand-in for src/10_gfx.js implementing the FULL public API of SPEC §3.1 so other modules
 * can be developed and tested in parallel. Sprites are placeholder coloured rectangles with a 1px
 * darker outline, a frame-index tick (1..n white dots on the top edge) and a white "nose" notch on
 * the right edge so flipping is visible. Text is drawn with ctx.fillText in a monospace font on an
 * 8px grid (monospace advance exactly 8*scale). No art quality here — only API faithfulness.
 *
 * v2 additions (additive, SPEC_V2 sec. 2): setScale(k), define(), draw opts tint / glow (the tint is a flat coloured wash over the placeholder),
 * particle(ctx, kind, x, y, size, color, alpha, rot) (additive dot / ring / spark / streak drawn with plain canvas paths), postFX(ctx, q) (no-op),
 * text opts glow (ignored), theme().glow / .edge. The stub still draws at the transform it is given (logical units under setTransform(k) as well).
 *
 * Stub-only extras (NOT part of the contract, do not rely on them in production code):
 *   GFX._registry() -> [{name, w, h, frames}] — every sprite of the SPEC §3.1 table.
 */
const GFX = (() => {
  // ---- sprite registry (SPEC §3.1) ----------------------------------------------------------
  const REG = {};
  const names = [];
  const reg = (name, w, h, frames) => { REG[name] = { w, h, frames }; names.push(name); };

  for (const p of ['p1', 'p2']) {
    reg(p + '_idle', 16, 16, 2); reg(p + '_walk', 16, 16, 4); reg(p + '_jump', 16, 16, 1);
    reg(p + '_fall', 16, 16, 1); reg(p + '_shoot', 16, 16, 2); reg(p + '_die', 16, 16, 4);
    reg(p + '_stun', 16, 16, 2); reg(p + '_icon', 8, 8, 1);
  }
  reg('bubble_shot', 16, 16, 3); reg('bubble', 16, 16, 2); reg('bubble_warn', 16, 16, 2);
  reg('bubble_pop', 16, 16, 3); reg('trap_overlay', 16, 16, 3);
  for (const b of ['thunder', 'fire', 'water']) reg('bubble_' + b, 16, 16, 2);
  reg('bubble_letter', 16, 16, 2);
  const ENEMIES = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'];
  for (const e of ENEMIES) {
    reg(e + '_move', 16, 16, 4); reg(e + '_angry', 16, 16, 4);
    reg(e + '_trapped', 16, 16, 2); reg(e + '_die', 16, 16, 4);
  }
  reg('crabbit_throw', 16, 16, 1); reg('springle_squash', 16, 16, 1); reg('glimmer_fire', 16, 16, 1);
  reg('bonefin', 16, 16, 2); reg('kraken', 48, 48, 2); reg('kraken_angry', 48, 48, 2);
  reg('kraken_trapped', 64, 64, 1);
  reg('pebble', 8, 8, 2); reg('spark', 8, 8, 2); reg('ink', 8, 8, 2);
  reg('bolt', 16, 8, 2); reg('fire_drop', 8, 8, 2); reg('flame', 8, 16, 3);
  reg('water_flow', 8, 8, 2); reg('water_fall', 8, 8, 2); reg('sparkle', 8, 8, 4);
  reg('poof', 16, 16, 3);
  for (let i = 0; i < 8; i++) reg('food_' + i, 16, 16, 1);
  for (const n of ['shoes', 'pink', 'blue', 'gold', 'parasol', 'clock', 'bomb', 'heart']) reg('pu_' + n, 16, 16, 1);
  reg('moonpearl', 32, 32, 2);

  // ---- placeholder colours --------------------------------------------------------------------
  const ENEMY_COLORS = { nibbler: '#d9a441', crabbit: '#e8604c', jellop: '#b779e8', springle: '#4cc9a0', glimmer: '#4c8ae8' };
  function baseColor(name) {
    if (name.startsWith('p1_')) return '#ff6fae';
    if (name.startsWith('p2_')) return '#6fd8ff';
    if (name.startsWith('bubble') || name === 'trap_overlay') return 'rgba(110,220,255,0.55)';
    for (const e of ENEMIES) if (name.startsWith(e)) return name.includes('_angry') ? '#ff3b5c' : ENEMY_COLORS[e];
    if (name === 'bonefin') return '#e8e8f0';
    if (name.startsWith('kraken')) return name === 'kraken_angry' ? '#d12a5c' : '#8a3fd1';
    if (name.startsWith('food_')) return '#ffb347';
    if (name.startsWith('pu_')) return '#7dff8a';
    if (name === 'moonpearl') return '#f4f1c8';
    let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return `hsl(${h % 360},70%,60%)`;
  }

  // ---- sprite cache ----------------------------------------------------------------------------
  const sprites = {};
  const warned = {};
  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  function build(name, frame, flip, white, tint) {
    const { w, h } = REG[name];
    const cv = mkCanvas(w, h);
    const g = cv.getContext('2d');
    g.fillStyle = white ? '#fff' : tint || baseColor(name);
    g.fillRect(0, 0, w, h);
    if (!white) {
      g.strokeStyle = 'rgba(20,10,40,0.9)';
      g.lineWidth = 1;
      g.strokeRect(0.5, 0.5, w - 1, h - 1);
      g.fillStyle = '#fff';
      for (let i = 0; i <= frame && 2 + i * 2 < w - 1; i++) g.fillRect(2 + i * 2, 2, 1, 1);   // frame tick
      g.fillRect(w - 3, Math.floor(h / 2) - 1, 2, 3);                                         // "nose" (faces right)
    }
    if (!flip) return cv;
    const out = mkCanvas(w, h);
    const o = out.getContext('2d');
    o.translate(w, 0); o.scale(-1, 1); o.drawImage(cv, 0, 0);
    return out;
  }

  function getSprite(name, frame, flip, white, tint) {
    const k = name + '|' + frame + '|' + (flip ? 1 : 0) + '|' + (white ? 1 : 0) + '|' + (tint || '');
    return sprites[k] || (sprites[k] = build(name, frame, flip, white, tint));
  }

  // ---- public API ------------------------------------------------------------------------------
  const has = (name) => Object.prototype.hasOwnProperty.call(REG, name);
  const frames = (name) => (has(name) ? REG[name].frames : 0);
  const size = (name) => (has(name) ? { w: REG[name].w, h: REG[name].h } : { w: 0, h: 0 });
  function init() { /* nothing to prebuild; idempotent */ }

  function draw(ctx, name, frame, x, y, opts) {
    if (!has(name)) {
      if (!warned[name]) { warned[name] = true; console.warn('GFX stub: unknown sprite ' + name); }
      ctx.fillStyle = '#f0f'; ctx.fillRect(Math.round(x), Math.round(y), 16, 16);
      return;
    }
    const o = opts || {};
    const f = ((Math.floor(frame) % REG[name].frames) + REG[name].frames) % REG[name].frames;
    const cv = getSprite(name, f, !!o.flip, !!o.white, o.tint);
    const a = o.alpha === undefined ? 1 : o.alpha;
    if (a !== 1) { const prev = ctx.globalAlpha; ctx.globalAlpha = prev * a; ctx.drawImage(cv, Math.round(x), Math.round(y)); ctx.globalAlpha = prev; }
    else ctx.drawImage(cv, Math.round(x), Math.round(y));
  }

  const GLYPHS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?.,:;-+=&'\"/()%*#<>_\u00a9\u2665\u2605\u2190\u2192";
  const textWidth = (str, scale = 1) => Array.from(String(str)).length * 8 * scale;

  function text(ctx, str, x, y, color = '#fff', opts) {
    const o = opts || {};
    const scale = o.scale || 1;
    const shadow = o.shadow !== false;
    const s = Array.from(String(str).toUpperCase(), (ch) => (GLYPHS.indexOf(ch) < 0 ? '?' : ch)).join('');
    const w = s.length * 8 * scale;
    const x0 = Math.round(o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x);
    ctx.save();
    ctx.translate(x0, Math.round(y));
    ctx.scale(scale, scale);
    ctx.font = 'bold 10px monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    for (let i = 0; i < s.length; i++) {
      if (s[i] === ' ') continue;
      if (s[i] === '_') {                                    // underscore sits below the em box: draw as a bar
        if (shadow) { ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(i * 8 + 2, 7, 6, 1); }
        ctx.fillStyle = color; ctx.fillRect(i * 8 + 1, 6, 6, 1);
        continue;
      }
      if (shadow) { ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillText(s[i], i * 8 + 5, 0); }
      ctx.fillStyle = color;
      ctx.fillText(s[i], i * 8 + 4, -1);
    }
    ctx.restore();
  }

  const THEMES = [
    { bg: '#14080f', accent: '#ff7a8a', accent2: '#ffb347', glow: '#ff6f9c', edge: '#ff9db8', name: 'Coral Reef' },
    { bg: '#07140d', accent: '#4fbf6b', accent2: '#b7c94a', glow: '#2fe0a4', edge: '#7fe8c0', name: 'Kelp Forest' },
    { bg: '#120d08', accent: '#b5793f', accent2: '#e0b84a', glow: '#d6a24c', edge: '#f4dc9c', name: 'Sunken Ship' },
    { bg: '#08101c', accent: '#4fd8f0', accent2: '#a779ff', glow: '#3cf2ff', edge: '#9cecff', name: 'Crystal Caves' },
    { bg: '#120808', accent: '#e0502a', accent2: '#ffb02e', glow: '#ff6a3d', edge: '#ffb08a', name: 'Volcanic Vents' },
    { bg: '#060a1c', accent: '#3b58c8', accent2: '#e8c04a', glow: '#8a5cff', edge: '#c8b4ff', name: 'Abyss Temple' },
  ];
  const theme = (levelIndex) => THEMES[Math.max(0, Math.min(5, Math.floor(levelIndex / 5)))];

  function shade(hex, amt) {            // lighten (amt>0) / darken (amt<0) a #rrggbb colour
    const n = parseInt(hex.slice(1), 16);
    const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v + (amt > 0 ? (255 - v) : v) * amt))));
    return 'rgb(' + ch.join(',') + ')';
  }

  const levelCache = {};
  function levelCanvas(levelIndex, map) {
    if (levelCache[levelIndex]) return levelCache[levelIndex];
    const cv = mkCanvas(256, 208);
    const g = cv.getContext('2d');
    const th = theme(levelIndex);
    const accent = shade(th.accent, ((levelIndex % 5) - 2) * 0.1);   // 5 variants per theme
    const solid = (c, r) => r >= 0 && r < 26 && c >= 0 && c < 32 && map[r][c] === '#';
    g.fillStyle = 'rgba(0,0,0,0.45)';                       // drop shadows first (lower-right)
    for (let r = 0; r < 26; r++) for (let c = 0; c < 32; c++) if (solid(c, r)) g.fillRect(c * 8 + 3, r * 8 + 3, 8, 8);
    for (let r = 0; r < 26; r++) {
      for (let c = 0; c < 32; c++) {
        if (!solid(c, r)) continue;
        g.fillStyle = accent; g.fillRect(c * 8, r * 8, 8, 8);
        g.fillStyle = th.accent2; g.fillRect(c * 8, r * 8, 8, 1); g.fillRect(c * 8, r * 8, 1, 8);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(c * 8 + 7, r * 8, 1, 8); g.fillRect(c * 8, r * 8 + 7, 8, 1);
      }
    }
    return (levelCache[levelIndex] = cv);
  }

  function drawLogo(ctx, cx, y, t) {
    const s = 'FIZZ & POP';
    const scale = 2.4;
    const total = s.length * 8 * scale;
    for (let i = 0; i < s.length; i++) {
      const wob = Math.round(Math.sin(t / 12 + i * 0.7) * 3);
      const col = i % 2 ? '#6fd8ff' : '#ff6fae';
      text(ctx, s[i], cx - total / 2 + i * 8 * scale, y + wob + 12, col, { scale });
    }
  }

  function sheet() {
    const W = 640;
    const cells = names.map((n) => ({ n, ...REG[n] }));
    let x = 4, y = 4, rowH = 0;
    const place = cells.map((c) => {
      const cw = Math.max(c.frames * (c.w + 2), textWidth(c.n)) + 8;
      const ch = c.h + 14;
      if (x + cw > W) { x = 4; y += rowH + 4; rowH = 0; }
      const p = { c, x, y, cw };
      x += cw; rowH = Math.max(rowH, ch);
      return p;
    });
    const cv = mkCanvas(W, y + rowH + 8);
    const g = cv.getContext('2d');
    g.fillStyle = '#10101c'; g.fillRect(0, 0, cv.width, cv.height);
    for (const { c, x: px, y: py } of place) {
      text(g, c.n, px, py, '#9ab', { shadow: false });
      for (let f = 0; f < c.frames; f++) draw(g, c.n, f, px + f * (c.w + 2), py + 10);
    }
    return cv;
  }

  // ---- v2 additions ---------------------------------------------------------------------------------------------------------
  let SCALE = 1;
  const setScale = (k) => { SCALE = k; };
  const defined = {};
  function define(name, spec) { if (!name || !spec || typeof spec.draw !== 'function') return false; defined[name] = spec; return true; }
  function particle(ctx, kind, x, y, size, color, alpha) {
    alpha = alpha === undefined ? 1 : alpha;
    if (!(alpha > 0.003) || !(size > 0)) return;
    const gco = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * Math.min(1, alpha);
    ctx.fillStyle = color || '#fff'; ctx.strokeStyle = color || '#fff';
    if (kind === 'ring') { ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(x, y, kind === 'dot' ? size * 1.6 : kind === 'streak' ? size * 0.3 : size, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalCompositeOperation = gco; ctx.globalAlpha = ga;
  }
  function postFX() { /* the stub has no post pass */ }

  const _registry = () => names.map((n) => ({ name: n, w: REG[n].w, h: REG[n].h, frames: REG[n].frames }));

  return { init, draw, frames, size, has, text, textWidth, levelCanvas, theme, drawLogo, sheet, setScale, define, particle, postFX, _registry };
})();
